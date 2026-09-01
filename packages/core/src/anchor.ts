import type { AnchorResolution, QuoteAnchor } from "./types.js";

export function captureAnchor(
  text: string,
  start: number,
  end: number,
  contextLength = 32
): QuoteAnchor {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > text.length || start >= end) {
    throw new RangeError("anchor range must select non-empty text inside the document");
  }
  if (!Number.isInteger(contextLength) || contextLength < 0) {
    throw new RangeError("context length must be a non-negative integer");
  }
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - contextLength), start),
    suffix: text.slice(end, Math.min(text.length, end + contextLength)),
    position: start
  };
}

function occurrences(text: string, exact: string): number[] {
  if (!exact) return [];
  const result: number[] = [];
  let from = 0;
  while (from <= text.length - exact.length) {
    const found = text.indexOf(exact, from);
    if (found < 0) break;
    result.push(found);
    from = found + Math.max(1, exact.length);
  }
  return result;
}

function suffixMatch(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let matched = 0;
  while (matched < limit && left[left.length - 1 - matched] === right[right.length - 1 - matched]) matched++;
  return matched;
}

function prefixMatch(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let matched = 0;
  while (matched < limit && left[matched] === right[matched]) matched++;
  return matched;
}

export function resolveAnchor(text: string, anchor: QuoteAnchor): AnchorResolution {
  const candidates = occurrences(text, anchor.exact);
  if (candidates.length === 0) return { kind: "orphaned" };
  if (candidates.length === 1) {
    const start = candidates[0]!;
    return { kind: "resolved", start, end: start + anchor.exact.length, confidence: "exact" };
  }

  const ranked = candidates.map((start) => {
    const before = text.slice(Math.max(0, start - anchor.prefix.length), start);
    const after = text.slice(start + anchor.exact.length, start + anchor.exact.length + anchor.suffix.length);
    const contextScore = suffixMatch(before, anchor.prefix) + prefixMatch(after, anchor.suffix);
    const distance = Math.abs(start - anchor.position);
    return { start, contextScore, distance };
  }).sort((a, b) => b.contextScore - a.contextScore || a.distance - b.distance || a.start - b.start);

  const best = ranked[0]!;
  const second = ranked[1];
  if (second && best.contextScore === second.contextScore && best.distance === second.distance) {
    return { kind: "ambiguous", candidates };
  }
  return {
    kind: "resolved",
    start: best.start,
    end: best.start + anchor.exact.length,
    confidence: "context"
  };
}
