import type { DocumentSnapshot } from '@sideband-comments/browser-protocol';
import { createCommentPanel } from './comments/panel.js';
import { send } from './client.js';
import { installPanelResizers } from './viewer/panel-widths.js';
import { renderMarkdown } from './viewer/render.js';
import { renderDiagrams } from './viewer/diagrams.js';
import { selectionOffsets, type SelectionOffsets } from './viewer/selection.js';

async function start(): Promise<void> {
  if (!/\.(md|markdown|mdown|mkdn|mkd)$/i.test(new URL(location.href).pathname)) return;
  if (document.getElementById('sideband-reader')) return;
  let source=document.body.querySelector('pre')?.textContent ?? document.body.textContent ?? '';
  let snapshot: DocumentSnapshot | undefined;
  let selected: SelectionOffsets | undefined;
  let updatePanelWidths: (() => void) | undefined;
  const layout=document.createElement('div'); layout.id='sideband-reader';
  const toc=document.createElement('nav'); toc.id='sideband-toc'; toc.setAttribute('aria-label','Table of contents');
  const main=document.createElement('main'); main.id='sideband-main';
  const toolbar=document.createElement('header'); toolbar.className='sideband-toolbar';
  const title=document.createElement('strong'); title.textContent=decodeURIComponent(location.pathname.split('/').pop() || 'Markdown');
  const refreshButton=document.createElement('button'); refreshButton.type='button'; refreshButton.textContent='Refresh';
  const tocButton=document.createElement('button'); tocButton.type='button'; tocButton.textContent='Toggle contents'; tocButton.addEventListener('click',()=>{ const hidden=getComputedStyle(toc).display==='none'; layout.classList.toggle('sideband-show-toc',hidden); layout.classList.toggle('sideband-hide-toc',!hidden); updatePanelWidths?.(); });
  toolbar.append(title,tocButton,refreshButton);
  const article=document.createElement('article'); article.id='sideband-document'; article.className='markdown-body';
  main.append(toolbar,article);
  const panel=createCommentPanel(document,{
    create:async body=>{
      if (!snapshot || !selected) throw new Error('Select text and connect the native host first.');
      const next=await send<DocumentSnapshot>({type:'thread.create',version:snapshot.version,...selected,body});
      snapshot=next; panel.show(next); selected=undefined; panel.select('');
    },
    reply:async (threadId,body)=>{
      if (!snapshot) throw new Error('Refresh the document first.');
      const next=await send<DocumentSnapshot>({type:'thread.reply',version:snapshot.version,threadId,body});
      snapshot=next; panel.show(next);
    }
  });
  layout.append(toc,main,panel.element); document.body.replaceChildren(layout);
  let savedWidths: unknown;
  try { savedWidths = (await chrome.storage.local.get('panelWidths')).panelWidths; } catch { /* Storage failure must not block reading. */ }
  updatePanelWidths = installPanelResizers(layout, savedWidths, widths => {
    void chrome.storage.local.set({panelWidths:widths}).catch(() => {});
  });
  const render=async()=>{
    selected=undefined; panel.select('');
    const rendered=renderMarkdown(source); article.innerHTML=rendered.html;
    const heading=document.createElement('h2'); heading.textContent='Contents'; toc.replaceChildren(heading);
    for (const entry of rendered.toc) {
      const anchor=document.createElement('a'); anchor.href=`#${entry.id}`; anchor.textContent=entry.title; anchor.style.paddingLeft=`${Math.min(4,entry.level-1)*12}px`; toc.append(anchor);
    }
    await renderDiagrams(article);
  };
  const refresh=async()=>{
    refreshButton.disabled=true;
    try { const next=await send<DocumentSnapshot>({type:'document.read'}); snapshot=next; source=next.source; await render(); panel.show(next); }
    catch(error) { snapshot=undefined; panel.disconnected(error instanceof Error ? error.message : 'Unable to load comments.'); }
    finally { refreshButton.disabled=false; }
  };
  refreshButton.addEventListener('click',()=>{void refresh();});
  document.addEventListener('selectionchange',()=>{
    const selection=window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || !article.contains(selection.anchorNode)) return;
    try { selected=selectionOffsets(source,selection.getRangeAt(0)); panel.select(source.slice(selected.start,selected.end)); }
    catch(error) { selected=undefined; panel.select(''); panel.error(error instanceof Error ? error.message : 'Unsupported selection.'); }
  });
  await render();
  await refresh();
}
void start().catch(error=>{ console.error('Sideband Comments viewer failed',error); });
