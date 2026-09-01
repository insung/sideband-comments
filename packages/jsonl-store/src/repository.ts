import { mkdir, open, readFile, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  foldThread,
  isThreadEvent,
  normalizeDocumentPath,
  type ThreadEvent,
  type ThreadState
} from "@sideband-comments/core";

const THREAD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function assertThreadId(id: string): void {
  if (!THREAD_ID.test(id) || id.includes("..")) throw new Error(`invalid thread id: ${id}`);
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class JsonlThreadRepository {
  readonly commentsDirectory: string;
  readonly threadsDirectory: string;

  constructor(readonly workspaceRoot: string) {
    this.commentsDirectory = join(workspaceRoot, ".comments");
    this.threadsDirectory = join(this.commentsDirectory, "threads");
  }

  threadFile(threadId: string): string {
    assertThreadId(threadId);
    return join(this.threadsDirectory, `${threadId}.jsonl`);
  }

  private async withLock<T>(threadId: string, operation: () => Promise<T>): Promise<T> {
    await mkdir(this.threadsDirectory, { recursive: true });
    const lockPath = `${this.threadFile(threadId)}.lock`;
    const deadline = Date.now() + 3000;
    let handle;
    while (!handle) {
      try {
        handle = await open(lockPath, "wx");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EEXIST") throw error;
        try {
          const info = await stat(lockPath);
          if (Date.now() - info.mtimeMs > 10_000) await unlink(lockPath);
        } catch (statError) {
          if ((statError as NodeJS.ErrnoException).code !== "ENOENT") throw statError;
        }
        if (Date.now() >= deadline) throw new Error(`timed out waiting for thread lock: ${threadId}`);
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

  async append(event: ThreadEvent): Promise<void> {
    assertThreadId(event.threadId);
    await this.withLock(event.threadId, async () => {
      const file = await open(this.threadFile(event.threadId), "a");
      try {
        await file.write(`${JSON.stringify(event)}\n`);
        await file.sync();
      } finally {
        await file.close();
      }
    });
  }

  async readEvents(threadId: string): Promise<ThreadEvent[]> {
    const file = this.threadFile(threadId);
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return raw.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new Error(`${file}:${index + 1}: invalid JSON`);
      }
      if (!isThreadEvent(value)) throw new Error(`${file}:${index + 1}: invalid sideband event`);
      return value;
    });
  }

  async read(threadId: string): Promise<ThreadState | undefined> {
    const events = await this.readEvents(threadId);
    return events.length ? foldThread(events) : undefined;
  }

  async list(): Promise<ThreadState[]> {
    let entries: string[];
    try {
      entries = await readdir(this.threadsDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const ids = entries.filter((entry) => entry.endsWith(".jsonl")).map((entry) => entry.slice(0, -6)).sort();
    const states = await Promise.all(ids.map((id) => this.read(id)));
    return states.filter((state): state is ThreadState => state !== undefined);
  }

  async listByDocument(documentPath: string): Promise<ThreadState[]> {
    const normalized = normalizeDocumentPath(documentPath);
    return (await this.list()).filter((thread) => thread.documentPath === normalized);
  }

  async nextRevision(threadId: string): Promise<number> {
    const events = await this.readEvents(threadId);
    return events.reduce((maximum, event) => Math.max(maximum, event.revision), -1) + 1;
  }
}
