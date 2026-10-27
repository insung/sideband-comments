import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { captureAnchor, CommentService, foldThread, resolveAnchor, type ThreadEvent, type ThreadState } from '@sideband-comments/core';
import { JsonlThreadRepository } from '@sideband-comments/jsonl-store';
import { parseRequest, type DocumentSnapshot, type Result, type Settings } from '@sideband-comments/browser-protocol';
import { assertStoreSafe, documentAccess } from './access.js';
import { encodeMessage } from './framing.js';

export interface HostConfig extends Settings { extensionId: string }
export async function loadConfig(path: string): Promise<HostConfig> {
  const data: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!data || typeof data !== 'object') throw new Error('Invalid host configuration. Reinstall the native host.');
  const c = data as HostConfig;
  if (!/^[a-p]{32}$/.test(c.extensionId) || !Array.isArray(c.roots) || !c.roots.every(x => typeof x === 'string') || typeof c.author !== 'string') throw new Error('Invalid host configuration. Reinstall the native host.');
  return c;
}
export async function dispatch(configPath: string, raw: unknown): Promise<Result> {
  const request = parseRequest(raw);
  const config = await loadConfig(configPath);
  if (request.type === 'settings.get') return { roots: config.roots, author: config.author };
  if (request.type === 'settings.save') {
    const roots: string[] = [];
    for (const input of request.roots) {
      const root = await realpath(input.trim());
      if (!(await stat(root)).isDirectory()) throw new Error('Project root must be a directory.');
      roots.push(root);
    }
    const next = { ...config, roots: [...new Set(roots)], author: request.author.trim() };
    const temporary = `${configPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temporary, configPath);
    return { roots: next.roots, author: next.author };
  }
  const access = await documentAccess(request.url, config.roots);
  await assertStoreSafe(access.root);
  const source = await readFile(access.file, 'utf8');
  if (Buffer.byteLength(source, 'utf8') > 256 * 1024) throw new Error('Document is too large (maximum 256 KiB).');
  const version = createHash('sha256').update(source).digest('hex');
  const repository = new JsonlThreadRepository(access.root);
  // Stage the domain event so size/freshness failures cannot report an error after saving it.
  const staged: ThreadEvent[] = [];
  const service = new CommentService({
    append: async event => { staged.push(event); },
    readEvents: async id => [...await repository.readEvents(id), ...staged.filter(event => event.threadId === id)],
    list: hidden => repository.list(hidden),
    listByDocument: (path, hidden) => repository.listByDocument(path, hidden)
  }, {
    actor: () => ({ id: `chrome:${createHash('sha256').update(config.author).digest('hex').slice(0, 16)}`, name: config.author }),
    id: randomUUID,
    now: () => new Date().toISOString()
  });
  const threads = await repository.listByDocument(access.path);
  const checkComment = (thread: ThreadState, author: string) => {
    if (request.type !== 'comment.edit' && request.type !== 'comment.delete') return;
    if (thread.deleted || thread.documentPath !== access.path) throw new Error('Thread does not belong to this document.');
    const comment = thread.comments.find(comment => comment.id === request.commentId);
    if (!comment) throw new Error('Comment was deleted or does not exist. Reload this Markdown tab.');
    if (author !== config.author) throw new Error('Author settings changed. Reload this Markdown tab.');
    if (comment.author.name !== author) throw new Error('Only your own comments can be changed.');
    if (thread.revision !== request.expectedRevision) throw new Error('Thread changed in another client. Copy your draft and reload this Markdown tab.');
  };
  let updated: ThreadState | undefined;
  if (request.type !== 'document.read') {
    if (!config.author.trim()) throw new Error('Set your author name in extension settings.');
    if (request.version !== version) throw new Error('Document changed. Reload this Markdown tab before commenting.');
    if (request.type === 'thread.create') {
      const anchor = captureAnchor(source, request.start, request.end);
      if (!anchor.exact.trim()) throw new Error('Select nonblank text.');
      updated = await service.create({ documentPath: access.path, anchor, body: request.body });
    } else {
      const thread = await service.get(request.threadId);
      if (thread.documentPath !== access.path || thread.deleted) throw new Error('Thread does not belong to this document.');
      if (request.type === 'comment.edit' || request.type === 'comment.delete') {
        checkComment(thread, config.author);
        updated = request.type === 'comment.edit' ? await service.editComment(thread.id, request.commentId, request.body) : await service.deleteComment(thread.id, request.commentId);
      } else {
      if (thread.status === 'resolved') throw new Error(request.type === 'thread.resolve' ? 'This thread is already resolved.' : 'This thread is resolved. Reopen it in an editor before replying.');
      if (request.type === 'thread.reply' && resolveAnchor(source, thread.anchor).kind !== 'resolved') throw new Error('Thread anchor is orphaned or ambiguous. Re-anchor it in an editor before replying.');
      updated = request.type === 'thread.resolve' ? await service.resolve(thread.id) : await service.reply(thread.id, request.body);
      }
    }
  }
  const snapshot: DocumentSnapshot = {
    source, version, author: config.author, path: access.path, projectRoot: access.root,
    threads: [...threads.filter(thread => thread.id !== updated?.id), ...(updated ? [updated] : [])].map(thread => ({ thread, resolution: resolveAnchor(source, thread.anchor) }))
  };
  encodeMessage({ id: request.id, ok: true, value: snapshot });
  if (staged.length) {
    const current = await readFile(access.file, 'utf8');
    if (createHash('sha256').update(current).digest('hex') !== version) throw new Error('Document changed. Reload this Markdown tab before commenting.');
    await assertStoreSafe(access.root);
    for (const event of staged) await repository.append(event, async currentEvents => {
      // Another editor can hold the lock while the document or thread changes.
      const liveConfig = await loadConfig(configPath);
      const liveAccess = await documentAccess(request.url, liveConfig.roots);
      if (liveAccess.root !== access.root || liveAccess.file !== access.file) throw new Error('Project access changed. Reload this Markdown tab.');
      await assertStoreSafe(access.root);
      const liveSource = await readFile(liveAccess.file, 'utf8');
      if (createHash('sha256').update(liveSource).digest('hex') !== version) throw new Error('Document changed. Reload this Markdown tab before commenting.');
      if (request.type === 'comment.edit' || request.type === 'comment.delete') checkComment(foldThread(currentEvents), liveConfig.author);
      if (request.type === 'thread.reply' || request.type === 'thread.resolve') {
        const current = foldThread(currentEvents);
        if (current.deleted || current.documentPath !== access.path) throw new Error('Thread does not belong to this document.');
        if (current.status === 'resolved') throw new Error(request.type === 'thread.resolve' ? 'This thread is already resolved.' : 'This thread is resolved. Reopen it in an editor before replying.');
        if (request.type === 'thread.reply' && resolveAnchor(liveSource, current.anchor).kind !== 'resolved') throw new Error('Thread anchor is orphaned or ambiguous. Re-anchor it in an editor before replying.');
        if (request.type === 'thread.resolve') {
          // Preserve replies committed while this resolve waited for the shared lock.
          event.revision = current.revision + 1;
          const resolved = foldThread([...currentEvents, event]);
          snapshot.threads = snapshot.threads.map(entry => entry.thread.id === resolved.id
            ? { thread: resolved, resolution: resolveAnchor(liveSource, resolved.anchor) } : entry);
          encodeMessage({ id: request.id, ok: true, value: snapshot });
        }
      }
    });
  }
  return snapshot;
}
