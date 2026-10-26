import type { DocumentSnapshot } from '@sideband-comments/browser-protocol';
import { send } from './client.js';
import { createReader } from './viewer/reader.js';
import { renderDiagrams } from './viewer/diagrams.js';

async function start(): Promise<void> {
  if (!/\.(md|markdown|mdown|mkdn|mkd)$/i.test(new URL(location.href).pathname)) return;
  if (document.getElementById('sideband-reader')) return;
  await createReader(document,{
    request:message=>send<DocumentSnapshot>(message),
    loadWidths:async()=> (await chrome.storage.local.get('panelWidths')).panelWidths,
    saveWidths:async widths=> { await chrome.storage.local.set({panelWidths:widths}); },
    diagrams:renderDiagrams,
    iconUrl:chrome.runtime.getURL('icon.png')
  });
}
void start().catch(error=>{ console.error('Sideband Comments viewer failed',error); });
