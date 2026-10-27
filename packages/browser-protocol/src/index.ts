import type { AnchorResolution, ThreadState } from '@sideband-comments/core';

export const HOST_NAME = 'com.sideband_comments.chrome';
export const MAX_MESSAGE_BYTES = 1024 * 1024;
export interface Settings { roots: string[]; author: string }
export interface DocumentSnapshot {
  author?: string;
  source: string;
  version: string;
  path: string;
  projectRoot: string;
  threads: { thread: ThreadState; resolution: AnchorResolution }[];
}
export type Request = { id: string } & (
  | { type: 'settings.get' }
  | ({ type: 'settings.save' } & Settings)
  | { type: 'document.read'; url: string }
  | { type: 'thread.create'; url: string; version: string; start: number; end: number; body: string }
  | { type: 'thread.reply'; url: string; version: string; threadId: string; body: string }
  | { type: 'thread.resolve'; url: string; version: string; threadId: string }
  | { type: 'comment.edit'; url: string; version: string; threadId: string; commentId: string; expectedRevision: number; body: string }
  | { type: 'comment.delete'; url: string; version: string; threadId: string; commentId: string; expectedRevision: number }
);
export type Result = Settings | DocumentSnapshot;
export type Response = { id: string; ok: true; value: Result } | { id: string; ok: false; error: string };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export function parseRequest(value: unknown): Request {
  if (!record(value) || !string(value.id, 64)) throw new Error('Invalid request id.');
  const fail = () => { throw new Error('Invalid or unsupported request.'); };
  if (value.type === 'settings.get') return value as Request;
  if (value.type === 'settings.save') {
    if (!Array.isArray(value.roots) || value.roots.length < 1 || value.roots.length > 20 || !value.roots.every(x => string(x, 4096)) || !string(value.author, 100)) return fail();
    return value as Request;
  }
  if (!string(value.url, 8192)) return fail();
  let url: URL;
  try { url = new URL(value.url as string); } catch { return fail(); }
  if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost') || url.search || url.hash) return fail();
  if (value.type === 'document.read') return value as Request;
  if (typeof value.version !== 'string' || !/^[a-f0-9]{64}$/.test(value.version)) return fail();
  if (value.type !== 'thread.resolve' && value.type !== 'comment.delete' && !string(value.body, 16_000)) return fail();
  if (value.type === 'comment.edit' || value.type === 'comment.delete') {
    const identifier = (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) && !id.includes('..');
    if (!identifier(value.threadId) || !identifier(value.commentId) || !Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 0) return fail();
    return value as Request;
  }
  if (value.type === 'thread.create') {
    if (!Number.isSafeInteger(value.start) || !Number.isSafeInteger(value.end) || (value.start as number) < 0 || (value.end as number) <= (value.start as number)) return fail();
    return value as Request;
  }
  if ((value.type === 'thread.reply' || value.type === 'thread.resolve') && typeof value.threadId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.threadId) && !value.threadId.includes('..')) return value as Request;
  return fail();
}
