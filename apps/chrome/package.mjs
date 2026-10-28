import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFile, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--webstore')) {
  throw new Error('Usage: node package.mjs [--webstore]');
}
const webstore = args[0] === '--webstore';
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const archive = join(dist, webstore ? 'sideband-comments-chrome-webstore.zip' : 'sideband-comments-chrome.zip');
const files = ['manifest.json', 'icon.png', 'content.js', 'background.js', 'options.js', 'options.html', 'github.css', 'syntax.css', 'viewer.css', 'options.css', 'THIRD_PARTY_NOTICES.txt'];
if (!webstore) files.push('extension-id.txt');
// Stage a separate manifest; never change the unpacked build or its stable development ID.
const staging = await mkdtemp(join(dist, '.package-'));
try {
  for (const file of files) await copyFile(join(dist, file), join(staging, file));
  if (webstore) {
    const manifest = JSON.parse(await readFile(join(staging, 'manifest.json'), 'utf8'));
    delete manifest.key;
    await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
  const temporary = join(staging, 'package.zip');
  const result = spawnSync('zip', ['-j', temporary, ...files], { cwd: staging, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Chrome packaging failed (${result.status ?? result.signal})`);
  await rename(temporary, archive);
  console.log(`Chrome ${webstore ? 'Web Store' : 'development'} package: ${archive}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
