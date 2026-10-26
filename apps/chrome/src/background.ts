import { HOST_NAME, type Response } from '@sideband-comments/browser-protocol';
import { authorizeRequest } from './bridge.js';

chrome.runtime.onMessage.addListener((message: unknown, sender, respond: (response: unknown) => void) => {
  if (message && typeof message === 'object' && 'type' in message && message.type === 'open-settings') {
    if (sender.id === chrome.runtime.id && sender.url?.startsWith('file:')) void chrome.runtime.openOptionsPage();
    respond({ ok: true }); return false;
  }
  void (async () => {
    const id = message && typeof message === 'object' && 'id' in message && typeof message.id === 'string' ? message.id : '';
    try {
      const request = authorizeRequest(message, sender, chrome.runtime.id);
      const response = await chrome.runtime.sendNativeMessage(HOST_NAME, request) as Response;
      if (!response || response.id !== request.id || typeof response.ok !== 'boolean') throw new Error('Native host version mismatch. Rebuild and reinstall Sideband Comments.');
      respond(response);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Native host connection failed.';
      respond({ id, ok: false, error: `${detail} Check the native host installation and extension settings.` });
    }
  })();
  return true;
});
chrome.action.onClicked.addListener(() => { void chrome.runtime.openOptionsPage(); });
