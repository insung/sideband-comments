import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";

/** A directory carrying one of these is treated as the project a document belongs to. */
const ROOT_MARKERS = [".comments", ".git"];

/**
 * Finds the store root for a file that is not inside an open workspace folder.
 *
 * Comments live beside the document in `<root>/.comments`, so the root has to be the
 * unit people already share: an existing comment store, or the repository (including a
 * `git worktree`, whose root holds a `.git` file rather than a directory).
 */
export function findProjectRoot(
  filePath: string,
  exists: (path: string) => boolean = existsSync
): string | undefined {
  const stop = parse(filePath).root;
  let directory = dirname(filePath);
  for (;;) {
    if (ROOT_MARKERS.some((marker) => exists(join(directory, marker)))) return directory;
    const parent = dirname(directory);
    if (directory === stop || parent === directory) return undefined;
    directory = parent;
  }
}
