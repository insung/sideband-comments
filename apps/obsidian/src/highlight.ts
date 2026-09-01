import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

export interface HighlightRange {
  start: number;
  end: number;
  status: "open" | "resolved";
}

export const setSidebandHighlights = StateEffect.define<readonly HighlightRange[]>();

export const sidebandHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let mapped = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setSidebandHighlights)) continue;
      const ranges = [...effect.value]
        .filter((range) => range.start >= 0 && range.end > range.start && range.end <= transaction.state.doc.length)
        .sort((a, b) => a.start - b.start || a.end - b.end)
        .map((range) => Decoration.mark({
          class: range.status === "resolved" ? "sideband-anchor is-resolved" : "sideband-anchor"
        }).range(range.start, range.end));
      mapped = Decoration.set(ranges, true);
    }
    return mapped;
  },
  provide: (field) => EditorView.decorations.from(field)
});
