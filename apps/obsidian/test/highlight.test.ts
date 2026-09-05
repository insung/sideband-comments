import { EditorState } from "@codemirror/state";
import { lineNumberMarkers } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { setSidebandHighlights, sidebandHighlightField } from "../src/highlight.js";

describe("Obsidian anchor highlights", () => {
  it("marks the starting line of every anchored comment in the line-number gutter", () => {
    const state = EditorState.create({
      doc: "first line\nsecond line\nthird line",
      extensions: [sidebandHighlightField]
    });
    const updated = state.update({
      effects: setSidebandHighlights.of([
        { start: 2, end: 8, status: "open" },
        { start: 14, end: 19, status: "resolved" }
      ])
    }).state;
    const positions: number[] = [];
    for (const markers of updated.facet(lineNumberMarkers)) {
      markers.between(0, updated.doc.length, (from) => { positions.push(from); });
    }

    expect(positions).toEqual([0, 11]);
  });
});
