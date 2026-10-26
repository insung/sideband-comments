import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendFile, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CommentService, createEventFactory } from '@sideband-comments/core';
import { JsonlThreadRepository } from '@sideband-comments/jsonl-store';
import { randomUUID } from 'node:crypto';
import { dispatch } from '../src/handler.js';

let temp: string, root: string, file: string, config: string;
const source = '# 문서\n\nA precise phrase for review.\n\nSecond paragraph.\n';
const call = (request: object) => dispatch(config, { id: 'test', ...request });
const read = () => call({ type: 'document.read', url: pathToFileURL(file).href }) as Promise<any>;
const create = async () => {
  const snapshot = await read();
  return call({ type: 'thread.create', url: pathToFileURL(file).href, version: snapshot.version, start: source.indexOf('precise'), end: source.indexOf('precise') + 14, body: 'Please clarify' }) as Promise<any>;
};
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'sideband-native-test-'));
  root = join(temp, 'project'); await mkdir(root);
  file = join(root, '한글 문서.md'); await writeFile(file, source);
  config = join(temp, 'config.json');
  await writeFile(config, JSON.stringify({ extensionId: 'a'.repeat(32), roots: [root], author: 'Local reviewer' }));
});
afterEach(async () => { vi.restoreAllMocks(); await rm(temp, { recursive: true, force: true }); });

describe('native comment handler', () => {
  it('creates and replies using the existing append-only repository without changing Markdown', async () => {
    const created = await create();
    expect(created.threads).toHaveLength(1);
    const thread = created.threads[0].thread;
    expect(thread.anchor.exact).toBe('precise phrase');
    expect(thread.comments[0].author.name).toBe('Local reviewer');
    const replied: any = await call({ type: 'thread.reply', url: pathToFileURL(file).href, version: created.version, threadId: thread.id, body: 'Follow-up' });
    expect(replied.threads[0].thread.comments.map((x: any) => x.body)).toEqual(['Please clarify', 'Follow-up']);
    const repository = new JsonlThreadRepository(root);
    expect((await repository.listByDocument('한글 문서.md'))[0]?.comments).toHaveLength(2);
    expect(await readFile(file, 'utf8')).toBe(source);
    expect((await read()).threads).toHaveLength(1);
  });
  it('refuses stale writes, including replies after the document changes', async () => {
    const created = await create(); await writeFile(file, source + 'New content');
    await expect(call({ type: 'thread.reply', url: pathToFileURL(file).href, version: created.version, threadId: created.threads[0].thread.id, body: 'x' })).rejects.toThrow(/changed|refresh/i);
    expect((await new JsonlThreadRepository(root).list())[0]?.comments).toHaveLength(1);
  });
  it('rejects an unregistered file and a symlink escaping the registered project', async () => {
    const outside = join(temp, 'outside.md'); await writeFile(outside, 'Outside');
    await expect(call({ type: 'document.read', url: pathToFileURL(outside).href })).rejects.toThrow(/registered|outside/i);
    const link = join(root, 'escape.md'); await symlink(outside, link);
    await expect(call({ type: 'document.read', url: pathToFileURL(link).href })).rejects.toThrow(/registered|outside/i);
  });
  it('rejects symlinked comment stores and files', async () => {
    const outside = join(temp, 'outside-store'); await mkdir(outside);
    await symlink(outside, join(root, '.comments'));
    await expect(create()).rejects.toThrow(/symlink/i);
  });
  it('does not let a request reply to another document thread', async () => {
    const created = await create(); const second = join(root, 'second.md'); await writeFile(second, 'Another document');
    const snapshot: any = await call({ type: 'document.read', url: pathToFileURL(second).href });
    await expect(call({ type: 'thread.reply', url: pathToFileURL(second).href, version: snapshot.version, threadId: created.threads[0].thread.id, body: 'x' })).rejects.toThrow(/document/i);
  });
  it('does not reply to resolved or orphaned threads', async () => {
    const created = await create(); const id = created.threads[0].thread.id;
    const service = new CommentService(new JsonlThreadRepository(root), { actor: () => ({ id: 'test', name: 'test' }), id: randomUUID, now: () => new Date().toISOString() });
    await service.resolve(id);
    await expect(call({ type: 'thread.reply', url: pathToFileURL(file).href, version: created.version, threadId: id, body: 'x' })).rejects.toThrow(/resolved/i);
    await service.reopen(id); await writeFile(file, source.replace('precise phrase', 'different wording'));
    const snapshot = await read();
    await expect(call({ type: 'thread.reply', url: pathToFileURL(file).href, version: snapshot.version, threadId: id, body: 'x' })).rejects.toThrow(/anchor|orphan/i);
  });
  it('updates settings only with real directories and a nonblank author', async () => {
    await expect(call({ type: 'settings.save', roots: [file], author: 'Reader' })).rejects.toThrow(/directory/i);
    await call({ type: 'settings.save', roots: [root], author: 'Reader' });
    expect(JSON.parse(await readFile(config, 'utf8')).author).toBe('Reader');
  });
  it('rejects non-Markdown files and oversized documents', async () => {
    const text = join(root, 'secret.txt'); await writeFile(text, 'secret');
    await expect(call({ type: 'document.read', url: pathToFileURL(text).href })).rejects.toThrow(/Markdown/i);
    await writeFile(file, 'a'.repeat(600_000));
    await expect(read()).rejects.toThrow(/large|size/i);
  });
});


