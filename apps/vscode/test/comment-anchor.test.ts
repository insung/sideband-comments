import { describe, expect, it } from "vitest";
import { nonEmptyAnchorOffsets, singleLineDisplayOffsets } from "../src/comment-anchor.js";

describe("nonEmptyAnchorOffsets", () => {
  it("keeps an explicit non-empty selection", () => {
    expect(nonEmptyAnchorOffsets("first line\nsecond line\n", 6, 10)).toEqual({ start: 6, end: 10 });
  });

  it("expands a zero-length gutter comment range to the non-blank line", () => {
    const text = "MIT License\n\nPermission is hereby granted\n";
    const lineStart = text.indexOf("Permission");

    expect(nonEmptyAnchorOffsets(text, lineStart, lineStart)).toEqual({
      start: lineStart,
      end: lineStart + "Permission is hereby granted".length
    });
  });

  it("does not invent an anchor for a blank line", () => {
    expect(nonEmptyAnchorOffsets("first line\n\nthird line\n", 11, 11)).toBeUndefined();
  });
});

describe("singleLineDisplayOffsets", () => {
  it("keeps a one-line anchor unchanged", () => {
    expect(singleLineDisplayOffsets("first line\nsecond line", 0, 5)).toEqual({ start: 0, end: 5 });
  });

  it("shows a multi-line anchor on only its first non-blank line", () => {
    const text = "first line\nsecond line\nthird line";
    expect(singleLineDisplayOffsets(text, 0, text.length)).toEqual({ start: 0, end: 10 });
  });
});
