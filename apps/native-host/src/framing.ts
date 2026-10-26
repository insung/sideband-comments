import { MAX_MESSAGE_BYTES } from '@sideband-comments/browser-protocol';
import { TextDecoder } from 'node:util';

export function encodeMessage(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  if (body.length > MAX_MESSAGE_BYTES) throw new Error('Response is too large. Reduce document or comment size.');
  const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}
export class MessageDecoder {
  private pending = Buffer.alloc(0);
  push(chunk: Buffer): unknown[] {
    this.pending = Buffer.concat([this.pending, chunk]);
    const result: unknown[] = [];
    while (this.pending.length >= 4) {
      const length = this.pending.readUInt32LE(0);
      if (!length || length > MAX_MESSAGE_BYTES) throw new Error('Native message length exceeds the limit.');
      if (this.pending.length < length + 4) break;
      const body = new TextDecoder('utf-8', { fatal: true }).decode(this.pending.subarray(4, 4 + length));
      result.push(JSON.parse(body));
      this.pending = this.pending.subarray(4 + length);
    }
    return result;
  }
  finish(): void {
    if (this.pending.length) throw new Error('Incomplete native message.');
  }
}
