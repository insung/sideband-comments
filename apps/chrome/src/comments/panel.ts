import type { DocumentSnapshot } from '@sideband-comments/browser-protocol';

interface Actions { create(body: string): Promise<void>; reply(id: string, body: string): Promise<void> }
export function createCommentPanel(document: Document, actions: Actions) {
  const element = document.createElement('aside'); element.id = 'sideband-comments'; element.setAttribute('aria-label', 'Sideband comments');
  const heading = document.createElement('h2'); heading.textContent = 'Sideband Comments';
  const status = document.createElement('p'); status.setAttribute('role','status'); status.className='sideband-status'; status.textContent='Connecting to the local comment store…';
  const form = document.createElement('form'); form.className='sideband-compose';
  const selection = document.createElement('blockquote'); selection.textContent='Select text in one paragraph to add a comment.';
  const label = document.createElement('label'); label.textContent='New comment';
  const body = document.createElement('textarea'); body.name='comment'; body.rows=4; body.maxLength=16000; body.required=true; label.append(body);
  const submit = document.createElement('button'); submit.type='submit'; submit.textContent='Add comment'; submit.dataset.action='create'; submit.disabled=true;
  form.append(selection,label,submit);
  const list = document.createElement('div'); list.className='sideband-threads';
  element.append(heading,status,form,list);
  let ready=false, selected=false, busy=false;
  const update = () => {
    submit.disabled=!ready || !selected || busy;
    for (const button of list.querySelectorAll<HTMLButtonElement>('button')) button.disabled=busy || button.dataset.blocked==='true';
  };
  const failure = (error: unknown) => { status.textContent=error instanceof Error ? error.message : String(error); status.dataset.error='true'; };
  const perform = async (operation: () => Promise<void>) => {
    busy=true; update();
    try { await operation(); } catch (error) { failure(error); }
    finally { busy=false; update(); }
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (submit.disabled || !body.value.trim()) return;
    void perform(async()=>{ await actions.create(body.value.trim()); body.value=''; });
  });
  return {
    element,
    select(text: string) { selected=!!text; selection.textContent=text || 'Select text in one paragraph to add a comment.'; update(); },
    error(message: string) { failure(message); },
    disconnected(message: string) { ready=false; failure(message); update(); },
    show(snapshot: DocumentSnapshot) {
      ready=true; status.dataset.error='false'; status.textContent=`${snapshot.threads.length} thread(s) · ${snapshot.path}`;
      list.replaceChildren();
      for (const {thread,resolution} of snapshot.threads) {
        const article=document.createElement('article'); article.dataset.threadId=thread.id; article.className='sideband-thread';
        const quote=document.createElement('blockquote'); quote.textContent=thread.anchor.exact;
        const state=document.createElement('p'); state.className='sideband-thread-state'; state.textContent=thread.status==='resolved' ? 'Resolved' : resolution.kind==='resolved' ? 'Open' : `Anchor ${resolution.kind}`;
        article.append(quote,state);
        for (const comment of thread.comments) {
          const entry=document.createElement('section'); const author=document.createElement('strong'); author.textContent=comment.author.name;
          const time=document.createElement('time'); time.dateTime=comment.createdAt; time.textContent=new Date(comment.createdAt).toLocaleString();
          const text=document.createElement('p'); text.className='sideband-comment-body'; text.textContent=comment.body;
          entry.append(author,time,text); article.append(entry);
        }
        const blocked=thread.status==='resolved' || resolution.kind!=='resolved';
        if (!blocked) {
          const replyForm=document.createElement('form');
          const replyLabel=document.createElement('label'); replyLabel.textContent='Reply';
          const reply=document.createElement('textarea'); reply.name='reply'; reply.rows=2; reply.maxLength=16000; reply.required=true;
          replyLabel.append(reply);
          const button=document.createElement('button'); button.type='submit'; button.textContent='Send reply';
          replyForm.append(replyLabel,button);
          replyForm.addEventListener('submit',event=>{ event.preventDefault(); if (busy || !reply.value.trim()) return; void perform(()=>actions.reply(thread.id,reply.value.trim())); });
          article.append(replyForm);
        }
        list.append(article);
      }
      update();
    }
  };
}
