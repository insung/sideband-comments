import MarkdownIt from 'markdown-it';
import { inlineRuns, trackInlineSource } from './source-map.js';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-yaml.js';

export interface TocEntry { id: string; title: string; level: number }
export function renderMarkdown(source: string): { html: string; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  const usedIds = new Set<string>();
  const md = new MarkdownIt({
    html: false, linkify: true, typographer: false,
    highlight: (code, language) => {
      const grammar = Prism.languages[language];
      return grammar ? Prism.highlight(code, grammar, language) : '';
    }
  });
  trackInlineSource(md);
  const lines = source.split('\n');
  const lineOffsets: number[] = [0];
  for (const line of lines) lineOffsets.push(lineOffsets[lineOffsets.length - 1]! + line.length + 1);
  // Blank metadata in place so token line maps still refer to the untouched file.
  // Slicing it away would shift every later comment anchor.
  let renderSource = source;
  if (/^\uFEFF?---[\t ]*\r?$/.test(lines[0] || '')) {
    const end = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)[\t ]*\r?$/.test(line));
    if (end > 0) {
      const offset = lineOffsets[end + 1] ?? source.length;
      renderSource = source.slice(0, offset).replace(/[^\r\n]/g, ' ') + source.slice(offset);
    }
  }
  const tokens = md.parse(renderSource, {});
  let row: [number, number] | null = null;
  let cell = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type === 'tr_open') { row = token.map; cell = 0; }
    if (token.type === 'tr_close') row = null;
    if (token.type === 'inline') {
      const preceding = tokens[i - 1];
      const parent = preceding?.hidden ? tokens.slice(0, i).reverse().find(item => item.type === 'list_item_open') : preceding;
      const bounds = token.map || row;
      if (parent && bounds) {
        let from = lineOffsets[bounds[0]] ?? 0;
        let to = Math.min(source.length, lineOffsets[bounds[1]] ?? source.length);
        if (row && ['th_open', 'td_open'].includes(parent.type)) {
          const raw = source.slice(from, to).replace(/\r?\n$/, '');
          // Unescaped pipes delimit cells. Escaped pipes need a separate mapping
          // for the table parser's unescape step, so leave those rows unsupported.
          if (!raw.includes('\\|')) {
            const pipes = [...raw.matchAll(/\|/g)].map(match => match.index!);
            const edges = [0, ...pipes.map(pos => pos + 1)];
            const startCell = raw.trimStart().startsWith('|') ? 1 : 0;
            const at = startCell + cell++;
            from += edges[at] ?? raw.length;
            to = (lineOffsets[bounds[0]] ?? 0) + (pipes[at] ?? raw.length);
          } else from = to;
        }
        const positions: number[] = [];
        let normalized = '';
        for (let at = from; at < to; at++) {
          if (source[at] === '\r' && source[at + 1] === '\n') continue;
          normalized += source[at] === '\r' ? '\n' : source[at]; positions.push(at);
        }
        const found = normalized.indexOf(token.content);
        const unique = found >= 0 && normalized.indexOf(token.content, found + 1) < 0;
        const absolute = unique ? positions.slice(found, found + token.content.length) : [];
        parent.attrSet('data-source-map', JSON.stringify(inlineRuns(token, absolute)));
      }
    }
    if (token.map && ['paragraph_open', 'list_item_open', 'heading_open'].includes(token.type)) {
      token.attrSet('data-source-start', String(lineOffsets[token.map[0]] ?? 0));
      token.attrSet('data-source-end', String(Math.min(source.length, lineOffsets[token.map[1]] ?? source.length)));
    }
    if (token.type === 'heading_open') {
      const inline = tokens[i + 1];
      const title = inline?.children?.filter(x => ['text', 'code_inline', 'image', 'softbreak'].includes(x.type)).map(x => x.type === 'softbreak' ? ' ' : x.content).join('') || inline?.content || 'Heading';
      const base = title.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-') || 'heading';
      let id = base, counter = 1;
      while (usedIds.has(id)) id = `${base}-${++counter}`;
      usedIds.add(id); token.attrSet('id', id);
      if (Number(token.tag.slice(1)) <= 2) toc.push({ id, title, level: Number(token.tag.slice(1)) });
    }
  }
  const fence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (items, index, options, env, self) => {
    const token = items[index]!;
    if (/^(mermaid|mmd)(?:\s|$)/i.test(token.info.trim())) return `<pre class="sideband-mermaid">${md.utils.escapeHtml(token.content)}</pre>\n`;
    return fence(items, index, options, env, self);
  };
  const link = md.renderer.rules.link_open || ((items, index, options, _env, self) => self.renderToken(items, index, options));
  md.renderer.rules.link_open = (items, index, options, env, self) => {
    const token = items[index]!;
    token.attrSet('rel', 'noreferrer noopener');
    if (/^https?:/i.test(String(token.attrGet('href') || ''))) token.attrSet('target', '_blank');
    return link(items, index, options, env, self);
  };
  return { html: md.renderer.render(tokens, md.options, {}), toc };
}
