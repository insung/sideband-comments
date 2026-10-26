import type { DocumentSnapshot } from '@sideband-comments/browser-protocol';
import { createCommentPanel } from '../comments/panel.js';
import { installPanelResizers, type PanelWidths } from './panel-widths.js';
import { renderMarkdown } from './render.js';
import { normalizeSelectionRange, selectionOffsets, sourceRange, type SelectionOffsets } from './selection.js';

interface ReaderOptions {
  request(message: Record<string, unknown>): Promise<DocumentSnapshot>;
  loadWidths(): Promise<unknown>;
  saveWidths(widths: PanelWidths): void | Promise<void>;
  diagrams(article: HTMLElement): Promise<void>;
  iconUrl: string;
}

export async function createReader(document: Document, options: ReaderOptions) {
  const win = document.defaultView!;
  let source = document.body.querySelector('pre')?.textContent ?? document.body.textContent ?? '';
  let snapshot: DocumentSnapshot | undefined;
  let selected: SelectionOffsets | undefined;
  const layout = document.createElement('div'); layout.id = 'sideband-reader';
  const toc = document.createElement('nav'); toc.id = 'sideband-toc'; toc.setAttribute('aria-label','Table of contents');
  const main = document.createElement('main'); main.id = 'sideband-main'; main.tabIndex = 0;
  const toolbar = document.createElement('header'); toolbar.className = 'sideband-toolbar';
  const title = document.createElement('strong'); title.textContent = decodeURIComponent(new URL(document.URL).pathname.split('/').pop() || 'Markdown');
  toolbar.append(title);
  const article = document.createElement('article'); article.id = 'sideband-document'; article.className = 'markdown-body';
  main.append(toolbar,article);
  const highlightWindow = win as unknown as {
    CSS?: {highlights?: {set(name:string,value:unknown):void;delete(name:string):void}};
    Highlight?: new (...ranges: Range[]) => unknown;
  };
  const highlight = (range?: Range) => {
    const registry = highlightWindow.CSS?.highlights;
    registry?.delete('sideband-selection');
    if (range && registry && highlightWindow.Highlight) registry.set('sideband-selection',new highlightWindow.Highlight(range));
  };
  const accept = (next: DocumentSnapshot) => { snapshot = next; panel.show(next); };
  const panel = createCommentPanel(document,{
    create:async body => {
      if (!snapshot || !selected) throw new Error('Select document text and connect the local host first.');
      accept(await options.request({type:'thread.create',version:snapshot.version,...selected,body}));
      selected = undefined; highlight(); panel.select('');
    },
    reply:async (threadId,body) => {
      if (!snapshot) throw new Error('Reload this Markdown tab before replying.');
      accept(await options.request({type:'thread.reply',version:snapshot.version,threadId,body}));
    },
    resolve:async threadId => {
      if (!snapshot) throw new Error('Reload this Markdown tab before resolving.');
      accept(await options.request({type:'thread.resolve',version:snapshot.version,threadId}));
    },
    reveal:threadId => {
      const entry = snapshot?.threads.find(({thread})=>thread.id===threadId);
      if (entry?.resolution.kind !== 'resolved') { panel.error('The quoted text moved or was removed. Re-anchor this thread in an editor.'); return; }
      const range = sourceRange(article,source,entry.resolution.start,entry.resolution.end);
      if (!range) { panel.error('This quote cannot be highlighted in the rendered document. Open it in an editor.'); return; }
      highlight(range);
      const target = range.startContainer.nodeType === 1 ? range.startContainer as Element : range.startContainer.parentElement;
      target?.scrollIntoView?.({block:'center',behavior:'smooth'});
    }
  });
  layout.append(toc,main,panel.element); document.body.replaceChildren(layout);
  for (const old of document.head.querySelectorAll('link[rel~="icon"],link[rel="shortcut icon"]')) old.remove();
  const icon = document.createElement('link'); icon.rel = 'icon'; icon.type = 'image/png'; icon.href = options.iconUrl;
  document.head.append(icon);
  let widths: unknown;
  try { widths = await options.loadWidths(); } catch { /* Reading does not depend on saved preferences. */ }
  installPanelResizers(layout,widths,next=>{
    try { void Promise.resolve(options.saveWidths(next)).catch(()=>{}); } catch { /* Keep resizing usable without storage. */ }
  });
  const render = async () => {
    selected = undefined; highlight(); panel.select('');
    const rendered = renderMarkdown(source); article.innerHTML = rendered.html;
    const heading = document.createElement('h2'); heading.textContent = 'Contents'; toc.replaceChildren(heading);
    for (const entry of rendered.toc) {
      const anchor = document.createElement('a'); anchor.href = `#${entry.id}`; anchor.textContent = entry.title;
      anchor.style.paddingLeft = `${(entry.level-1)*12}px`;
      anchor.addEventListener('click',event=>{
        event.preventDefault();
        document.getElementById(entry.id)?.scrollIntoView?.({block:'start',behavior:'smooth'});
        win.history.replaceState(null,'',`#${encodeURIComponent(entry.id)}`);
      });
      toc.append(anchor);
    }
    await options.diagrams(article);
  };
  const captureSelection = () => {
    const selection = win.getSelection();
    if (!selection?.rangeCount || !article.contains(selection.anchorNode)) return;
    if (selection.isCollapsed) {
      // Typing in the composer may collapse the browser selection. Keep the
      // pinned quote, but accept every new noncollapsed document selection.
      if (!panel.element.contains(document.activeElement)) { selected = undefined; highlight(); panel.select(''); }
      return;
    }
    try {
      const range = normalizeSelectionRange(selection.getRangeAt(0));
      selected = selectionOffsets(source,range);
      highlight(range.cloneRange()); panel.select(range.toString());
    } catch (error) {
      selected = undefined; highlight();
      panel.select('',error instanceof Error ? error.message : 'Select supported text inside one document block.');
    }
  };
  document.addEventListener('selectionchange',captureSelection);
  article.addEventListener('pointerup',captureSelection);
  article.addEventListener('keyup',captureSelection);
  let connectionError: unknown;
  try { snapshot = await options.request({type:'document.read'}); source = snapshot.source; }
  catch (error) { snapshot = undefined; connectionError = error; }
  try {
    await render();
    if (snapshot) panel.show(snapshot);
    else panel.disconnected(connectionError instanceof Error ? connectionError.message : 'Unable to connect. Check the local host and project settings.');
  } catch (error) {
    snapshot = undefined;
    const fallback = document.createElement('pre'); fallback.textContent = source;
    article.replaceChildren(fallback); toc.replaceChildren();
    panel.disconnected(`Unable to render Markdown. ${error instanceof Error ? error.message : 'Reload this Markdown tab.'}`);
  }
  return { element:layout, dispose() { document.removeEventListener('selectionchange',captureSelection); highlight(); } };
}
