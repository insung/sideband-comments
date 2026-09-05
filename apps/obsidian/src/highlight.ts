import { RangeSet, StateEffect, StateField, type EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  lineNumberMarkers,
  type DecorationSet
} from "@codemirror/view";

export interface HighlightRange {
  start: number;
  end: number;
  status: "open" | "resolved";
}

export const setSidebandHighlights = StateEffect.define<readonly HighlightRange[]>();

interface SidebandHighlightState {
  decorations: DecorationSet;
  markers: RangeSet<GutterMarker>;
}

class SidebandGutterMarker extends GutterMarker {
  readonly elementClass: string;

  constructor(readonly status: HighlightRange["status"]) {
    super();
    this.elementClass = status === "resolved"
      ? "sideband-gutter-line is-resolved"
      : "sideband-gutter-line";
  }

  override eq(other: GutterMarker): boolean {
    return other instanceof SidebandGutterMarker && other.status === this.status;
  }
}

const openMarker = new SidebandGutterMarker("open");
const resolvedMarker = new SidebandGutterMarker("resolved");

function highlightState(editorState: EditorState, ranges: readonly HighlightRange[]): SidebandHighlightState {
  const valid = [...ranges]
    .filter((range) => range.start >= 0 && range.end > range.start && range.end <= editorState.doc.length)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const decorations = Decoration.set(valid.map((range) => Decoration.mark({
    class: range.status === "resolved" ? "sideband-anchor is-resolved" : "sideband-anchor"
  }).range(range.start, range.end)), true);
  const lineStatuses = new Map<number, HighlightRange["status"]>();
  for (const range of valid) {
    const lineStart = editorState.doc.lineAt(range.start).from;
    if (lineStatuses.get(lineStart) !== "open") lineStatuses.set(lineStart, range.status);
  }
  const markers = RangeSet.of([...lineStatuses.entries()]
    .sort(([left], [right]) => left - right)
    .map(([position, status]) => (status === "open" ? openMarker : resolvedMarker).range(position)), true);
  return { decorations, markers };
}

export const sidebandHighlightField = StateField.define<SidebandHighlightState>({
  create: () => ({ decorations: Decoration.none, markers: RangeSet.empty }),
  update(value, transaction) {
    let mapped = {
      decorations: value.decorations.map(transaction.changes),
      markers: value.markers.map(transaction.changes)
    };
    for (const effect of transaction.effects) {
      if (!effect.is(setSidebandHighlights)) continue;
      mapped = highlightState(transaction.state, effect.value);
    }
    return mapped;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    lineNumberMarkers.from(field, (value) => value.markers)
  ]
});
