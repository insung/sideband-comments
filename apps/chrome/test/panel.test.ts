import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import type { DocumentSnapshot } from '@sideband-comments/browser-protocol';
import { createCommentPanel } from '../src/comments/panel.js';

const snapshot = (): DocumentSnapshot => {
  const anchor = {exact:'hello',prefix:'',suffix:'',position:0};
  return {author:'Reader',source:'hello',version:'a'.repeat(64),path:'doc.md',projectRoot:'/project',threads:[
    {thread:{id:'open',documentPath:'doc.md',originalAnchor:anchor,anchor,status:'open',deleted:false,comments:[{id:'c1',author:{id:'a',name:'Reader'},createdAt:'2026-10-26T00:00:00Z',body:'<img src=x onerror=alert(1)>'}],revision:1,updatedAt:''},resolution:{kind:'resolved',start:0,end:5,confidence:'exact'}},
    {thread:{id:'done',documentPath:'doc.md',originalAnchor:anchor,anchor,status:'resolved',deleted:false,comments:[],revision:1,updatedAt:''},resolution:{kind:'resolved',start:0,end:5,confidence:'exact'}},
    {thread:{id:'lost',documentPath:'doc.md',originalAnchor:anchor,anchor,status:'open',deleted:false,comments:[],revision:1,updatedAt:''},resolution:{kind:'orphaned'}},
  ]};
};
function setup() {
  const dom=new JSDOM('<body></body>'); const doc=dom.window.document;
  const actions={create:vi.fn(async()=>{}),reply:vi.fn(async()=>{}),resolve:vi.fn(async()=>{}),reveal:vi.fn(),edit:vi.fn(async()=>{}),delete:vi.fn(async()=>{})};
  const panel=createCommentPanel(doc,actions); doc.body.append(panel.element);
  const button=(action:string)=>panel.element.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
  const thread=(id:string)=>panel.element.querySelector<HTMLElement>(`[data-thread-id="${id}"]`)!;
  return {dom,doc,actions,panel,button,thread};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));

