import { dispatch, loadConfig } from './handler.js';
import { MessageDecoder, encodeMessage } from './framing.js';
import type { Response } from '@sideband-comments/browser-protocol';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const index = args.indexOf('--config');
  const configPath = index >= 0 ? args[index + 1] : undefined;
  const origin = args.find(arg => arg.startsWith('chrome-extension://'));
  if (!configPath) throw new Error('Native host configuration path is missing.');
  const config = await loadConfig(configPath);
  if (origin !== `chrome-extension://${config.extensionId}/`) throw new Error('Unregistered Chrome extension.');
  const decoder = new MessageDecoder();
  for await (const chunk of process.stdin) {
    for (const message of decoder.push(Buffer.from(chunk))) {
      const id = message && typeof message === 'object' && 'id' in message && typeof message.id === 'string' ? message.id : '';
      let response: Response;
      try { response = { id, ok: true, value: await dispatch(configPath, message) }; }
      catch (error) { response = { id, ok: false, error: error instanceof Error ? error.message : 'Native host request failed.' }; }
      let encoded: Buffer;
      try { encoded = encodeMessage(response); }
      catch (error) { encoded = encodeMessage({ id, ok: false, error: error instanceof Error ? error.message : 'Response too large.' }); }
      if (!process.stdout.write(encoded)) await new Promise<void>(resolve => process.stdout.once('drain', resolve));
    }
  }
  decoder.finish();
}
main().catch(error => { process.stderr.write(`Sideband Comments: ${error instanceof Error ? error.message : 'Native host failed.'}\n`); process.exitCode = 1; });