it('rejects a write before appending when its response would exceed the native message limit', async () => {
  const content='"'.repeat(200_000); await writeFile(file,content);
  const snapshot=await read();
  await expect(call({type:'thread.create',url:pathToFileURL(file).href,version:snapshot.version,start:0,end:content.length,body:'A review'})).rejects.toThrow(/large|limit/i);
  expect(await new JsonlThreadRepository(root).list()).toEqual([]);
});


it('rechecks document freshness after acquiring a contended storage lock', async()=>{
  const snapshot=await read();await mkdir(join(root,'.comments'),{recursive:true});
  const lock=join(root,'.comments','store.lock');await writeFile(lock,'other-writer');
  let signal!:()=>void;const entered=new Promise<void>(resolve=>{signal=resolve;});
  const original=JsonlThreadRepository.prototype.append;
  vi.spyOn(JsonlThreadRepository.prototype,'append').mockImplementation(function(...args){signal();return original.apply(this,args);});
  const result=call({type:'thread.create',url:pathToFileURL(file).href,version:snapshot.version,start:source.indexOf('precise'),end:source.indexOf('precise')+14,body:'Do not save'});
  const rejected=expect(result).rejects.toThrow(/changed|refresh/i);
  await entered;await writeFile(file,source+'External change');await rm(lock);
  await rejected;
  expect(await new JsonlThreadRepository(root).list()).toEqual([]);
});

it('rechecks resolved thread state after acquiring a contended storage lock', async()=>{
  const created=await create();const thread=created.threads[0].thread;
  const lock=join(root,'.comments','store.lock');await writeFile(lock,'other-writer');
  let signal!:()=>void;const entered=new Promise<void>(resolve=>{signal=resolve;});
  const original=JsonlThreadRepository.prototype.append;
  vi.spyOn(JsonlThreadRepository.prototype,'append').mockImplementation(function(...args){signal();return original.apply(this,args);});
  const result=call({type:'thread.reply',url:pathToFileURL(file).href,version:created.version,threadId:thread.id,body:'Do not reply after resolve'});
  const rejected=expect(result).rejects.toThrow(/resolved/i);
  await entered;
  const event=createEventFactory.resolved({eventId:randomUUID(),threadId:thread.id,revision:thread.revision+1,occurredAt:new Date().toISOString(),actor:{id:'other',name:'Other editor'}});
  const directory=join(root,'.comments','documents');const [bundle]=await readdir(directory);
  await appendFile(join(directory,bundle!),JSON.stringify(event)+'\n');await rm(lock);
  await rejected;
  const actual=(await new JsonlThreadRepository(root).list())[0]!;
  expect(actual.status).toBe('resolved');expect(actual.comments).toHaveLength(1);
});


const resolveRequest = (snapshot: any, threadId = snapshot.threads[0].thread.id) => ({
  type: 'thread.resolve', url: pathToFileURL(file).href, version: snapshot.version, threadId
});

it('resolves through the shared append-only store and preserves Markdown and comments', async () => {
  const created = await create();
  const repository = new JsonlThreadRepository(root);
  const directory = join(root, '.comments', 'documents');
  const [bundle] = await readdir(directory);
  const before = await readFile(join(directory, bundle!), 'utf8');
  const resolved: any = await call(resolveRequest(created));
  expect(resolved.threads[0].thread.status).toBe('resolved');
  expect(resolved.threads[0].thread.comments[0].body).toBe('Please clarify');
  expect((await repository.listByDocument('한글 문서.md'))[0]?.status).toBe('resolved');
  expect((await read()).threads[0].thread.status).toBe('resolved');
  const after = await readFile(join(directory, bundle!), 'utf8');
  expect(after.startsWith(before)).toBe(true);
  expect(JSON.parse(after.slice(before.length)).type).toBe('thread.resolved');
  expect(await readFile(file, 'utf8')).toBe(source);
  await expect(call(resolveRequest(created))).rejects.toThrow(/resolved/i);
  await expect(call({ type: 'thread.reply', url: pathToFileURL(file).href, version: created.version, threadId: created.threads[0].thread.id, body: 'Late reply' })).rejects.toThrow(/resolved/i);
});

