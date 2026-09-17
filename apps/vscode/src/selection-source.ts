/** A non-empty text selection expressed in document offsets. */
export interface EditorSelection {
  readonly uri: string;
  readonly version: number;
  readonly start: number;
  readonly end: number;
}

export interface SelectionCandidates {
  readonly uri: string;
  readonly documentVersion: number;
  readonly active?: EditorSelection | undefined;
  readonly visible: readonly EditorSelection[];
  readonly remembered?: EditorSelection | undefined;
}

export interface SelectionOffsets {
  readonly start: number;
  readonly end: number;
}

const usable = (selection: EditorSelection | undefined, uri: string): boolean =>
  selection !== undefined && selection.uri === uri && selection.start < selection.end;

/**
 * Chooses the selection a sidebar comment should anchor to.
 *
 * The Markdown preview is an editor-area webview, so focusing it clears the active
 * text editor. We therefore accept a still-visible editor, and finally a remembered
 * selection, but only while the document has not changed underneath it.
 */
export function pickCommentSelection(candidates: SelectionCandidates): SelectionOffsets | undefined {
  const { uri, documentVersion, active, visible, remembered } = candidates;
  const live = usable(active, uri) ? active : visible.find((selection) => usable(selection, uri));
  if (live) return { start: live.start, end: live.end };
  if (usable(remembered, uri) && remembered!.version === documentVersion) {
    return { start: remembered!.start, end: remembered!.end };
  }
  return undefined;
}
