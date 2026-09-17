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

export interface PinnedSelection {
  readonly uri: string;
  readonly version: number;
}

/**
 * Whether a selection pinned from the Markdown preview still describes the document on screen.
 *
 * The preview reports offsets against one document version, so an edit invalidates the pin. A
 * document that is no longer open cannot contradict the pin, so the pin stands.
 */
export function pinnedSelectionApplies(
  pinned: PinnedSelection | undefined,
  uri: string,
  documentVersion: number | undefined
): boolean {
  if (!pinned || pinned.uri !== uri) return false;
  return documentVersion === undefined || documentVersion === pinned.version;
}

export type ComposerState =
  | { readonly kind: "disabled" }
  | { readonly kind: "editor" }
  | { readonly kind: "preview"; readonly text: string };

/** How the sidebar composer should present itself for the document being shown. */
export function composerState(
  anchored: boolean,
  uri: string,
  pinned: { readonly uri: string; readonly text: string } | undefined
): ComposerState {
  if (!anchored) return { kind: "disabled" };
  if (pinned && pinned.uri === uri) return { kind: "preview", text: pinned.text };
  return { kind: "editor" };
}
