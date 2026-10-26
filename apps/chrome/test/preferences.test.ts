import { expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { installResolvedSettings, watchResolvedPreference } from '../src/settings/preferences.js';

function storage(){
  let value:unknown=false; const listeners=new Set<(value:unknown)=>void>();
  return {get:async()=>value,set:async(next:boolean)=>{value=next;for(const fn of listeners)fn(value);},subscribe:(fn:(value:unknown)=>void)=>{listeners.add(fn);return ()=>listeners.delete(fn);}};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
it('stores the settings toggle, restores it on reopening and updates existing readers',async()=>{
  const store=storage(), values:boolean[]=[];
  const stop=await watchResolvedPreference(store,value=>values.push(value));
  const dom=new JSDOM('<button id="resolved"></button><p id="resolved-status"></p>');
  await installResolvedSettings(dom.window.document,store);
  const button=dom.window.document.querySelector<HTMLButtonElement>('button')!;
  expect(button.textContent).toBe('Hide Resolved');button.click();await settle();
  expect(button.textContent).toBe('Show Resolved');expect(values).toEqual([false,true]);
  const reopened=new JSDOM('<button id="resolved"></button><p id="resolved-status"></p>');
  await installResolvedSettings(reopened.window.document,store);
  expect(reopened.window.document.querySelector('button')!.textContent).toBe('Show Resolved');
  stop();await store.set(false);expect(values).toEqual([false,true]);
});
it('does not apply a stale initial load over a newer change and shows storage failures',async()=>{
  let listener!:(v:unknown)=>void,resolve!:(v:unknown)=>void;
  const seen:boolean[]=[];
  const pending=watchResolvedPreference({get:()=>new Promise(r=>resolve=r),set:async()=>{},subscribe:fn=>{listener=fn;return ()=>{};}},v=>seen.push(v));
  listener(true);resolve(false);await pending;expect(seen).toEqual([true]);
  const dom=new JSDOM('<button id="resolved"></button><p id="resolved-status"></p>');
  await installResolvedSettings(dom.window.document,{get:async()=>false,set:async()=>{throw new Error('Storage unavailable');},subscribe:()=>()=>{}});
  dom.window.document.querySelector<HTMLButtonElement>('button')!.click();await settle();
  expect(dom.window.document.querySelector('#resolved-status')!.textContent).toContain('Storage unavailable');
  expect(dom.window.document.querySelector('button')!.textContent).toBe('Hide Resolved');
});
