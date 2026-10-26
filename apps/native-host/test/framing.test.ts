import { describe, expect, it } from 'vitest';
import { MessageDecoder, encodeMessage } from '../src/framing.js';

describe('Native Messaging framing', () => {
  it('decodes fragmented and adjacent Unicode JSON frames', () => {
    const first = encodeMessage({ id: '1', text: '댓글' });
    const second = encodeMessage({ id: '2', ok: true });
    const decoder = new MessageDecoder();
    expect(decoder.push(first.subarray(0, 2))).toEqual([]);
    expect(decoder.push(first.subarray(2, 7))).toEqual([]);
    expect(decoder.push(Buffer.concat([first.subarray(7), second]))).toEqual([{ id: '1', text: '댓글' }, { id: '2', ok: true }]);
  });
  it('rejects oversized and invalid frames without waiting for the body', () => {
    const header = Buffer.alloc(4); header.writeUInt32LE(2 ** 22);
    expect(() => new MessageDecoder().push(header)).toThrow(/large|limit/i);
    expect(() => encodeMessage({ body: 'x'.repeat(2 ** 21) })).toThrow(/large|limit/i);
    expect(() => new MessageDecoder().push(Buffer.from([0, 0, 0, 0]))).toThrow();
  });
});