describe('comment panel', () => {
  it('uses shared action names and positions and never edits another author on double click',()=>{
    const {panel,thread,dom}=setup();panel.show(snapshot());
    expect(thread('open').querySelector('[data-action="edit"]')).toBeNull();
    expect(thread('open').querySelector('[data-action="resolve"]')!.parentElement?.className).toBe('sideband-thread-heading');
    expect(thread('open').querySelector('[data-action="delete"]')!.parentElement?.className).toBe('sideband-comment-actions');
    expect(thread('open').querySelector('[data-action="reply"]')!.textContent).toBe('Reply');
    const other=snapshot();other.author='Other';panel.show(other);
    thread('open').querySelector('.sideband-comment-body')!.dispatchEvent(new dom.window.MouseEvent('dblclick'));
    expect(thread('open').querySelector('[name="edit"]')).toBeNull();
  });
  it('explains unavailable selections, submits new comments and keeps HTML inert', async () => {
    const {panel,button,actions}=setup();
    expect([...panel.element.querySelectorAll('button')].some(button=>button.textContent==='Settings')).toBe(false);
    expect(button('create').disabled).toBe(true);
    panel.show(snapshot());
    expect(panel.element.textContent).toContain('Select text');
    panel.select('', 'Select text within a single paragraph.');
    expect(panel.element.textContent).toContain('Select text within a single paragraph.');
    panel.select('hello'); expect(button('create').disabled).toBe(false);
    panel.element.querySelector<HTMLTextAreaElement>('[name="comment"]')!.value='Please clarify';
    button('create').click(); await settle(); expect(actions.create).toHaveBeenCalledWith('Please clarify');
    panel.error('<img src=x onerror=alert(1)>');
    expect(panel.element.querySelector('[role="status"]')!.textContent).toContain('<img');
    expect(panel.element.querySelector('img')).toBeNull();
  });

  it('toggles only resolved threads without losing drafts or refreshed focus', () => {
    const {panel,button,thread,doc,dom}=setup(); panel.show(snapshot());
    const reply=thread('open').querySelector<HTMLTextAreaElement>('[name="reply"]')!;
    reply.value='Draft reply'; reply.dispatchEvent(new dom.window.Event('input')); reply.focus(); reply.setSelectionRange(3,5);
    panel.show(snapshot());
    const refreshed=thread('open').querySelector<HTMLTextAreaElement>('[name="reply"]')!;
    expect(refreshed.value).toBe('Draft reply'); expect(doc.activeElement).toBe(refreshed); expect(refreshed.selectionStart).toBe(3);
    expect(button('toggle-resolved')).toBeNull(); panel.setHideResolved(true);
    expect(thread('open')).not.toBeNull(); expect(thread('lost')).not.toBeNull(); expect(thread('done')).toBeNull();
    panel.setHideResolved(false);
    expect(thread('done')).not.toBeNull(); expect(thread('open').querySelector<HTMLTextAreaElement>('[name="reply"]')!.value).toBe('Draft reply');
  });
  it('edits own comments with cancel, preserves failed drafts, and requires delete confirmation',async()=>{
    const {panel,thread,actions,doc}=setup();panel.show(snapshot());
    const click=(action:string)=>thread('open').querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
    thread('open').querySelector('.sideband-comment-body')!.dispatchEvent(new (doc.defaultView!.MouseEvent)('dblclick'));let input=thread('open').querySelector<HTMLTextAreaElement>('[name="edit"]')!;
    expect(input.value).toContain('<img');input.value='Discard';click('cancel-edit');expect(actions.edit).not.toHaveBeenCalled();
    thread('open').querySelector('.sideband-comment-body')!.dispatchEvent(new (doc.defaultView!.KeyboardEvent)('keydown',{key:'Enter'}));input=thread('open').querySelector<HTMLTextAreaElement>('[name="edit"]')!;input.value='Keep draft';
    actions.edit.mockRejectedValueOnce(new Error('Thread changed'));click('save-edit');await settle();
    expect(thread('open').querySelector<HTMLTextAreaElement>('[name="edit"]')!.value).toBe('Keep draft');
    expect(actions.edit).toHaveBeenCalledWith('open','c1','Keep draft',1);
    click('save-edit');await settle();expect(thread('open').querySelector('[name="edit"]')).toBeNull();
    click('delete');expect(actions.delete).not.toHaveBeenCalled();click('cancel-delete');expect(actions.delete).not.toHaveBeenCalled();
    click('delete');click('confirm-delete');await settle();expect(actions.delete).toHaveBeenCalledWith('open','c1',1);
    const other=snapshot();other.author='Other';panel.show(other);
    expect(thread('open').querySelector('[data-action="edit"]')).toBeNull();expect(thread('open').querySelector('[data-action="delete"]')).toBeNull();
  });
  it('preserves edit draft and focus when display preferences change',()=>{
    const {panel,thread,doc}=setup();panel.show(snapshot());
    thread('open').querySelector('.sideband-comment-body')!.dispatchEvent(new (doc.defaultView!.MouseEvent)('dblclick'));
    const input=thread('open').querySelector<HTMLTextAreaElement>('[name="edit"]')!;input.value='Unsubmitted edit';input.focus();input.setSelectionRange(2,5);
    panel.setHideResolved(true);
    const restored=thread('open').querySelector<HTMLTextAreaElement>('[name="edit"]')!;
    expect(restored.value).toBe('Unsubmitted edit');expect(doc.activeElement).toBe(restored);expect(restored.selectionStart).toBe(2);
  });

  it('reveals quotes, resolves open threads, and visibly explains disabled replies', async () => {
    const {panel,thread,actions}=setup(); panel.show(snapshot());
    thread('open').querySelector<HTMLButtonElement>('[data-action="reveal"]')!.click(); expect(actions.reveal).toHaveBeenCalledWith('open');
    expect(thread('done').querySelector<HTMLButtonElement>('[data-action="reply"]')!.disabled).toBe(true);
    expect(thread('done').textContent).toContain('resolved');
    expect(thread('lost').querySelector<HTMLButtonElement>('[data-action="reply"]')!.disabled).toBe(true);
    expect(thread('lost').textContent).toContain('anchor');
    thread('open').querySelector<HTMLButtonElement>('[data-action="resolve"]')!.click(); await settle(); expect(actions.resolve).toHaveBeenCalledWith('open');
  });

  it('disables writes during requests and disconnects, preserves failed reply drafts and shows errors', async () => {
    const {panel,thread,actions,button}=setup(); panel.show(snapshot()); panel.select('hello');
    let reject!:(reason:Error)=>void;
    actions.reply.mockImplementation(()=>new Promise<void>((_,fail)=>{reject=fail;}));
    const reply=thread('open').querySelector<HTMLTextAreaElement>('[name="reply"]')!; reply.value='Keep me';
    thread('open').querySelector<HTMLButtonElement>('[data-action="reply"]')!.click();
    expect(button('create').disabled).toBe(true); expect(thread('open').querySelector<HTMLButtonElement>('[data-action="resolve"]')!.disabled).toBe(true);
    reject(new Error('Reply failed')); await settle();
    expect(reply.value).toBe('Keep me'); expect(panel.element.querySelector('[role="status"]')!.textContent).toBe('Reply failed');
    panel.disconnected('Disconnected');
    expect(button('create').disabled).toBe(true); expect(thread('open').querySelector<HTMLButtonElement>('[data-action="reply"]')!.disabled).toBe(true);
    expect(thread('open').querySelector<HTMLButtonElement>('[data-action="resolve"]')!.disabled).toBe(true);
  });
});
