import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderMarkdown } from '../src/viewer/render.js';
import { selectionOffsets } from '../src/viewer/selection.js';
import { authorizeRequest } from '../src/bridge.js';

function rendered(source: string) {
  const output = renderMarkdown(source);
  const dom = new JSDOM(`<main>${output.html}</main>`);
  return { output, document: dom.window.document };
}
describe('browser Markdown renderer', () => {
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
    expect(()=>selectionOffsets(source,range)).toThrow(/plain|format|source/i);
    range.selectNodeContents(document.querySelector('p')!);
    expect(()=>selectionOffsets(source,range)).toThrow(/plain|format|source/i);
  });
  it('refuses a cross-paragraph selection and selections inside transformed code/diagrams', () => {
    const source = 'First paragraph.\n\nSecond paragraph.\n\n```js\nconst x=1\n```\n';
    const { document } = rendered(source); const paragraphs = document.querySelectorAll('p');
    const range = document.createRange(); range.setStart(paragraphs[0]!.firstChild!,0); range.setEnd(paragraphs[1]!.firstChild!,6);
    expect(() => selectionOffsets(source,range)).toThrow(/paragraph|block/i);
    const code = document.querySelector('code')!; range.selectNodeContents(code);
    expect(() => selectionOffsets(source,range)).toThrow(/paragraph|block/i);
  });
  it('rejects a selection whose rendered characters are not contiguous in the Markdown source', () => {
    const source = 'A **bold** phrase.\n'; const { document } = rendered(source);
    const range = document.createRange(); range.selectNodeContents(document.querySelector('p')!);
    expect(() => selectionOffsets(source,range)).toThrow(/source|format|exact/i);
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
