import { describe, expect, it } from "vitest";
import { mapRenamedDocument, workspaceRelativePath } from "../src/paths.js";

describe("VS Code document path mapping", () => {
  it("uses portable workspace-relative paths", () => {
    expect(workspaceRelativePath("/work/repo", "/work/repo/docs/a.md")).toBe("docs/a.md");
  });

  it("rejects documents outside the workspace", () => {
    expect(() => workspaceRelativePath("/work/repo", "/work/other/a.md")).toThrow(/outside/i);
  });

  it("maps files nested under a renamed directory", () => {
    expect(mapRenamedDocument("docs/old/a.md", "docs/old", "docs/new")).toBe("docs/new/a.md");
    expect(mapRenamedDocument("docs/other.md", "docs/old", "docs/new")).toBeUndefined();
  });
});
