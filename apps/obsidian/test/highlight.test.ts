import { EditorState } from "@codemirror/state";
import { lineNumberMarkers } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { setSidebandHighlights, sidebandHighlightField, sidebandThreadAt } from "../src/highlight.js";

describe("Obsidian anchor highlights", () => {
  it("marks the starting line of every anchored comment in the line-number gutter", () => {
    const state = EditorState.create({
      doc: "first line\nsecond line\nthird line",
      extensions: [sidebandHighlightField]
    });
    const updated = state.update({
      effects: setSidebandHighlights.of([
        { id: "first", start: 2, end: 8, status: "open" },
        { id: "second", start: 14, end: 19, status: "resolved" }
      ])
    }).state;
    const positions: number[] = [];
    for (const markers of updated.facet(lineNumberMarkers)) {
      markers.between(0, updated.doc.length, (from) => { positions.push(from); });
    }

    expect(positions).toEqual([0, 11]);
  });

  it("names the comment whose highlight holds the cursor", () => {
    const state = EditorState.create({
      doc: "alpha beta gamma delta",
      extensions: [sidebandHighlightField]
    }).update({
      effects: setSidebandHighlights.of([
        { id: "outer", start: 0, end: 16, status: "open" },
        { id: "inner", start: 6, end: 10, status: "open" }
      ])
    }).state;

    expect(sidebandThreadAt(state, 2)).toBe("outer");
    expect(sidebandThreadAt(state, 8)).toBe("inner");
    expect(sidebandThreadAt(state, 20)).toBeUndefined();
  });

  it("keeps naming the comment after text is typed above its highlight", () => {
    const highlighted = EditorState.create({
      doc: "intro\ntarget text",
      extensions: [sidebandHighlightField]
    }).update({
      effects: setSidebandHighlights.of([{ id: "thread", start: 6, end: 12, status: "open" }])
    }).state;
    const edited = highlighted.update({ changes: { from: 0, insert: "new line\n" } }).state;

    expect(sidebandThreadAt(edited, 8)).toBeUndefined();
    expect(sidebandThreadAt(edited, 17)).toBe("thread");
  });
});
