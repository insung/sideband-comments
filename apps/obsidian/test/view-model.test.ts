import { describe, expect, it } from "vitest";
import type { ThreadState } from "@sideband-comments/core";
import {
  buildDocumentTree,
  buildThreadViewModels,
  groupThreadViewModels,
  resolvedToggleLabel,
  selectionPreviewText,
  selectDocumentPath
} from "../src/view-model.js";

const thread: ThreadState = {
  id: "t1",
  documentPath: "note.md",
  originalAnchor: { exact: "target", prefix: "", suffix: "", position: 0 },
  anchor: { exact: "target", prefix: "", suffix: "", position: 0 },
  status: "open",
  deleted: false,
  comments: [{
    id: "c1",
    author: { id: "user", name: "User" },
    createdAt: "2026-09-01T00:00:00.000Z",
    body: "Review"
  }],
  revision: 0,
  updatedAt: "2026-09-01T00:00:00.000Z"
};

describe("Obsidian sidebar view model", () => {
  it("marks anchors as resolved or orphaned against current Markdown", () => {
    expect(buildThreadViewModels("target text", [thread])[0]?.anchorState).toBe("resolved");
    expect(buildThreadViewModels("changed text", [thread])[0]?.anchorState).toBe("orphaned");
  });

  it("filters resolved threads only when requested", () => {
    const resolved = { ...thread, id: "t2", status: "resolved" as const };
    expect(buildThreadViewModels("target", [thread, resolved], false).map((item) => item.id)).toEqual(["t1"]);
    expect(buildThreadViewModels("target", [thread, resolved], true)).toHaveLength(2);
  });

  it("groups vault-wide comments by document path", () => {
    const models = [
      ...buildThreadViewModels("target", [{ ...thread, id: "b", documentPath: "notes/b.md" }]),
      ...buildThreadViewModels("target", [{ ...thread, id: "a", documentPath: "notes/a.md" }])
    ];

    expect(groupThreadViewModels(models).map((group) => ({
      path: group.documentPath,
      ids: group.threads.map((item) => item.id)
    }))).toEqual([
      { path: "notes/a.md", ids: ["a"] },
      { path: "notes/b.md", ids: ["b"] }
    ]);
  });

  it("follows the active note, including notes without comments", () => {
    const groups = groupThreadViewModels([
      ...buildThreadViewModels("target", [{ ...thread, documentPath: "notes/a.md" }]),
      ...buildThreadViewModels("target", [{ ...thread, id: "b", documentPath: "notes/b.md" }])
    ]);

    expect(selectDocumentPath(groups, "notes/a.md", "notes/b.md")).toBe("notes/b.md");
    expect(selectDocumentPath(groups, undefined, "notes/b.md")).toBe("notes/b.md");
    expect(selectDocumentPath(groups, "notes/a.md", "notes/new.md")).toBe("notes/new.md");
    expect(selectDocumentPath(groups, "notes/a.md", undefined)).toBe("notes/a.md");
  });

  it("labels the resolved-thread toggle by the next visible action", () => {
    expect(resolvedToggleLabel(true)).toBe("Hide resolved");
    expect(resolvedToggleLabel(false)).toBe("Show resolved");
  });

  it("shows the selected editor text in the new-comment composer", () => {
    expect(selectionPreviewText("  selected\ntext  ")).toBe("selected\ntext");
    expect(selectionPreviewText("  ")).toBe("New comment on editor selection");
  });

  it("builds a directory-first document tree", () => {
    const groups = groupThreadViewModels([
      ...buildThreadViewModels("target", [{ ...thread, id: "root", documentPath: "README.md" }]),
      ...buildThreadViewModels("target", [{ ...thread, id: "profile", documentPath: "my-profile/context.md" }]),
      ...buildThreadViewModels("target", [{ ...thread, id: "finance", documentPath: "my-profile/Finances/plan.md" }])
    ]);

    expect(buildDocumentTree(groups)).toMatchObject([
      {
        kind: "directory",
        name: "my-profile",
        children: [
          {
            kind: "directory",
            name: "Finances",
            children: [{ kind: "file", name: "plan.md" }]
          },
          { kind: "file", name: "context.md" }
        ]
      },
      { kind: "file", name: "README.md" }
    ]);
  });
});
