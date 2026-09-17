import { describe, expect, it } from "vitest";
import { pickCommentSelection, type EditorSelection } from "../src/selection-source.js";

const uri = "file:///workspace/doc.md";
const other = "file:///workspace/other.md";
const at = (start: number, end: number, overrides: Partial<EditorSelection> = {}): EditorSelection =>
  ({ uri, version: 3, start, end, ...overrides });

describe("pickCommentSelection", () => {
  it("prefers the active editor's selection", () => {
    expect(pickCommentSelection({
      uri,
      documentVersion: 3,
      active: at(10, 20),
      visible: [at(30, 40)],
      remembered: at(50, 60)
    })).toEqual({ start: 10, end: 20 });
  });

  it("uses a visible editor when the Markdown preview took focus away", () => {
    expect(pickCommentSelection({
      uri,
      documentVersion: 3,
      active: undefined,
      visible: [at(30, 40)]
    })).toEqual({ start: 30, end: 40 });
  });

  it("falls back to the last remembered selection when no editor is visible", () => {
    expect(pickCommentSelection({
      uri,
      documentVersion: 3,
      visible: [],
      remembered: at(50, 60)
    })).toEqual({ start: 50, end: 60 });
  });

  it("ignores a remembered selection captured against an older document version", () => {
    expect(pickCommentSelection({
      uri,
      documentVersion: 4,
      visible: [],
      remembered: at(50, 60, { version: 3 })
    })).toBeUndefined();
  });

  it("ignores editors and memories belonging to another document", () => {
    expect(pickCommentSelection({
      uri,
      documentVersion: 3,
      active: at(10, 20, { uri: other }),
      visible: [at(30, 40, { uri: other })],
      remembered: at(50, 60, { uri: other })
    })).toBeUndefined();
  });

  it("skips empty selections", () => {
    expect(pickCommentSelection({
      uri,
      documentVersion: 3,
      active: at(10, 10),
      visible: [at(30, 30)],
      remembered: at(50, 60)
    })).toEqual({ start: 50, end: 60 });
  });

  it("has nothing to offer when only a preview is open", () => {
    expect(pickCommentSelection({ uri, documentVersion: 3, visible: [] })).toBeUndefined();
  });
});
