import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createCommentPanel } from '../src/comments/panel.js';

describe('comment panel', () => {
  it('requires a selection, submits a comment and keeps comment HTML inert', async () => {
    const dom = new JSDOM('<body></body>'); const doc=dom.window.document;
    const create=vi.fn(async()=>{});
    const panel=createCommentPanel(doc,{create,reply:async()=>{}});
    doc.body.append(panel.element);
    expect([...panel.element.querySelectorAll('button')].some(button => button.textContent === 'Settings')).toBe(false);
    const submit=panel.element.querySelector<HTMLButtonElement>('[data-action="create"]')!;
    expect(submit.disabled).toBe(true);
    panel.show({source:'hello',version:'a'.repeat(64),path:'doc.md',projectRoot:'/project',threads:[]});
    panel.select('hello'); expect(submit.disabled).toBe(false);
    panel.element.querySelector<HTMLTextAreaElement>('[name="comment"]')!.value='Please clarify';
    submit.click(); await new Promise(resolve=>setTimeout(resolve,0));
    expect(create).toHaveBeenCalledWith('Please clarify');
    panel.error('<img src=x onerror=alert(1)>');
    expect(panel.element.querySelector('[role="status"]')!.textContent).toContain('<img');
    expect(panel.element.querySelector('img')).toBeNull();
  });
});
