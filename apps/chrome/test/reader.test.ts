import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import type { DocumentSnapshot } from '@sideband-comments/browser-protocol';
import { createReader } from '../src/viewer/reader.js';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dispatch } from '../../native-host/src/handler.js';
import { JsonlThreadRepository } from '../../../packages/jsonl-store/src/index.js';

async function setup(source = '# Main\n\n## Section\n\n### Deep\n\nReview **this phrase** now.\n') {
  const dom = new JSDOM('<html><head><link rel="icon" href="old.png"></head><body><pre></pre></body></html>',{url:'file:///project/doc.md'});
  const snapshot: DocumentSnapshot = {source,version:'a'.repeat(64),projectRoot:'/project',path:'doc.md',threads:[]};
  const request = vi.fn(async (_message: Record<string, unknown>) => snapshot);
  const highlights = new Map();
  Object.defineProperty(dom.window,'CSS',{value:{highlights}});
  Object.defineProperty(dom.window,'Highlight',{value:class {constructor(public range:Range){}}});
  const reader = await createReader(dom.window.document,{
    request, loadWidths:async()=>({left:260,right:380}),saveWidths:()=>{},
    diagrams:async()=>{},iconUrl:'chrome-extension://test/icon.png'
  });
  return {dom,reader,snapshot,request,highlights,doc:dom.window.document};
}
describe('Chrome reader integration', () => {
  it('shows readable source and a clear error instead of retrying a failed renderer', async () => {
    const source='# Readable fallback\n\nText remains accessible.\n';
    const dom=new JSDOM('<head></head><body></body>',{url:'file:///project/doc.md'});
    const diagrams=vi.fn(async()=>{throw new Error('Renderer failed');});
    await expect(createReader(dom.window.document,{request:async()=>({source,version:'a'.repeat(64),projectRoot:'/project',path:'doc.md',threads:[]}),loadWidths:async()=>({}),saveWidths:()=>{},diagrams,iconUrl:'icon.png'})).resolves.toBeDefined();
    expect(diagrams).toHaveBeenCalledTimes(1);
    expect(dom.window.document.querySelector('#sideband-document')?.textContent).toContain('Text remains accessible.');
    expect(dom.window.document.querySelector('[role="status"]')?.textContent).toContain('Renderer failed');
  });
  it('renders H1/H2 contents, replaces a stale favicon and removes toolbar controls', async () => {
    const {doc} = await setup();
    expect([...doc.querySelectorAll('#sideband-toc a')].map(x=>x.textContent)).toEqual(['Main','Section']);
    expect(doc.querySelector('h3')?.textContent).toBe('Deep');
    expect([...doc.querySelectorAll('button')].map(x=>x.textContent)).not.toContain('Refresh');
    expect([...doc.querySelectorAll('button')].map(x=>x.textContent)).not.toContain('Toggle contents');
    expect(doc.querySelectorAll('link[rel~="icon"]')).toHaveLength(1);
    expect(doc.querySelector('link[rel~="icon"]')?.getAttribute('href')).toBe('chrome-extension://test/icon.png');
  });
  it('enables Add comment on formatted text and pins its highlight while typing in the panel', async () => {
    const {doc,dom,request,highlights,snapshot} = await setup();
    const range=doc.createRange();range.selectNodeContents(doc.querySelector('#sideband-document strong')!);
    dom.window.getSelection()!.removeAllRanges();dom.window.getSelection()!.addRange(range);
    doc.dispatchEvent(new dom.window.Event('selectionchange'));
    expect((doc.querySelector('[data-action="create"]') as HTMLButtonElement).disabled).toBe(false);
    expect(highlights.has('sideband-selection')).toBe(true);
    const body=doc.querySelector<HTMLTextAreaElement>('[name="comment"]')!;body.focus();body.value='Selected formatted phrase';
    doc.dispatchEvent(new dom.window.Event('selectionchange'));
    (doc.querySelector('[data-action="create"]') as HTMLButtonElement).click();
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({type:'thread.create',body:'Selected formatted phrase',version:'a'.repeat(64)}));
    const sent=request.mock.calls.at(-1)![0];
    expect(snapshot.source.slice(sent.start as number,sent.end as number)).toContain('this phrase');
  });
  it('recognizes a new document selection even when the comment composer still has focus', async () => {
    const {doc,dom,request} = await setup('# Heading\n\nChoose this text after typing a draft.\n');
    const body=doc.querySelector<HTMLTextAreaElement>('[name="comment"]')!;
    body.focus(); body.value='Draft written before selecting text';
    const range=doc.createRange(); range.selectNodeContents(doc.querySelector('#sideband-document p')!);
    dom.window.getSelection()!.removeAllRanges(); dom.window.getSelection()!.addRange(range);
    doc.dispatchEvent(new dom.window.Event('selectionchange'));
    const button=doc.querySelector<HTMLButtonElement>('[data-action="create"]')!;
    expect(button.disabled).toBe(false);
    expect(body.value).toBe('Draft written before selecting text');
    button.click(); await new Promise(resolve=>setTimeout(resolve,0));
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({type:'thread.create',body:'Draft written before selecting text'}));
  });
  it('explains stale writes without adding a Refresh button or losing the draft', async () => {
    const {doc,dom,request} = await setup('# Heading\n\nPlain text to review.\n');
    const range=doc.createRange();range.selectNodeContents(doc.querySelector('#sideband-document p')!);
    dom.window.getSelection()!.addRange(range);doc.dispatchEvent(new dom.window.Event('selectionchange'));
    const body=doc.querySelector<HTMLTextAreaElement>('[name="comment"]')!;body.value='Keep this draft';
    request.mockRejectedValueOnce(new Error('Document changed. Reload this Markdown tab before commenting.'));
    (doc.querySelector('[data-action="create"]') as HTMLButtonElement).click();
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(doc.querySelector('[role="status"]')?.textContent).toContain('Reload this Markdown tab');
    expect(body.value).toBe('Keep this draft');
  });
  it('connects selection, reply, quote highlight, Resolve and filtering to the real shared store', async () => {
    const root=await mkdtemp('/private/tmp/sideband-reader-integration-');
    const file=join(root,'doc.md'), config=join(root,'host.json');
    const source='# Native test\n\nReview **this phrase** now.\n';
    await writeFile(file,source);
    await writeFile(config,JSON.stringify({roots:[root],author:'Reader tester',extensionId:'a'.repeat(32)}));
    const dom=new JSDOM('<head></head><body><pre></pre></body>',{url:pathToFileURL(file).href});
    const doc=dom.window.document, highlights=new Map();
    Object.defineProperty(dom.window,'CSS',{value:{highlights}});
    Object.defineProperty(dom.window,'Highlight',{value:class {constructor(public range:Range){}}});
    try {
      await createReader(doc,{request:async message=>await dispatch(config,{id:crypto.randomUUID(),url:pathToFileURL(file).href,...message}) as DocumentSnapshot,loadWidths:async()=>({}),saveWidths:()=>{},diagrams:async()=>{},iconUrl:'icon.png'});
      const range=doc.createRange();range.selectNodeContents(doc.querySelector('#sideband-document strong')!);
      dom.window.getSelection()!.addRange(range);doc.dispatchEvent(new dom.window.Event('selectionchange'));
      doc.querySelector<HTMLTextAreaElement>('[name="comment"]')!.value='Real store comment';
      doc.querySelector<HTMLButtonElement>('[data-action="create"]')!.click();
      await vi.waitFor(()=>expect(doc.querySelectorAll('.sideband-thread')).toHaveLength(1));
      doc.querySelector<HTMLTextAreaElement>('[name="reply"]')!.value='Real store reply';
      doc.querySelector<HTMLButtonElement>('[data-action="reply"]')!.click();
      await vi.waitFor(()=>expect(doc.querySelector('.sideband-thread')!.textContent).toContain('Real store reply'));
      doc.querySelector<HTMLButtonElement>('[data-action="reveal"]')!.click();
      expect(highlights.has('sideband-selection')).toBe(true);
      doc.querySelector<HTMLButtonElement>('[data-action="resolve"]')!.click();
      await vi.waitFor(()=>expect(doc.querySelector('.sideband-thread-state')!.textContent).toBe('Resolved'));
      doc.querySelector<HTMLButtonElement>('[data-action="toggle-resolved"]')!.click();
      expect(doc.querySelectorAll('.sideband-thread')).toHaveLength(0);
      doc.querySelector<HTMLButtonElement>('[data-action="toggle-resolved"]')!.click();
      expect(doc.querySelectorAll('.sideband-thread')).toHaveLength(1);
      const threads=await new JsonlThreadRepository(root).listByDocument('doc.md');
      expect(threads[0]?.status).toBe('resolved'); expect(threads[0]?.comments).toHaveLength(2);
      expect(await readFile(file,'utf8')).toBe(source);
    } finally { dom.window.close(); await rm(root,{recursive:true,force:true}); }
  });
});
