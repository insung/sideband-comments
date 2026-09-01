#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { migrateFile } from "./file-migration.js";

async function markdownFiles(root: string, directory = root): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === ".comments" || entry.name === "node_modules" || entry.name === ".obsidian") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await markdownFiles(root, path));
    else if (entry.isFile() && entry.name.endsWith(".md")) result.push(path);
  }
  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  if (positional.length === 0 || args.includes("--help")) {
    console.log("Usage: sideband-migrate <workspace-root> [markdown-files...] [--write]");
    console.log("Without --write, reports the migration plan and changes nothing.");
    return;
  }
  const root = resolve(positional[0]!);
  const targets = positional.length > 1
    ? positional.slice(1).map((file) => resolve(root, file))
    : await markdownFiles(root);
  let threads = 0;
  let files = 0;
  for (const target of targets) {
    const result = await migrateFile(root, target, { write });
    if (result.threadCount === 0) continue;
    files++;
    threads += result.threadCount;
    console.log(`${write ? "migrated" : "would migrate"}: ${result.documentPath} (${result.threadCount} threads)`);
  }
  console.log(`${write ? "migrated" : "dry-run"}: ${files} files, ${threads} threads`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
