import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { CommentService } from '@sideband-comments/core';
import { JsonlThreadRepository } from '@sideband-comments/jsonl-store';
import { dispatch } from '../src/handler.js';

let root:string, file:string, config:string, url:string;
const source='Review this paragraph.';
const call=(request:object)=>dispatch(config,{id:'test',url,...request}) as Promise<any>;
const repo=()=>new JsonlThreadRepository(root);
const service=(name='Reader')=>new CommentService(repo(),{actor:()=>({id:'editor-id',name}),id:randomUUID,now:()=>new Date().toISOString()});
beforeEach(async()=>{
  root=await mkdtemp('/private/tmp/sideband-management-'); file=join(root,'doc.md');config=join(root,'host.json');url=pathToFileURL(file).href;
  await writeFile(file,source);await writeFile(config,JSON.stringify({extensionId:'a'.repeat(32),roots:[root],author:'Reader'}));
});
afterEach(async()=>{vi.restoreAllMocks();await rm(root,{recursive:true,force:true});});
async function fixture(){
  const snapshot=await call({type:'document.read'});
  const created=await call({type:'thread.create',version:snapshot.version,start:0,end:6,body:'Original'});
  const thread=created.threads[0].thread;
  return {version:created.version,threadId:thread.id,commentId:thread.comments[0].id,expectedRevision:thread.revision};
}
it('edits and deletes own comments using existing events, preserving source and resolved status',async()=>{
  const f=await fixture();await service().resolve(f.threadId);
  const resolved=await service().get(f.threadId);f.expectedRevision=resolved.revision;
  const edited=await call({type:'comment.edit',...f,body:'Edited'});
  expect(edited.author).toBe('Reader');expect(edited.threads[0].thread.status).toBe('resolved');
  expect(edited.threads[0].thread.comments[0].body).toBe('Edited');
  const deleted=await call({type:'comment.delete',...f,expectedRevision:edited.threads[0].thread.revision});
  expect(deleted.threads[0].thread.comments).toEqual([]);expect(deleted.threads[0].thread.status).toBe('resolved');
  const events=await repo().readEvents(f.threadId);
  expect(events.map(x=>x.type)).toEqual(['thread.created','thread.resolved','comment.edited','comment.deleted']);
  expect(events[0]).toMatchObject({body:'Original'});expect(await readFile(file,'utf8')).toBe(source);
});
it('recognizes the same author name from an editor with a different actor ID',async()=>{
  const f=await fixture();const thread=await service().reply(f.threadId,'Editor reply');
  const result=await call({type:'comment.edit',...f,commentId:thread.comments[1]!.id,expectedRevision:thread.revision,body:'Updated reply'});
  expect(result.threads[0].thread.comments[1].body).toBe('Updated reply');
});
it.each(['comment.edit','comment.delete'])('rejects foreign, stale, deleted and wrong-document requests: %s',async type=>{
  const f=await fixture();const other=await service('Other').reply(f.threadId,'Other comment');
  await expect(call({type,...f,commentId:other.comments[1]!.id,expectedRevision:other.revision,body:'x'})).rejects.toThrow(/own|author/i);
  await expect(call({type,...f,body:'x'})).rejects.toThrow(/changed/i);
  const otherFile=join(root,'other.md');await writeFile(otherFile,source);
  await expect(call({type,...f,url:pathToFileURL(otherFile).href,expectedRevision:other.revision,body:'x'})).rejects.toThrow(/document/i);
  await service().deleteComment(f.threadId,f.commentId);const deleted=await service().get(f.threadId);
  await expect(call({type,...f,expectedRevision:deleted.revision,body:'x'})).rejects.toThrow(/comment|deleted/i);
  await writeFile(file,source+'changed');
  await expect(call({type,...f,expectedRevision:deleted.revision,body:'x'})).rejects.toThrow(/Document changed/);
});
it.each(['revision','author'])('rechecks %s changes inside the shared write lock',async change=>{
  const f=await fixture(), lock=join(root,'.comments','store.lock');await writeFile(lock,'other-writer');
  let signal!:()=>void;const entered=new Promise<void>(resolve=>signal=resolve);
  const original=JsonlThreadRepository.prototype.append;
  vi.spyOn(JsonlThreadRepository.prototype,'append').mockImplementation(function(...args){signal();return original.apply(this,args);});
  const writing=call({type:'comment.edit',...f,body:'Do not overwrite'});
  const rejected=expect(writing).rejects.toThrow(/changed/i);await entered;
  if(change==='author') await writeFile(config,JSON.stringify({extensionId:'a'.repeat(32),roots:[root],author:'Other'}));
  else {
    const events=await repo().readEvents(f.threadId);
    const next={...events[0]!,eventId:randomUUID(),type:'comment.edited',revision:1,commentId:f.commentId,body:'Concurrent edit'};
    const bundle=(await import('node:fs/promises')).readdir;
    const name=(await bundle(join(root,'.comments','documents')))[0]!;
    await (await import('node:fs/promises')).appendFile(join(root,'.comments','documents',name),JSON.stringify(next)+'\n');
  }
  await rm(lock);await rejected;
  expect((await service().get(f.threadId)).comments[0]!.body).toBe(change==='author'?'Original':'Concurrent edit');
});
