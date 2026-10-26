import { parseRequest, type Request } from '@sideband-comments/browser-protocol';

export function authorizeRequest(raw: unknown, sender: { id?: string | undefined; url?: string | undefined }, extensionId: string): Request {
  if (sender.id !== extensionId || !sender.url || !raw || typeof raw !== 'object') throw new Error('Untrusted extension request.');
  const message = raw as Record<string, unknown>;
  const options = sender.url === `chrome-extension://${extensionId}/options.html`;
  if (message.type === 'settings.get' || message.type === 'settings.save') {
    if (!options) throw new Error('Project settings can only be changed from the extension settings page.');
    return parseRequest(message);
  }
  const url = new URL(sender.url);
  if (options || url.protocol !== 'file:') throw new Error('Only local Markdown tabs can request documents.');
  url.hash = ''; url.search = '';
  return parseRequest({ ...message, url: url.href });
}
