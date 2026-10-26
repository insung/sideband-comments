import type { Settings } from '@sideband-comments/browser-protocol';
import { send } from '../client.js';

const form=document.querySelector<HTMLFormElement>('form')!;
const roots=document.querySelector<HTMLTextAreaElement>('#roots')!;
const author=document.querySelector<HTMLInputElement>('#author')!;
const status=document.querySelector<HTMLElement>('[role="status"]')!;
const button=form.querySelector<HTMLButtonElement>('button')!;
const report=(error:unknown)=>{status.textContent=error instanceof Error ? error.message : String(error);status.dataset.error='true';};
async function load():Promise<void> {
  try {
    const settings=await send<Settings>({type:'settings.get'}); roots.value=settings.roots.join('\n'); author.value=settings.author;
    status.textContent='Local host connected. Add the project folder containing your Markdown and .comments store.';
    status.dataset.error='false';
  } catch(error){report(error);}
}
form.addEventListener('submit',event=>{
  event.preventDefault(); button.disabled=true;
  void (async()=>{
    try {
      await send<Settings>({type:'settings.save',roots:roots.value.split('\n').map(x=>x.trim()).filter(Boolean),author:author.value.trim()});
      status.textContent='Settings saved. Return to the Markdown tab and click Refresh.';status.dataset.error='false';
    } catch(error){report(error);} finally{button.disabled=false;}
  })();
});
void load();
