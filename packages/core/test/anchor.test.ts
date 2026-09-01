import { describe, expect, it } from "vitest";
import { captureAnchor, resolveAnchor } from "../src/index.js";

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
