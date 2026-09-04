export interface AnchorOffsets {
  start: number;
  end: number;
}

export function nonEmptyAnchorOffsets(text: string, start: number, end: number): AnchorOffsets | undefined {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length || start > end) {
    throw new RangeError("comment range must be inside the document");
  }
  if (start < end) return { start, end };

  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const nextLineBreak = text.indexOf("\n", start);
  let lineEnd = nextLineBreak < 0 ? text.length : nextLineBreak;
  if (lineEnd > lineStart && text[lineEnd - 1] === "\r") lineEnd--;
  if (!text.slice(lineStart, lineEnd).trim()) return undefined;
  return { start: lineStart, end: lineEnd };
}

export function singleLineDisplayOffsets(text: string, start: number, end: number): AnchorOffsets {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length || start >= end) {
    throw new RangeError("anchor range must select text inside the document");
  }
  let lineStart = start;
  while (lineStart < end) {
    const nextLineBreak = text.indexOf("\n", lineStart);
    let lineEnd = nextLineBreak < 0 ? end : Math.min(end, nextLineBreak);
    if (lineEnd > lineStart && text[lineEnd - 1] === "\r") lineEnd--;
    if (text.slice(lineStart, lineEnd).trim()) return { start: lineStart, end: lineEnd };
    lineStart = nextLineBreak < 0 ? end : nextLineBreak + 1;
  }
  return { start, end: Math.min(end, start + 1) };
}
