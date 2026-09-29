import { describe, expect, it } from "vitest";
import { captureAnchor, resolveAnchor, threadAtOffset } from "../src/index.js";

describe("quote anchors", () => {
  it("captures surrounding context and resolves after text moves", () => {
    const original = "Intro. The shared store is canonical. Ending.";
    const start = original.indexOf("shared store");
    const anchor = captureAnchor(original, start, start + "shared store".length, 12);

    expect(anchor).toEqual({
      exact: "shared store",
      prefix: "Intro. The ",
      suffix: " is canonica",
      position: start
    });

    const moved = "A new heading.\n" + original;
    expect(resolveAnchor(moved, anchor)).toMatchObject({
      kind: "resolved",
      start: moved.indexOf("shared store")
    });
  });

  it("uses context to disambiguate duplicate quotes", () => {
    const text = "alpha target first\nbeta target second";
    const start = text.lastIndexOf("target");
    const anchor = captureAnchor(text, start, start + 6, 8);

    expect(resolveAnchor(text, anchor)).toMatchObject({ kind: "resolved", start });
  });

  it("reports an orphan instead of silently attaching to unrelated text", () => {
    const anchor = captureAnchor("before exact after", 7, 12);
    expect(resolveAnchor("before changed after", anchor)).toEqual({ kind: "orphaned" });
  });
});

describe("thread under the cursor", () => {
  const ranges = [
    { id: "outer", start: 10, end: 40 },
    { id: "inner", start: 20, end: 25 },
    { id: "later", start: 50, end: 60 }
  ];

  it("finds the anchor that holds the cursor, including both of its edges", () => {
    expect(threadAtOffset(ranges, 55)).toBe("later");
    expect(threadAtOffset(ranges, 50)).toBe("later");
    expect(threadAtOffset(ranges, 60)).toBe("later");
  });

  it("finds nothing when the cursor is outside every anchor", () => {
    expect(threadAtOffset(ranges, 45)).toBeUndefined();
    expect(threadAtOffset([], 0)).toBeUndefined();
  });

  it("picks the innermost anchor when anchors overlap", () => {
    expect(threadAtOffset(ranges, 22)).toBe("inner");
    expect(threadAtOffset(ranges, 30)).toBe("outer");
  });
});
