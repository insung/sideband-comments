import { describe, expect, it } from "vitest";
import type { ThreadState } from "@sideband-comments/core";
import {
  buildDocumentGroups,
  collectWorkspaceThreads,
  commentCountLabel
} from "../src/tree-model.js";

const thread = (overrides: Partial<ThreadState>): ThreadState => ({
  id: "thread-1",
  documentPath: "src/example.ts",
  originalAnchor: { exact: "example", prefix: "", suffix: "", position: 0 },
  anchor: { exact: "example", prefix: "", suffix: "", position: 0 },
  status: "open",
  deleted: false,
  comments: [{
    id: "comment-1",
    author: { id: "insung", name: "insung" },
    createdAt: "2026-09-01T00:00:00.000Z",
    body: "first"
  }],
  revision: 0,
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...overrides
});

describe("buildDocumentGroups", () => {
  it("groups threads by workspace and document and orders open threads first", () => {
    const groups = buildDocumentGroups([
      { workspaceKey: "b", workspaceName: "beta", thread: thread({ id: "resolved", status: "resolved" }) },
      { workspaceKey: "a", workspaceName: "alpha", thread: thread({ id: "open", updatedAt: "2026-09-02T00:00:00.000Z" }) },
      { workspaceKey: "a", workspaceName: "alpha", thread: thread({ id: "other", documentPath: "README.md" }) }
    ]);

    expect(groups.map((group) => `${group.workspaceName}/${group.documentPath}`)).toEqual([
      "alpha/README.md",
      "alpha/src/example.ts",
      "beta/src/example.ts"
    ]);
    expect(groups[1]?.threads.map((item) => item.id)).toEqual(["open"]);
    expect(groups[2]?.threads.map((item) => item.id)).toEqual(["resolved"]);
  });

  it("orders open threads before resolved threads within the same document", () => {
    const groups = buildDocumentGroups([
      { workspaceKey: "a", workspaceName: "alpha", thread: thread({ id: "resolved", status: "resolved", updatedAt: "2026-09-03T00:00:00.000Z" }) },
      { workspaceKey: "a", workspaceName: "alpha", thread: thread({ id: "open", status: "open", updatedAt: "2026-09-01T00:00:00.000Z" }) }
    ]);

    expect(groups[0]?.threads.map((item) => item.id)).toEqual(["open", "resolved"]);
  });

  it("hides resolved threads when the sidebar filter is disabled", () => {
    const groups = buildDocumentGroups([
      { workspaceKey: "a", workspaceName: "alpha", thread: thread({ id: "open" }) },
      { workspaceKey: "a", workspaceName: "alpha", thread: thread({ id: "resolved", status: "resolved" }) }
    ], false);

    expect(groups[0]?.threads.map((item) => item.id)).toEqual(["open"]);
  });
});

describe("commentCountLabel", () => {
  it("formats singular and plural thread counts", () => {
    expect(commentCountLabel(1)).toBe("1 comment");
    expect(commentCountLabel(2)).toBe("2 comments");
  });
});

describe("collectWorkspaceThreads", () => {
  it("keeps healthy repositories visible when another repository cannot be read", async () => {
    const result = await collectWorkspaceThreads([
      {
        workspaceKey: "good",
        workspaceName: "good-repo",
        list: async () => [thread({ id: "visible" })]
      },
      {
        workspaceKey: "bad",
        workspaceName: "bad-repo",
        list: async () => { throw new Error("invalid event"); }
      }
    ]);

    expect(result.entries.map((entry) => entry.thread.id)).toEqual(["visible"]);
    expect(result.failures).toEqual([{ workspaceName: "bad-repo", message: "invalid event" }]);
  });
});
