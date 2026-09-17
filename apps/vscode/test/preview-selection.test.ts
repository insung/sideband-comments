import { describe, expect, it } from "vitest";
import { readPreviewSelection } from "../src/preview-anchor.js";

const context = {
  sidebandPreviewSelection: true,
  sidebandPreviewUri: "file:///workspace/doc.md",
  sidebandPreviewVersion: 7,
  sidebandPreviewText: "a unique phrase",
  sidebandPreviewStartLine: 2,
  sidebandPreviewEndLine: 3
};

describe("readPreviewSelection", () => {
  it("reads the payload the preview script publishes", () => {
    expect(readPreviewSelection(context)).toEqual({
      uri: "file:///workspace/doc.md",
      version: 7,
      text: "a unique phrase",
      startLine: 2,
      endLine: 3
    });
  });

  it("treats a missing version as unknown so the staleness check fails closed", () => {
    expect(readPreviewSelection({ ...context, sidebandPreviewVersion: undefined })?.version).toBe(-1);
  });

  it("rejects a context that is not a preview selection", () => {
    expect(readPreviewSelection(undefined)).toBeUndefined();
    expect(readPreviewSelection({})).toBeUndefined();
    expect(readPreviewSelection({ ...context, sidebandPreviewText: 12 })).toBeUndefined();
    expect(readPreviewSelection({ ...context, sidebandPreviewStartLine: "2" })).toBeUndefined();
  });
});
