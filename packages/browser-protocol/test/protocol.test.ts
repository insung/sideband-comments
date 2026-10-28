import { describe, expect, it } from 'vitest';
import { parseRequest } from '../src/index.js';

describe('browser protocol', () => {
  it('requires a valid comment identifier, revision and edit body',()=>{
    const request={id:'edit',type:'comment.edit',url:'file:///doc.md',version:'a'.repeat(64),threadId:'thread-1',commentId:'comment-1',expectedRevision:0,body:'Updated'};
    expect(parseRequest(request).type).toBe('comment.edit');
    expect(parseRequest({...request,type:'comment.delete',body:undefined}).type).toBe('comment.delete');
    for(const patch of [{commentId:'../escape'},{expectedRevision:-1},{expectedRevision:1.5},{expectedRevision:undefined},{body:''},{body:'x'.repeat(16001)}]) expect(()=>parseRequest({...request,...patch})).toThrow();
  });
  it('accepts typed document and write requests', () => {
    expect(parseRequest({ id: '1', type: 'document.read', url: 'file:///tmp/a.md' }).type).toBe('document.read');
    expect(parseRequest({ id: '2', type: 'thread.create', url: 'file:///tmp/a.md', version: 'a'.repeat(64), start: 0, end: 3, body: 'Review' }).type).toBe('thread.create');
  });
  it('accepts resolve without a comment body', () => {
    expect(parseRequest({ id: '3', type: 'thread.resolve', url: 'file:///tmp/a.md', version: 'a'.repeat(64), threadId: 'thread-1' }).type).toBe('thread.resolve');
  });
  it.each([
    { id: '1', type: 'thread.resolve', url: 'file:///a.md', version: 'a'.repeat(64), threadId: '../outside' },
    { id: '1', type: 'thread.resolve', url: 'file:///a.md', version: 'bad', threadId: 'thread-1' },
    { id: '1', type: 'thread.resolve', url: 'file:///a.md', version: 'a'.repeat(64) },
    null, {}, { id: '1', type: 'resolve' },
    { id: '1', type: 'document.read', url: 'https://example.com/a.md' },
    { id: '1', type: 'settings.save', roots: [], author: '' },
    { id: '1', type: 'thread.create', url: 'file:///a.md', version: 'x', start: 0, end: 3, body: 'x' },
    { id: '1', type: 'thread.create', url: 'file:///a.md', version: 'a'.repeat(64), start: 4, end: 3, body: 'x' },
    { id: '1', type: 'thread.reply', url: 'file:///a.md', version: 'a'.repeat(64), threadId: '../outside', body: 'x' }
  ])('rejects malformed or out-of-scope operations: %j', (value) => {
    expect(() => parseRequest(value)).toThrow();
  });
});

it('accepts reopen without a body and rejects invalid reopen targets',()=>{
 const request={id:'reopen',type:'thread.reopen',url:'file:///tmp/doc.md',version:'a'.repeat(64),threadId:'thread-1'};
 expect(parseRequest(request).type).toBe('thread.reopen');
 for(const patch of [{threadId:'../outside'},{version:'bad'},{url:'https://example.com/a.md'},{threadId:undefined}]) expect(()=>parseRequest({...request,...patch})).toThrow();
});
