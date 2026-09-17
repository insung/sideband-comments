import { describe, expect, it } from "vitest";
import { capturePreviewAnchor } from "../src/preview-anchor.js";

const source = [
  "# Title",
  "",
  "First paragraph with a unique phrase.",
  "",
  "Second paragraph repeats repeats.",
  ""
].join("\n");

describe("capturePreviewAnchor", () => {
  it("anchors the rendered text when it occurs once in the reported lines", () => {
    const anchor = capturePreviewAnchor(source, "a unique phrase", 2, 3);

    expect(anchor.exact).toBe("a unique phrase");
    expect(source.slice(source.indexOf("a unique phrase"))).toContain(anchor.exact);
  });

  it("falls back to the whole reported block when the text is ambiguous", () => {
    const anchor = capturePreviewAnchor(source, "repeats", 4, 5);

    expect(anchor.exact).toBe("Second paragraph repeats repeats.");
  });

  it("rejects a blank selection", () => {
    expect(() => capturePreviewAnchor(source, "   ", 2, 3)).toThrow(/Select text in the Markdown preview/);
  });

  it("rejects a line range that is not inside the document", () => {
    expect(() => capturePreviewAnchor(source, "Title", 99, 100)).toThrow(/Select text in the Markdown preview/);
    expect(() => capturePreviewAnchor(source, "Title", 2, 2)).toThrow(/Select text in the Markdown preview/);
  });

  it("reports a stale preview when the reported lines are now blank", () => {
    expect(() => capturePreviewAnchor(source, "gone", 1, 2))
      .toThrow(/The preview no longer matches the document/);
  });
});
