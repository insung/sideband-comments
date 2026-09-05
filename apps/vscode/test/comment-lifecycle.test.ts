import { describe, expect, it, vi } from "vitest";
import {
  commentRenderSignature,
  KeyedSingleFlight,
  planActiveDocumentSync,
  planVisibleDocumentSync
} from "../src/comment-lifecycle.js";

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

describe("planActiveDocumentSync", () => {
  it("preserves the loaded comments while focus temporarily leaves the text editor", () => {
    expect(planActiveDocumentSync(
      undefined,
      ["file:///workspace/note.md"],
      []
    )).toEqual({ load: [], unload: [] });
  });

  it("switches the loaded comments when another text document becomes active", () => {
    expect(planActiveDocumentSync(
      "file:///workspace/new.md",
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

describe("commentRenderSignature", () => {
  it("stays stable for focus-only refreshes and changes with editor or thread state", () => {
    const threads = [{ id: "thread-1", comments: [{ body: "comment" }] }];
    const signature = commentRenderSignature(3, true, threads);

    expect(commentRenderSignature(3, true, threads)).toBe(signature);
    expect(commentRenderSignature(4, true, threads)).not.toBe(signature);
    expect(commentRenderSignature(3, false, threads)).not.toBe(signature);
    expect(commentRenderSignature(3, true, [{ id: "thread-1", comments: [{ body: "changed" }] }])).not.toBe(signature);
  });
});


describe("reloads arriving during a read", () => {
  it("performs a trailing read instead of losing a watcher event", async () => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const flights = new KeyedSingleFlight();
    const first = vi.fn(async () => { await blocked; });
    const latest = vi.fn(async () => {});
    const pending = flights.run("document", first);
    const joined = flights.run("document", latest);
    release();
    await Promise.all([pending, joined]);
    expect(first).toHaveBeenCalledTimes(1);
    expect(latest).toHaveBeenCalledTimes(1);
    expect(flights.keys()).toEqual([]);
  });
});
