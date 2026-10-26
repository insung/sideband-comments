import MarkdownIt from 'markdown-it';
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
  const lines = source.split('\n');
  const lineOffsets: number[] = [0];
  for (const line of lines) lineOffsets.push(lineOffsets[lineOffsets.length - 1]! + line.length + 1);
  const tokens = md.parse(source, {});
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
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
      toc.push({ id, title, level: Number(token.tag.slice(1)) });
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
