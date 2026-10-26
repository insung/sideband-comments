import type { Request, Response, Result } from '@sideband-comments/browser-protocol';

export async function send<T extends Result>(message: Omit<Request, 'id'> | Record<string, unknown>): Promise<T> {
  const id = crypto.randomUUID();
  let response: Response;
  try { response = await chrome.runtime.sendMessage({ ...message, id }) as Response; }
  catch { throw new Error('Extension connection was lost. Reload this Markdown tab.'); }
  if (!response || response.id !== id || typeof response.ok !== 'boolean') throw new Error('Invalid native host response. Rebuild and reinstall the host and extension together.');
  if (!response.ok) throw new Error(response.error);
  return response.value as T;
}
export function openSettings(): void { void chrome.runtime.sendMessage({ type: 'open-settings' }); }
