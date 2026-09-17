import { captureAnchor, type QuoteAnchor } from "@sideband-comments/core";

/**
 * Maps a Markdown preview selection back onto the source document.
 *
 * The preview reports the rendered text plus the `data-line` range that produced it,
 * so we search that source slice for the rendered text and fall back to the whole
 * slice when the rendered text cannot be located unambiguously.
 */
export function capturePreviewAnchor(
  source: string,
  text: string,
  startLine: number,
  endLine: number
): QuoteAnchor {
  const lines = source.split("\n");
  if (!text.trim() || !Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 0 || startLine >= lines.length || endLine <= startLine) {
    throw new Error("Select text in the Markdown preview again.");
  }
  const start = lines.slice(0, startLine).reduce((sum, line) => sum + line.length + 1, 0);
  const end = Math.min(source.length, lines.slice(0, endLine).reduce((sum, line) => sum + line.length + 1, 0));
  const block = source.slice(start, end);
  const offset = block.indexOf(text);
  if (offset >= 0 && block.indexOf(text, offset + 1) < 0) {
    return captureAnchor(source, start + offset, start + offset + text.length);
  }
  const trimmed = block.trimEnd();
  if (!trimmed) throw new Error("The preview no longer matches the document. Refresh it and select the text again.");
  return captureAnchor(source, start, start + trimmed.length);
}

/** Payload `resources/preview.js` publishes through `data-vscode-context`. */
interface PreviewSelectionContext {
  sidebandPreviewUri?: unknown;
  sidebandPreviewVersion?: unknown;
  sidebandPreviewText?: unknown;
  sidebandPreviewStartLine?: unknown;
  sidebandPreviewEndLine?: unknown;
}

interface PreviewSelection {
  readonly uri: string;
  readonly version: number;
  readonly text: string;
  readonly startLine: number;
  readonly endLine: number;
}

export function readPreviewSelection(context: unknown): PreviewSelection | undefined {
  const candidate = context as PreviewSelectionContext | undefined;
  if (!candidate
    || typeof candidate.sidebandPreviewUri !== "string"
    || typeof candidate.sidebandPreviewText !== "string"
    || typeof candidate.sidebandPreviewStartLine !== "number"
    || typeof candidate.sidebandPreviewEndLine !== "number") return undefined;
  return {
    uri: candidate.sidebandPreviewUri,
    version: typeof candidate.sidebandPreviewVersion === "number" ? candidate.sidebandPreviewVersion : -1,
    text: candidate.sidebandPreviewText,
    startLine: candidate.sidebandPreviewStartLine,
    endLine: candidate.sidebandPreviewEndLine
  };
}
