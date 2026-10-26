import { describe, expect, it } from 'vitest';
import { parseRequest } from '../src/index.js';

describe('browser protocol', () => {
  it('accepts typed document and write requests', () => {
    expect(parseRequest({ id: '1', type: 'document.read', url: 'file:///tmp/a.md' }).type).toBe('document.read');
    expect(parseRequest({ id: '2', type: 'thread.create', url: 'file:///tmp/a.md', version: 'a'.repeat(64), start: 0, end: 3, body: 'Review' }).type).toBe('thread.create');
  });
  it.each([
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
