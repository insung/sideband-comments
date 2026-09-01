import { chmod, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { normalizeDocumentPath, type ThreadEvent } from "@sideband-comments/core";
import { JsonlThreadRepository } from "@sideband-comments/jsonl-store";
import { migrateTandemDocument } from "./tandem.js";

export interface FileMigrationOptions {
  write?: boolean;
}

export interface FileMigrationResult {
  documentPath: string;
  threadCount: number;
  eventCount: number;
  written: boolean;
}

function sameEvents(left: readonly ThreadEvent[], right: readonly ThreadEvent[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function migrateFile(
  workspaceRoot: string,
  markdownFile: string,
  options: FileMigrationOptions = {}
): Promise<FileMigrationResult> {
  const root = resolve(workspaceRoot);
  const file = resolve(markdownFile);
  const relativePath = relative(root, file);
  if (!relativePath || relativePath === ".." || relativePath.startsWith("../") || isAbsolute(relativePath)) {
    throw new Error("Markdown file must be inside the workspace root");
  }
  const documentPath = normalizeDocumentPath(relativePath);
  const raw = await readFile(file, "utf8");
  const migration = migrateTandemDocument(documentPath, raw, () => "tandem-migration");
  const entries = Object.entries(migration.eventsByThread);
  const eventCount = entries.reduce((sum, [, events]) => sum + events.length, 0);
  if (!options.write || entries.length === 0) {
    return { documentPath, threadCount: entries.length, eventCount, written: false };
  }

  const repository = new JsonlThreadRepository(root);
  for (const [threadId, events] of entries) {
    const existing = await repository.readEvents(threadId);
    if (existing.length > 0 && !sameEvents(existing, events)) {
      throw new Error(`thread ${threadId} already exists with different events`);
    }
    if (existing.length === 0) for (const event of events) await repository.append(event);
  }

  const info = await stat(file);
  const temporary = `${file}.sideband-migrate-${process.pid}-${Date.now()}`;
  await writeFile(temporary, migration.markdown, { encoding: "utf8", mode: info.mode });
  await chmod(temporary, info.mode);
  await rename(temporary, file);
  return { documentPath, threadCount: entries.length, eventCount, written: true };
}
