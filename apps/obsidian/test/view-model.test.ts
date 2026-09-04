import { describe, expect, it } from "vitest";
import type { ThreadState } from "@sideband-comments/core";
import { buildThreadViewModels } from "../src/view-model.js";

const thread: ThreadState = {
  id: "t1",
  documentPath: "note.md",
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
});
