import { mkdir, open, readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  foldThread,
  isThreadEvent,
  normalizeDocumentPath,
  type ThreadEvent,
  type ThreadState
} from "@sideband-comments/core";
import {
  convertAnchoredV2Events,
  isAnchoredV2Event,
  type AnchoredV2Event
} from "./anchored-v2.js";

const THREAD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function assertThreadId(id: string): void {
  if (!THREAD_ID.test(id) || id.includes("..")) throw new Error(`invalid thread id: ${id}`);
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

interface StoreSnapshot {
  /** Every event known to the store, grouped by thread. */
  readonly events: Map<string, ThreadEvent[]>;
  /** Document bundle that already holds a thread, for threads stored under `documents/`. */
  readonly bundles: Map<string, string>;
}

export interface LegacyMigrationResult {
  readonly removedFiles: number;
  readonly documentFiles: number;
}

export class JsonlThreadRepository {
  readonly commentsDirectory: string;
  readonly threadsDirectory: string;
  readonly documentsDirectory: string;

  constructor(readonly workspaceRoot: string) {
    this.commentsDirectory = join(workspaceRoot, ".comments");
    this.threadsDirectory = join(this.commentsDirectory, "threads");
    this.documentsDirectory = join(this.commentsDirectory, "documents");
  }

  threadFile(threadId: string): string {
    assertThreadId(threadId);
    return join(this.threadsDirectory, `${threadId}.jsonl`);
  }

  private async withLock<T>(threadId: string, operation: () => Promise<T>): Promise<T> {
    await mkdir(this.commentsDirectory, { recursive: true });
    const lockPath = join(this.commentsDirectory, "store.lock");
    const deadline = Date.now() + 3000;
    let handle;
    while (!handle) {
      try {
        handle = await open(lockPath, "wx");
        await handle.writeFile(String(process.pid));
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EEXIST") throw error;
        if (Date.now() >= deadline) {
          throw new Error(`comment storage is locked (${threadId}). If both editors have stopped, remove ${lockPath} and retry.`);
        }
        await wait(25);
      }
    }
    try {
      return await operation();
    } finally {
      await handle.close();
      await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  private async files(directory: string): Promise<string[]> {
    const entries = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [] as string[];
      throw error;
    });
    return entries.filter((name) => name.endsWith(".jsonl")).sort().map((name) => join(directory, name));
  }

  /** Reads both the legacy per-thread files and the per-document bundles into one view. */
  private async snapshot(): Promise<StoreSnapshot> {
    const events = new Map<string, ThreadEvent[]>();
    const bundles = new Map<string, string>();
    for (const directory of [this.threadsDirectory, this.documentsDirectory]) {
      for (const file of await this.files(directory)) {
        const id = file.slice(directory.length + 1, -6);
        const parsed = await this.parseFile(file, id);
        if (directory === this.threadsDirectory && parsed.some((event) => event.threadId !== id)) {
          throw new Error(`legacy thread id does not match its filename: ${file}`);
        }
        for (const event of parsed) {
          const group = events.get(event.threadId) ?? [];
          const duplicate = group.find((existing) => existing.eventId === event.eventId);
          if (duplicate && !isDeepStrictEqual(duplicate, event)) {
            throw new Error(`conflicting event ${event.eventId} in ${file}`);
          }
          if (!duplicate) group.push(event);
          events.set(event.threadId, group);
          if (directory === this.documentsDirectory) {
            const previous = bundles.get(event.threadId);
            if (previous && previous !== file) throw new Error(`thread occurs in multiple document bundles: ${event.threadId}`);
            bundles.set(event.threadId, file);
          }
        }
      }
    }
    return { events, bundles };
  }

  private bundleFor(path: string, snapshot: StoreSnapshot): string | undefined {
    for (const [id, events] of snapshot.events) {
      if (foldThread(events).documentPath === path && snapshot.bundles.has(id)) return snapshot.bundles.get(id);
    }
    return undefined;
  }

  private async writeEvents(file: string, events: readonly ThreadEvent[]): Promise<void> {
    if (!events.length) return;
    await mkdir(this.documentsDirectory, { recursive: true });
    const handle = await open(file, "a");
    try {
      await handle.writeFile(events.map((event) => `${JSON.stringify(event)}\n`).join(""));
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async append(event: ThreadEvent): Promise<void> {
    assertThreadId(event.threadId);
    await this.withLock(event.threadId, async () => {
      const snapshot = await this.snapshot();
      const previous = snapshot.events.get(event.threadId) ?? [];
      const duplicate = previous.find((existing) => existing.eventId === event.eventId);
      if (duplicate) {
        if (!isDeepStrictEqual(duplicate, event)) throw new Error(`conflicting event ${event.eventId}`);
        return;
      }
      const path = previous.length
        ? foldThread(previous).documentPath
        : event.type === "thread.created" ? normalizeDocumentPath(event.documentPath) : undefined;
      if (!path) throw new Error(`thread not found: ${event.threadId}`);
      const file = snapshot.bundles.get(event.threadId)
        ?? this.bundleFor(path, snapshot)
        ?? join(this.documentsDirectory, `${randomUUID()}.jsonl`);
      await this.writeEvents(file, snapshot.bundles.has(event.threadId) ? [event] : [...previous, event]);
    });
  }

  /** Explicit compaction; callers must stop older clients before migrating their store. */
  async migrateLegacy(): Promise<LegacyMigrationResult> {
    return this.withLock("migration", async () => {
      let removedFiles = 0;
      for (const file of await this.files(this.threadsDirectory)) {
        const original = await readFile(file, "utf8");
        const id = file.slice(this.threadsDirectory.length + 1, -6);
        const snapshot = await this.snapshot();
        const events = snapshot.events.get(id);
        if (!events?.length) continue;
        const target = snapshot.bundles.get(id)
          ?? this.bundleFor(foldThread(events).documentPath, snapshot)
          ?? join(this.documentsDirectory, `${randomUUID()}.jsonl`);
        const stored = await this.parseFile(target, id);
        await this.writeEvents(target, events.filter((event) => !stored.some((item) => item.eventId === event.eventId)));
        const verified = await this.parseFile(target, id);
        if (!events.every((event) => verified.some((item) => isDeepStrictEqual(item, event)))) {
          throw new Error(`bundle verification failed: ${file}`);
        }
        if (await readFile(file, "utf8") !== original) throw new Error(`legacy file changed during migration: ${file}`);
        await unlink(file);
        removedFiles++;
      }
      return { removedFiles, documentFiles: (await this.files(this.documentsDirectory)).length };
    });
  }

  async readEvents(threadId: string): Promise<ThreadEvent[]> {
    assertThreadId(threadId);
    return (await this.snapshot()).events.get(threadId) ?? [];
  }

  private async parseFile(file: string, threadId: string): Promise<ThreadEvent[]> {
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const sideband: ThreadEvent[] = [];
    const anchored: AnchoredV2Event[] = [];
    raw.split(/\r?\n/).forEach((line, index) => {
      if (!line.trim()) return;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new Error(`${file}:${index + 1}: invalid JSON`);
      }
      if (isThreadEvent(value)) sideband.push(value);
      else if (isAnchoredV2Event(value)) anchored.push(value);
      else throw new Error(`${file}:${index + 1}: invalid sideband or Anchored Comments v2 event`);
    });
    try {
      return [...convertAnchoredV2Events(anchored, threadId), ...sideband];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${file}: invalid Anchored Comments v2 log: ${message}`);
    }
  }

  async read(threadId: string): Promise<ThreadState | undefined> {
    const events = await this.readEvents(threadId);
    return events.length ? foldThread(events) : undefined;
  }

  async list(includeHidden = false): Promise<ThreadState[]> {
    const snapshot = await this.snapshot();
    return [...snapshot.events.values()]
      .map((events) => foldThread(events))
      .filter((state) => includeHidden || (!state.deleted && state.comments.length > 0));
  }

  async listByDocument(documentPath: string, includeHidden = false): Promise<ThreadState[]> {
    const normalized = normalizeDocumentPath(documentPath);
    return (await this.list(includeHidden)).filter((thread) => thread.documentPath === normalized);
  }

  async nextRevision(threadId: string): Promise<number> {
    const events = await this.readEvents(threadId);
    return events.reduce((maximum, event) => Math.max(maximum, event.revision), -1) + 1;
  }
}
