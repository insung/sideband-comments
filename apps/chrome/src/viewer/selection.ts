import type { SourceRun } from './source-map.js';
export interface SelectionOffsets { start: number; end: number }
const supported = 'p[data-source-map],li[data-source-map],h1[data-source-map],h2[data-source-map],h3[data-source-map],h4[data-source-map],h5[data-source-map],h6[data-source-map],td[data-source-map],th[data-source-map]';
const unsupported = 'pre,svg';
const retry = 'Reload the document after editing its Markdown source, then select text again.';
function element(node: Node): Element | null { return node.nodeType === 1 ? node as Element : node.parentElement; }
function runsFor(block: Element, source: string): SourceRun[] {
  const runs = JSON.parse(block.getAttribute('data-source-map') || '[]') as SourceRun[];
  const visible = block.textContent || '';
  return runs.filter(([view, at, length]) => Number.isInteger(view) && Number.isInteger(at) && Number.isInteger(length) && view >= 0 && at >= 0 && length > 0 && source.slice(at, at + length) === visible.slice(view, view + length));
}
function offsetIn(block: Element, node: Node, offset: number): number {
  const prefix = block.ownerDocument.createRange();
  prefix.selectNodeContents(block); prefix.setEnd(node, offset);
  return prefix.toString().length;
}
/** Browser paragraph selection can end at the next block's offset zero. */
export function normalizeSelectionRange(range: Range): Range {
  const normalized = range.cloneRange();
  const root = range.commonAncestorContainer;
  const walker = root.ownerDocument!.createTreeWalker(root, 4);
  let node: Node | null = root.nodeType === 3 ? root : walker.nextNode();
  let first: [Node, number] | undefined, last: [Node, number] | undefined;
  while (node) {
    if (range.comparePoint(node, 0) > 0) break;
    if (range.intersectsNode(node)) {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.textContent!.length;
      const separator = !/\S/.test(node.textContent!.slice(start, end)) && !element(node)?.closest(`${supported},${unsupported}`);
      if (end > start && !separator) {
        first ??= [node, start]; last = [node, end];
      }
    }
    node = walker.nextNode();
  }
  if (first && last) { normalized.setStart(...first); normalized.setEnd(...last); }
  return normalized;
}
/** Endpoints come from parser provenance; a source span may include inline syntax. */
export function selectionOffsets(source: string, range: Range): SelectionOffsets {
  range = normalizeSelectionRange(range);
  const startElement = element(range.startContainer), endElement = element(range.endContainer);
  const block = startElement?.closest(supported);
  if (!block || endElement?.closest(supported) !== block || startElement?.closest(unsupported) || endElement?.closest(unsupported) || block.querySelector('p,ul,ol,pre,svg,table')) {
    throw new Error(`Select text inside one paragraph, heading, list item or table cell. Multiple blocks, code blocks and diagrams are not supported. ${retry}`);
  }
  if (!range.toString().trim()) throw new Error('Select nonblank text inside one paragraph, heading, list item or table cell.');
  const start = offsetIn(block, range.startContainer, range.startOffset);
  const end = offsetIn(block, range.endContainer, range.endOffset);
  const runs = runsFor(block, source);
  let sourceStart: number | undefined, sourceEnd: number | undefined;
  for (let at = start; at < end; at++) {
    const run = runs.find(([view, , length]) => view <= at && view + length > at);
    if (!run) throw new Error(`This selection cannot be mapped safely to its Markdown source. Select a shorter text phrase without transformed characters. ${retry}`);
    const position = run[1] + at - run[0];
    if (sourceEnd !== undefined && position < sourceEnd) throw new Error(`This selection has an ambiguous source mapping. ${retry}`);
    sourceStart ??= position; sourceEnd = position + 1;
  }
  if (sourceStart === undefined || sourceEnd === undefined) throw new Error(`This selection has no exact source range. ${retry}`);
  return { start: sourceStart, end: sourceEnd };
}

/** Reverse exact mappings only; never highlight a repeated phrase by text search. */
export function sourceRange(article: Element, source: string, start: number, end: number): Range | undefined {
  // Editor line selections often include their final newline, which has no
  // rendered text node. Remove only boundary line breaks, never search elsewhere.
  while (start < end && /[\r\n]/.test(source[start] || '')) start++;
  while (end > start && /[\r\n]/.test(source[end - 1] || '')) end--;
  if (start >= end) return undefined;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > source.length) return;
  const blocks = [...article.querySelectorAll(supported)];
  if (article.matches(supported)) blocks.unshift(article);
  for (const block of blocks) {
    if (block.closest(unsupported)) continue;
    const runs = runsFor(block, source);
    let first: number | undefined, last: number | undefined;
    for (const [view, at, length] of runs) {
      if (start >= at && start < at + length) first = view + start - at;
      if (end > at && end <= at + length) last = view + end - at;
    }
    if (first === undefined || last === undefined || first >= last) continue;
    const walker = block.ownerDocument.createTreeWalker(block, 4);
    let cursor = 0, node: Node | null;
    const range = block.ownerDocument.createRange();
    let hasStart = false, hasEnd = false;
    while ((node = walker.nextNode())) {
      const length = node.textContent?.length || 0;
      if (!hasStart && first >= cursor && first < cursor + length) { range.setStart(node, first - cursor); hasStart = true; }
      if (last > cursor && last <= cursor + length) { range.setEnd(node, last - cursor); hasEnd = true; break; }
      cursor += length;
    }
    if (!hasStart || !hasEnd) continue;
    try {
      const mapped = selectionOffsets(source, range);
      if (mapped.start === start && mapped.end === end) return range;
    } catch { /* Unsupported transformed content is never a navigation fallback. */ }
  }
}
