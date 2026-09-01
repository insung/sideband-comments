import { describe, expect, it, vi } from "vitest";
import { KeyedSingleFlight, planVisibleDocumentSync } from "../src/comment-lifecycle.js";

describe("planVisibleDocumentSync", () => {
  it("does not reload a document merely because the visible-editors event fires again", () => {
    expect(planVisibleDocumentSync(
      ["file:///workspace/note.md"],
      ["file:///workspace/note.md"],
      []
    )).toEqual({ load: [], unload: [] });
  });

  it("loads only new workspace documents and unloads documents that are no longer visible", () => {
    expect(planVisibleDocumentSync(
      ["file:///workspace/new.md"],
      ["file:///workspace/old.md"],
      []
    )).toEqual({
      load: ["file:///workspace/new.md"],
      unload: ["file:///workspace/old.md"]
    });
  });
});

describe("KeyedSingleFlight", () => {
  it("coalesces concurrent reloads for the same document", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const task = vi.fn(async () => blocked);
    const flights = new KeyedSingleFlight();

    const first = flights.run("file:///workspace/note.md", task);
    const second = flights.run("file:///workspace/note.md", task);

    expect(flights.has("file:///workspace/note.md")).toBe(true);
    expect(task).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(flights.has("file:///workspace/note.md")).toBe(false);
  });
});
