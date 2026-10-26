import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderMarkdown } from '../src/viewer/render.js';
import { selectionOffsets, sourceRange } from '../src/viewer/selection.js';
import { authorizeRequest } from '../src/bridge.js';

function rendered(source: string) {
  const output = renderMarkdown(source);
  const dom = new JSDOM(`<main>${output.html}</main>`);
  return { output, document: dom.window.document };
}
describe('browser Markdown renderer', () => {
  it.each(['\n', '\r\n'])('hides leading YAML metadata and preserves source offsets with %j newlines', newline => {
    const source = '\uFEFF' + ['---', 'title: Metadata title', 'tags: [example]', '---', '# Real heading', '', 'Review this phrase now.', ''].join(newline);
    const { output, document } = rendered(source);
    expect(output.toc.map(x => x.title)).toEqual(['Real heading']);
    expect(document.body.textContent).not.toContain('Metadata title');
    const paragraph = document.querySelector('p')!;
    const range = document.createRange(); range.setStart(paragraph.firstChild!, 7); range.setEnd(paragraph.firstChild!, 18);
    const selected = selectionOffsets(source, range);
    expect(selected).toEqual({ start: source.indexOf('this phrase'), end: source.indexOf('this phrase') + 11 });
  });
  it('accepts a YAML end marker but preserves unclosed metadata and later horizontal rules', () => {
    expect(rendered('---\ntitle: Hidden\n...\n# Heading\n').output.toc.map(x => x.title)).toEqual(['Heading']);
    expect(rendered('---\ntitle: Hidden\n...\n# Heading\n').document.body.textContent).not.toContain('title: Hidden');
    expect(rendered('---\ntitle: Visible\n').document.body.textContent).toContain('title: Visible');
    expect(rendered('# Heading\n\n---\n\nVisible\n').document.querySelector('hr')).not.toBeNull();
  });
  it('renders GFM, unique heading anchors, source lines, code highlighting and Mermaid containers', () => {
    const { output, document } = rendered('# Title\n\n## Same\n\n## Same\n\n|A|B|\n|-|-|\n|1|2|\n\n```js\nconst x = 1;\n```\n\n```mermaid\ngraph TD; A-->B\n```\n');
    expect(output.toc.map(x => x.id)).toEqual(['title','same','same-2']);
    expect(document.querySelector('table td')?.textContent).toBe('1');
    expect(document.querySelector('.token.keyword')?.textContent).toBe('const');
    expect(document.querySelector('.sideband-mermaid')?.textContent).toContain('graph TD');
    expect(document.querySelector('h1')?.getAttribute('data-source-start')).toBe('0');
  });
  it('keeps raw HTML inert and refuses executable links without emoji replacement', () => {
    const { document } = rendered('<script>globalThis.pwned=true</script>\n\n[x](javascript:alert(1))\n\n:smile: 😄\n');
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(document.body.textContent).toContain(':smile: 😄');
  });
  it('maps an exact phrase inside a single rendered paragraph to source offsets', () => {
    const source = '# Title\n\nReview this phrase now.\n';
    const { document } = rendered(source); const paragraph = document.querySelector('p')!;
    const range = document.createRange(); range.setStart(paragraph.firstChild!, 7); range.setEnd(paragraph.firstChild!, 18);
    const selected = selectionOffsets(source, range);
    expect(source.slice(selected.start, selected.end)).toBe('this phrase');
  });
  it('disambiguates repeated text using its location within the same paragraph', () => {
    const source = 'repeat repeat\n'; const { document } = rendered(source); const node = document.querySelector('p')!.firstChild!;
    const range = document.createRange(); range.setStart(node,7); range.setEnd(node,13);
    expect(selectionOffsets(source,range)).toEqual({start:7,end:13});
  });
  it('never maps visible link labels or combined text to hidden link destinations', () => {
    const source='[foo](foobar)bar\n'; const {document}=rendered(source);
    const range=document.createRange();range.selectNodeContents(document.querySelector('a')!);
    expect(selectionOffsets(source,range)).toEqual({ start: 1, end: 4 });
    range.selectNodeContents(document.querySelector('p')!);
    expect(selectionOffsets(source,range)).toEqual({ start: 1, end: 16 });
  });
  it('maps element-boundary formatted selection in a document with headings', () => {
    const source='# Main\n\n## Section\n\n### Deep\n\nReview **this phrase** now.\n';
    const {document}=rendered(source); const range=document.createRange();
    range.selectNodeContents(document.querySelector('strong')!);
    expect(selectionOffsets(source,range)).toEqual({start:source.indexOf('this phrase'),end:source.indexOf('this phrase')+11});
  });
  it('limits the ToC to H1/H2 while keeping deeper heading anchors', () => {
    const {output, document} = rendered('# One\n\n## Two\n\n### Three\n');
    expect(output.toc.map(x=>x.title)).toEqual(['One','Two']);
    expect(document.querySelector('h3')?.id).toBe('three');
  });
  it.each(['# **repeat** repeat\n', '- **repeat** repeat\n', '| **repeat** | repeat |\n|---|---|\n'])('maps formatted headings, lists and distinct table cells: %s', source => {
    const {document} = rendered(source);
    const strong = document.querySelector('strong')!;
    const range = document.createRange(); range.selectNodeContents(strong);
    const start = source.indexOf('repeat');
    expect(selectionOffsets(source,range)).toEqual({start,end:start+6});
    const restored = sourceRange(document.querySelector('main')!, source, start, start+6);
    expect(restored?.toString()).toBe('repeat');
  });
  it('disambiguates repeated formatted labels and never navigates to hidden destinations', () => {
    const source = '[repeat](repeat) **repeat** repeat\n';
    const {document} = rendered(source);
    const range=document.createRange(); range.selectNodeContents(document.querySelector('strong')!);
    const start=source.indexOf('repeat',source.indexOf('**'));
    expect(selectionOffsets(source,range)).toEqual({start,end:start+6});
    expect(sourceRange(document.querySelector('main')!,source,10,16)).toBeUndefined();
  });
  it('preserves UTF16 and CRLF endpoints across inline formatting after metadata', () => {
    const source='\uFEFF---\r\ntitle: Hidden\r\n---\r\n\r\nHello **😄 bold** end.\r\n';
    const {document}=rendered(source); const range=document.createRange();
    range.selectNodeContents(document.querySelector('strong')!);
    const start=source.indexOf('😄');
    expect(selectionOffsets(source,range)).toEqual({start,end:start+7});
  });
  it('maps soft line wraps and keeps text after hard breaks at its actual source offset', () => {
    for (const newline of ['\n','\r\n']) {
      const source='First line'+newline+'second **line**.'+newline;
      const {document}=rendered(source); const range=document.createRange();
      range.selectNodeContents(document.querySelector('p')!);
      expect(selectionOffsets(source,range)).toEqual({start:0,end:source.length-newline.length});
    }
    const source='xxx  \nxxx **xxx**'; const {document}=rendered(source);
    const range=document.createRange();range.selectNodeContents(document.querySelector('strong')!);
    expect(selectionOffsets(source,range)).toEqual({start:source.lastIndexOf('xxx'),end:source.lastIndexOf('xxx')+3});
  });
  it('maps the second identically named table cell and rejects cross-cell selections', () => {
    const source='| repeat | repeat |\n|---|---|\n'; const {document}=rendered(source);
    const cells=document.querySelectorAll('th'); const range=document.createRange();
    range.selectNodeContents(cells[1]!);
    expect(selectionOffsets(source,range)).toEqual({start:11,end:17});
    range.setStart(cells[0]!.firstChild!,0);
    expect(()=>selectionOffsets(source,range)).toThrow(/block|cell/);
  });
  it('maps exact inline code and complete bold/link/code paragraphs', () => {
    const source='Follow **design** [plan](DSN-014) in `DSN-014` now.\n';
    const {document}=rendered(source);const range=document.createRange();
    range.selectNodeContents(document.querySelector('code')!);
    const start=source.lastIndexOf('DSN-014');
    expect(selectionOffsets(source,range)).toEqual({start,end:start+7});
    expect(sourceRange(document.querySelector('main')!,source,start,start+7)?.toString()).toBe('DSN-014');
    range.selectNodeContents(document.querySelector('p')!);
    expect(selectionOffsets(source,range)).toEqual({start:0,end:source.length-1});
  });
  it.each(['` code `','`one\ntwo`','`` code ``'])('rejects normalized inline-code content: %s', source => {
    const {document}=rendered(source);const range=document.createRange();
    range.selectNodeContents(document.querySelector('code')!);
    expect(()=>selectionOffsets(source,range)).toThrow(/source/);
  });
  it('rejects transformed entities and code instead of assigning them source text by coincidence', () => {
    const source='&amp; then ` code `'; const {document}=rendered(source);
    const range=document.createRange();range.selectNodeContents(document.querySelector('p')!);
    expect(()=>selectionOffsets(source,range)).toThrow(/source/);
    expect(sourceRange(document.querySelector('main')!,source,0,1)).toBeUndefined();
    range.selectNodeContents(document.querySelector('code')!);
    expect(()=>selectionOffsets(source,range)).toThrow(/source/);
  });
  it('refuses a cross-paragraph selection and selections inside transformed code/diagrams', () => {
    const source = 'First paragraph.\n\nSecond paragraph.\n\n```js\nconst x=1\n```\n';
    const { document } = rendered(source); const paragraphs = document.querySelectorAll('p');
    const range = document.createRange(); range.setStart(paragraphs[0]!.firstChild!,0); range.setEnd(paragraphs[1]!.firstChild!,6);
    expect(() => selectionOffsets(source,range)).toThrow(/paragraph|block/i);
    const code = document.querySelector('code')!; range.selectNodeContents(code);
    expect(() => selectionOffsets(source,range)).toThrow(/paragraph|block/i);
  });
  it('maps formatted selections by their exact source endpoints', () => {
    const source = 'A **bold** phrase.\n'; const { document } = rendered(source);
    const range = document.createRange(); range.selectNodeContents(document.querySelector('p')!);
    expect(selectionOffsets(source,range)).toEqual({ start: 0, end: source.length - 1 });
  });
});
describe('extension request authorization', () => {
  const id = 'a'.repeat(32);
  it('pins document access to the actual sender URL rather than supplied paths', () => {
    expect(authorizeRequest({id:'1',type:'document.read',url:'file:///outside.md'}, {id,url:'file:///project/doc.md#heading'}, id)).toEqual({id:'1',type:'document.read',url:'file:///project/doc.md'});
  });
  it('permits project registration only from the extension settings page', () => {
    const request = {id:'1',type:'settings.save',roots:['/project'],author:'Reader'};
    expect(() => authorizeRequest(request,{id,url:'file:///project/doc.md'},id)).toThrow(/settings/i);
    expect(() => authorizeRequest(request,{id:'b'.repeat(32),url:`chrome-extension://${id}/options.html`},id)).toThrow();
    expect(authorizeRequest(request,{id,url:`chrome-extension://${id}/options.html`},id).type).toBe('settings.save');
    expect(() => authorizeRequest({id:'1',type:'document.read'}, {id,url:'https://example.com/a.md'},id)).toThrow();
  });
});
