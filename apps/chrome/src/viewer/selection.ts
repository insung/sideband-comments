export interface SelectionOffsets { start: number; end: number }

/** Never silently widen a rendered selection to a different Markdown range. */
export function selectionOffsets(source: string, range: Range): SelectionOffsets {
  const element = (node: Node): Element | null => node.nodeType === 1 ? node as Element : node.parentElement;
  const startElement = element(range.startContainer);
  const endElement = element(range.endContainer);
  const block = startElement?.closest('p[data-source-start],li[data-source-start]');
  if (!block || endElement?.closest('p[data-source-start],li[data-source-start]') !== block || startElement?.closest('pre,table,svg') || block.querySelector('p,ul,ol,pre,table')) {
    throw new Error('Select text inside one paragraph or list item. Code, diagrams and multiple blocks are not supported.');
  }
  if (block.children.length) throw new Error('Select text in a plain paragraph or list item without inline formatting. Formatted selections cannot be matched safely to source.');
  const text = range.toString();
  if (!text.trim()) throw new Error('Select nonblank text inside one paragraph.');
  const blockStart = Number(block.getAttribute('data-source-start'));
  const blockEnd = Number(block.getAttribute('data-source-end'));
  const raw = source.slice(blockStart, blockEnd);
  const visible = block.textContent || '';
  const unique = (value: string): number => {
    const first = raw.indexOf(value);
    return first >= 0 && raw.indexOf(value, first + 1) < 0 ? first : -1;
  };
  let offset = unique(visible);
  if (offset >= 0) {
    const prefix = range.cloneRange(); prefix.selectNodeContents(block); prefix.setEnd(range.startContainer, range.startOffset);
    offset += prefix.toString().length;
  }
  if (offset < 0 || raw.slice(offset, offset + text.length) !== text) throw new Error('This formatted selection cannot be matched exactly to the Markdown source. Select a shorter plain-text phrase.');
  return { start: blockStart + offset, end: blockStart + offset + text.length };
}
