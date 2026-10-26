import type { DocumentSnapshot } from '@sideband-comments/browser-protocol';

interface Actions {
  create(body: string): Promise<void>;
  reply(id: string, body: string): Promise<void>;
  resolve(id: string): Promise<void>;
  reveal(id: string): void;
  edit(threadId: string, commentId: string, body: string, expectedRevision: number): Promise<void>;
  delete(threadId: string, commentId: string, expectedRevision: number): Promise<void>;
}

export function createCommentPanel(document: Document, actions: Actions) {
  const element = document.createElement('aside');
  element.id = 'sideband-comments'; element.setAttribute('aria-label', 'Sideband comments');
  const heading = document.createElement('h2'); heading.textContent = 'Sideband Comments';
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.className = 'sideband-status';
  status.textContent = 'Connecting to the local comment store…';
  const form = document.createElement('form'); form.className = 'sideband-compose';
  const selection = document.createElement('blockquote');
  const selectionHelp = document.createElement('p'); selectionHelp.className = 'sideband-selection-help'; selectionHelp.id = 'sideband-selection-help';
  const label = document.createElement('label'); label.textContent = 'New comment';
  const body = document.createElement('textarea'); body.name = 'comment'; body.rows = 4; body.maxLength = 16000; body.required = true; label.append(body);
  const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Add comment'; submit.dataset.action = 'create';
  submit.setAttribute('aria-describedby', selectionHelp.id);
  form.append(selection, label, selectionHelp, submit);
  const list = document.createElement('div'); list.className = 'sideband-threads';
  element.append(heading, status, form, list);
  let ready = false, selected = false, busy = false, hideResolved = false;
  let selectionExplanation = 'Select text in one paragraph to add a comment.';
  let current: DocumentSnapshot | undefined;
  const drafts = new Map<string, string>();
  const edits = new Map<string, {body: string; revision: number}>();
  const deletions = new Map<string, number>();
  const update = () => {
    submit.disabled = !ready || !selected || busy;
    selectionHelp.textContent = !ready ? 'Comments are unavailable until the local comment store is connected.' : busy ? 'Saving comment changes…' : selectionExplanation;
    selectionHelp.hidden = !selectionHelp.textContent;
    body.disabled = busy;
    for (const button of list.querySelectorAll<HTMLButtonElement>('button')) {
      button.disabled = button.dataset.blocked === 'true' || (button.dataset.action !== 'reveal' && (!ready || busy));
    }
    for (const textarea of list.querySelectorAll<HTMLTextAreaElement>('textarea')) textarea.disabled = !ready || busy || textarea.dataset.blocked === 'true';
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
      for (const entry of article.querySelectorAll<HTMLElement>('[data-comment-id]')) {
        const input=entry.querySelector<HTMLTextAreaElement>('[name="edit"]'), edit=edits.get(entry.dataset.commentId!);
        if (input && edit) edit.body=input.value;
      }
    }
  };
  const render = () => {
    rememberDrafts();
    const active = document.activeElement;
    const focusedThread = active?.closest<HTMLElement>('[data-thread-id]')?.dataset.threadId;
    const focusedReply = focusedThread && active instanceof document.defaultView!.HTMLTextAreaElement ? active : undefined;
    const selectionStart = focusedReply?.selectionStart, selectionEnd = focusedReply?.selectionEnd;
    const focusedComment = focusedReply?.closest<HTMLElement>('[data-comment-id]')?.dataset.commentId;
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
        const entry = document.createElement('section'); entry.dataset.commentId = comment.id;
        const author = document.createElement('strong'); author.textContent = comment.author.name;
        const time = document.createElement('time'); time.dateTime = comment.createdAt; time.textContent = new Date(comment.createdAt).toLocaleString();
        const text = document.createElement('p'); text.className = 'sideband-comment-body'; text.textContent = comment.body;
        entry.append(author, time, text); article.append(entry);
        if (current?.author && comment.author.name === current.author) {
          const action = (name: string, title: string, run: () => void) => {
            const button = document.createElement('button'); button.type = 'button'; button.dataset.action = name; button.textContent = title;
            button.addEventListener('click', () => { if (!button.disabled) run(); }); entry.append(button);
          };
          const edit = edits.get(comment.id);
          if (edit) {
            const label = document.createElement('label'); label.textContent = 'Edit comment';
            const input = document.createElement('textarea'); input.name = 'edit'; input.rows = 3; input.maxLength = 16000; input.value = edit.body;
            input.addEventListener('input', () => { edit.body = input.value; }); label.append(input); entry.append(label);
            action('save-edit','Save',() => {
              edit.body = input.value;
              if (!edit.body.trim()) { failure(new Error('Comment body cannot be blank.')); return; }
              void perform(async()=>{ await actions.edit(thread.id,comment.id,edit.body.trim(),edit.revision); edits.delete(comment.id); render(); });
            });
            action('cancel-edit','Cancel',()=>{ edits.delete(comment.id); render(); });
          } else {
            action('edit','Edit',()=>{ edits.set(comment.id,{body:comment.body,revision:thread.revision}); deletions.delete(comment.id); render(); });
          }
          const deletion = deletions.get(comment.id);
          if (deletion !== undefined) {
            const warning = document.createElement('p'); warning.textContent = 'Delete this comment? Its saved history and other comments will remain.'; entry.append(warning);
            action('confirm-delete','Delete comment',()=>{ void perform(async()=>{ await actions.delete(thread.id,comment.id,deletion); deletions.delete(comment.id); edits.delete(comment.id); render(); }); });
            action('cancel-delete','Cancel',()=>{ deletions.delete(comment.id); render(); });
          } else if (!edit) action('delete','Delete',()=>{ deletions.set(comment.id,thread.revision); render(); });
        }
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
        const target = focusedReply.name === 'edit'
          ? [...article.querySelectorAll<HTMLElement>('[data-comment-id]')].find(item=>item.dataset.commentId===focusedComment)?.querySelector<HTMLTextAreaElement>('[name="edit"]')
          : reply;
        target?.focus(); target?.setSelectionRange(selectionStart!, selectionEnd!);
      }
    }
    update();
  };
  update();
  return {
    element,
    setHideResolved(value: boolean) { if (hideResolved !== value) { hideResolved = value; render(); } },
    select(text: string, explanation?: string) {
      selected = !!text; selection.textContent = text; selection.hidden = !text;
      selectionExplanation = explanation ?? (text ? '' : 'Select text in one paragraph to add a comment.'); update();
    },
    error(message: string) { failure(message); },
    disconnected(message: string) { ready = false; failure(message); update(); },
    show(snapshot: DocumentSnapshot) {
      if (current && (current.path !== snapshot.path || current.projectRoot !== snapshot.projectRoot)) { list.replaceChildren(); drafts.clear(); edits.clear(); deletions.clear(); }
      current = snapshot; ready = true; describe(); render();
    }
  };
}