it('rejects stale resolve and resolve belonging to a different document or deleted thread', async () => {
  const created = await create();
  await writeFile(file, source + 'Changed');
  await expect(call(resolveRequest(created))).rejects.toThrow(/Reload this Markdown tab/i);
  const second = join(root, 'second.md'); await writeFile(second, source + 'Changed');
  const snapshot: any = await call({ type: 'document.read', url: pathToFileURL(second).href });
  await expect(call({ ...resolveRequest(snapshot, created.threads[0].thread.id), url: pathToFileURL(second).href })).rejects.toThrow(/document/i);
  const service = new CommentService(new JsonlThreadRepository(root), { actor: () => ({ id: 'test', name: 'Editor' }), id: randomUUID, now: () => new Date().toISOString() });
  await service.delete(created.threads[0].thread.id);
  await expect(call(resolveRequest(await read(), created.threads[0].thread.id))).rejects.toThrow(/document/i);
  expect((await new JsonlThreadRepository(root).readEvents(created.threads[0].thread.id)).map(event => event.type)).toEqual(['thread.created', 'thread.deleted']);
});

it('can resolve an orphaned thread without modifying its anchor', async () => {
  const created = await create();
  const changed = source.replace('precise phrase', 'different wording');
  await writeFile(file, changed);
  const snapshot = await read();
  const resolved: any = await call(resolveRequest(snapshot));
  expect(resolved.threads[0].thread.status).toBe('resolved');
  expect(resolved.threads[0].resolution.kind).not.toBe('resolved');
  expect(resolved.threads[0].thread.anchor).toEqual(created.threads[0].thread.anchor);
  expect(await readFile(file, 'utf8')).toBe(changed);
});

it.each(['source', 'resolved', 'deleted', 'relocated', 'access'])('rechecks %s changes while resolve waits for the store lock', async change => {
  const created = await create(); const thread = created.threads[0].thread;
  const lock = join(root, '.comments', 'store.lock'); await writeFile(lock, 'other-writer');
  let signal!: () => void; const entered = new Promise<void>(resolve => { signal = resolve; });
  const original = JsonlThreadRepository.prototype.append;
  vi.spyOn(JsonlThreadRepository.prototype, 'append').mockImplementation(function(...args) { signal(); return original.apply(this, args); });
  const result = call(resolveRequest(created));
  const rejected = expect(result).rejects.toThrow(change === 'source' ? /Reload this Markdown tab/i : change === 'access' ? /registered|outside/i : change === 'resolved' ? /resolved/i : /document/i);
  await entered;
  if (change === 'source') await writeFile(file, source + 'Changed under lock');
  else if (change === 'access') {
    const elsewhere = join(temp, 'elsewhere'); await mkdir(elsewhere);
    await writeFile(config, JSON.stringify({ extensionId: 'a'.repeat(32), roots: [elsewhere], author: 'Local reviewer' }));
  }
  else {
    const base = { eventId: randomUUID(), threadId: thread.id, revision: thread.revision + 1, occurredAt: new Date().toISOString(), actor: { id: 'editor', name: 'Other editor' } };
    const event = change === 'resolved' ? createEventFactory.resolved(base) : change === 'deleted' ? createEventFactory.deleted(base) : createEventFactory.relocated({ ...base, documentPath: 'second.md' });
    const directory = join(root, '.comments', 'documents'); const [bundle] = await readdir(directory);
    await appendFile(join(directory, bundle!), JSON.stringify(event) + '\n');
  }
  await rm(lock); await rejected;
  expect((await new JsonlThreadRepository(root).readEvents(thread.id)).filter(event => event.type === 'thread.resolved')).toHaveLength(change === 'resolved' ? 1 : 0);
});


it.each([false, true])('accounts for a concurrent reply before resolving (oversized response: %s)', async oversized => {
  const created = await create(); const thread = created.threads[0].thread;
  const lock = join(root, '.comments', 'store.lock'); await writeFile(lock, 'other-writer');
  let signal!: () => void; const entered = new Promise<void>(resolve => { signal = resolve; });
  const original = JsonlThreadRepository.prototype.append;
  vi.spyOn(JsonlThreadRepository.prototype, 'append').mockImplementation(function(...args) { signal(); return original.apply(this, args); });
  const result = call(resolveRequest(created));
  const outcome = result.then(value => ({ value }), error => ({ error }));
  await entered;
  const event = createEventFactory.replied({ eventId: randomUUID(), threadId: thread.id, revision: thread.revision + 1, occurredAt: new Date().toISOString(), actor: { id: 'editor', name: 'Other editor' }, body: oversized ? 'x'.repeat(1024 * 1024) : 'Concurrent reply' });
  const directory = join(root, '.comments', 'documents'); const [bundle] = await readdir(directory);
  await appendFile(join(directory, bundle!), JSON.stringify(event) + '\n'); await rm(lock);
  const actual = await outcome;
  const stored = (await new JsonlThreadRepository(root).list())[0]!;
  if (oversized) {
    expect('error' in actual && actual.error.message).toMatch(/large|limit/i);
    expect(stored.status).toBe('open');
  } else {
    expect('value' in actual && (actual.value as any).threads[0].thread.comments.map((comment: any) => comment.body)).toEqual(['Please clarify', 'Concurrent reply']);
    expect(stored.status).toBe('resolved');
    expect(stored.comments.map(comment => comment.body)).toEqual(['Please clarify', 'Concurrent reply']);
    expect(stored.revision).toBe(thread.revision + 2);
  }
  expect(await readFile(file, 'utf8')).toBe(source);
});
