import { describe, expect, it } from "vitest";
import { findProjectRoot } from "../src/project-root.js";

const tree = (paths: readonly string[]) => (path: string) => paths.includes(path);

describe("findProjectRoot", () => {
  it("finds the git worktree a file outside the workspace belongs to", () => {
    const worktree = "/Users/me/Github/mi/.worktrees/design";
    const exists = tree([`${worktree}/.git`]);

    expect(findProjectRoot(`${worktree}/docs/notes/harness.md`, exists)).toBe(worktree);
  });

  it("prefers the nearest root when projects are nested", () => {
    const outer = "/repo";
    const inner = "/repo/packages/app";
    const exists = tree([`${outer}/.git`, `${inner}/.comments`]);

    expect(findProjectRoot(`${inner}/src/index.ts`, exists)).toBe(inner);
  });

  it("accepts an existing comment store as the root marker", () => {
    const exists = tree(["/notes/.comments"]);

    expect(findProjectRoot("/notes/daily/today.md", exists)).toBe("/notes");
  });

  it("returns the directory itself when the file sits at the root", () => {
    const exists = tree(["/repo/.git"]);

    expect(findProjectRoot("/repo/README.md", exists)).toBe("/repo");
  });

  it("gives up rather than guessing when nothing marks a project", () => {
    expect(findProjectRoot("/tmp/scratch/note.md", tree([]))).toBeUndefined();
  });
});
