import type { DocumentSnapshot } from '@sideband-comments/browser-protocol';

interface Actions {
  create(body: string): Promise<void>;
  reply(id: string, body: string): Promise<void>;
  resolve(id: string): Promise<void>;
  reveal(id: string): void;
}

export function createCommentPanel(document: Document, actions: Actions) {
  const element = document.createElement('aside');
  element.id = 'sideband-comments'; element.setAttribute('aria-label', 'Sideband comments');
  const heading = document.createElement('h2'); heading.textContent = 'Sideband Comments';
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.className = 'sideband-status';
  status.textContent = 'Connecting to the local comment store…';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.dataset.action = 'toggle-resolved';
  const form = document.createElement('form'); form.className = 'sideband-compose';
  const selection = document.createElement('blockquote');
  const selectionHelp = document.createElement('p'); selectionHelp.className = 'sideband-selection-help'; selectionHelp.id = 'sideband-selection-help';
  const label = document.createElement('label'); label.textContent = 'New comment';
  const body = document.createElement('textarea'); body.name = 'comment'; body.rows = 4; body.maxLength = 16000; body.required = true; label.append(body);
  const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Add comment'; submit.dataset.action = 'create';
  submit.setAttribute('aria-describedby', selectionHelp.id);
  form.append(selection, label, selectionHelp, submit);
  const list = document.createElement('div'); list.className = 'sideband-threads';
  element.append(heading, status, toggle, form, list);
  let ready = false, selected = false, busy = false, hideResolved = false;
  let selectionExplanation = 'Select text in one paragraph to add a comment.';
  let current: DocumentSnapshot | undefined;
  const drafts = new Map<string, string>();
  const update = () => {
    submit.disabled = !ready || !selected || busy;
    selectionHelp.textContent = !ready ? 'Comments are unavailable until the local comment store is connected.' : busy ? 'Saving comment changes…' : selectionExplanation;
    selectionHelp.hidden = !selectionHelp.textContent;
    body.disabled = busy;
    for (const button of list.querySelectorAll<HTMLButtonElement>('button')) {
      button.disabled = button.dataset.blocked === 'true' || (button.dataset.action !== 'reveal' && (!ready || busy));
    }
    for (const textarea of list.querySelectorAll<HTMLTextAreaElement>('textarea')) textarea.disabled = !ready || busy || textarea.dataset.blocked === 'true';
    toggle.textContent = hideResolved ? 'Show Resolved' : 'Hide Resolved';
    toggle.setAttribute('aria-pressed', String(hideResolved));
    toggle.disabled = !current;
  };
  const failure = (error: unknown) => { status.textContent = error instanceof Error ? error.message : String(error); status.dataset.error = 'true'; };
  const describe = () => {
    if (!current) return;
    status.dataset.error = 'false'; status.textContent = `${current.threads.length} thread(s) · ${current.path}`;
  };
  const perform = async (operation: () => Promise<void>) => {
    busy = true; update();
    try { await operation(); if (ready) describe(); } catch (error) { failure(error); }
    finally { busy = false; update(); }
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (submit.disabled || !body.value.trim()) return;
    void perform(async () => { await actions.create(body.value.trim()); body.value = ''; });
  });
  const rememberDrafts = () => {
    for (const article of list.querySelectorAll<HTMLElement>('[data-thread-id]')) {
      const reply = article.querySelector<HTMLTextAreaElement>('[name="reply"]');
      if (reply) drafts.set(article.dataset.threadId!, reply.value);
    }
  };
  const render = () => {
    rememberDrafts();
    const active = document.activeElement;
    const focusedThread = active?.closest<HTMLElement>('[data-thread-id]')?.dataset.threadId;
    const focusedReply = focusedThread && active instanceof document.defaultView!.HTMLTextAreaElement ? active : undefined;
    const selectionStart = focusedReply?.selectionStart, selectionEnd = focusedReply?.selectionEnd;
    list.replaceChildren();
    for (const {thread, resolution} of current?.threads ?? []) {
      if (hideResolved && thread.status === 'resolved') continue;
      const article = document.createElement('article'); article.dataset.threadId = thread.id; article.className = 'sideband-thread';
      const quote = document.createElement('blockquote');
      const reveal = document.createElement('button'); reveal.type = 'button'; reveal.dataset.action = 'reveal'; reveal.className = 'sideband-quote';
      reveal.textContent = thread.anchor.exact; reveal.setAttribute('aria-label', `Show quoted text: ${thread.anchor.exact}`);
      reveal.dataset.blocked = String(resolution.kind !== 'resolved');
      reveal.addEventListener('click', () => { if (!reveal.disabled) actions.reveal(thread.id); }); quote.append(reveal);
      const state = document.createElement('p'); state.className = 'sideband-thread-state';
      state.textContent = thread.status === 'resolved' ? 'Resolved' : resolution.kind === 'resolved' ? 'Open' : `Anchor ${resolution.kind}`;
      article.append(quote, state);
      for (const comment of thread.comments) {
        const entry = document.createElement('section'); const author = document.createElement('strong'); author.textContent = comment.author.name;
        const time = document.createElement('time'); time.dateTime = comment.createdAt; time.textContent = new Date(comment.createdAt).toLocaleString();
        const text = document.createElement('p'); text.className = 'sideband-comment-body'; text.textContent = comment.body;
        entry.append(author, time, text); article.append(entry);
      }
      const blocked = thread.status === 'resolved' || resolution.kind !== 'resolved';
      const replyForm = document.createElement('form'); replyForm.className = 'sideband-reply';
      const replyLabel = document.createElement('label'); replyLabel.textContent = 'Reply';
      const reply = document.createElement('textarea'); reply.name = 'reply'; reply.rows = 2; reply.maxLength = 16000; reply.required = true;
      reply.value = drafts.get(thread.id) ?? ''; reply.dataset.blocked = String(blocked); replyLabel.append(reply);
      reply.addEventListener('input', () => drafts.set(thread.id, reply.value));
      const button = document.createElement('button'); button.type = 'submit'; button.textContent = 'Send reply'; button.dataset.action = 'reply'; button.dataset.blocked = String(blocked);
      replyForm.append(replyLabel, button);
      if (blocked) {
        const reason = document.createElement('p'); reason.className = 'sideband-reply-help'; reason.id = `sideband-reply-help-${thread.id}`;
        reason.textContent = thread.status === 'resolved' ? 'Replies are unavailable because this thread is resolved.' : `Replies are unavailable because the quote anchor is ${resolution.kind}.`;
        button.setAttribute('aria-describedby', reason.id); reply.setAttribute('aria-describedby', reason.id); replyForm.append(reason);
      }
      replyForm.addEventListener('submit', event => {
        event.preventDefault(); if (!ready || busy || blocked || !reply.value.trim()) return;
        const submitted = reply.value.trim();
        void perform(async () => {
          await actions.reply(thread.id, submitted); drafts.delete(thread.id);
          // A successful request may have refreshed the snapshot and replaced this field.
          for (const item of list.querySelectorAll<HTMLElement>('[data-thread-id]')) {
            if (item.dataset.threadId === thread.id) item.querySelector<HTMLTextAreaElement>('[name="reply"]')!.value = '';
          }
        });
      });
      article.append(replyForm);
      if (thread.status === 'open') {
        const resolve = document.createElement('button'); resolve.type = 'button'; resolve.textContent = 'Resolve'; resolve.dataset.action = 'resolve';
        resolve.addEventListener('click', () => { if (!resolve.disabled) void perform(() => actions.resolve(thread.id)); }); article.append(resolve);
      }
      list.append(article);
      if (focusedReply && thread.id === focusedThread) {
        reply.focus(); reply.setSelectionRange(selectionStart!, selectionEnd!);
      }
    }
    update();
  };
  toggle.addEventListener('click', () => { hideResolved = !hideResolved; render(); });
  update();
  return {
    element,
    select(text: string, explanation?: string) {
      selected = !!text; selection.textContent = text; selection.hidden = !text;
      selectionExplanation = explanation ?? (text ? '' : 'Select text in one paragraph to add a comment.'); update();
    },
    error(message: string) { failure(message); },
    disconnected(message: string) { ready = false; failure(message); update(); },
    show(snapshot: DocumentSnapshot) {
      if (current && (current.path !== snapshot.path || current.projectRoot !== snapshot.projectRoot)) { list.replaceChildren(); drafts.clear(); }
      current = snapshot; ready = true; describe(); render();
    }
  };
}
