import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const fixtures: string[] = [];
const files = ['icon.png', 'content.js', 'background.js', 'options.js', 'options.html', 'github.css', 'syntax.css', 'viewer.css', 'options.css', 'THIRD_PARTY_NOTICES.txt'];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sideband-package-'));
  fixtures.push(root);
  mkdirSync(join(root, 'dist'));
  copyFileSync(new URL('../package.mjs', import.meta.url), join(root, 'package.mjs'));
  const manifest = { manifest_version: 3, name: 'Test extension', version: '2.0.0', key: 'development-key', permissions: ['nativeMessaging', 'storage'] };
  writeFileSync(join(root, 'dist', 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(root, 'dist', 'extension-id.txt'), 'development-id');
  for (const file of files) writeFileSync(join(root, 'dist', file), `fixture:${file}`);
  return { root, manifest };
}
function unzip(archive: string, name: string) {
  const result = spawnSync('unzip', ['-p', archive, name], { encoding: 'utf8' });
  expect(result.status).toBe(0);
  return result.stdout;
}
afterEach(() => { for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('Chrome distribution packages', () => {
  it('separates the store manifest without changing the development build or ZIP', () => {
    const { root, manifest } = fixture();
    const run = (...args: string[]) => spawnSync(process.execPath, [join(root, 'package.mjs'), ...args], { encoding: 'utf8' });
    expect(run().status).toBe(0);
    const development = join(root, 'dist', 'sideband-comments-chrome.zip');
    const before = readFileSync(development);
    expect(run('--webstore').status).toBe(0);
    const store = join(root, 'dist', 'sideband-comments-chrome-webstore.zip');
    expect(existsSync(store)).toBe(true);
    const { key: _key, ...expected } = manifest;
    expect(JSON.parse(unzip(store, 'manifest.json'))).toEqual(expected);
    expect(JSON.parse(readFileSync(join(root, 'dist', 'manifest.json'), 'utf8'))).toEqual(manifest);
    expect(readFileSync(development)).toEqual(before);
    expect(JSON.parse(unzip(development, 'manifest.json'))).toEqual(manifest);
    const listing = spawnSync('unzip', ['-Z1', store], { encoding: 'utf8' });
    expect(listing.stdout.trim().split('\n').sort()).toEqual(['manifest.json', ...files].sort());
    for (const file of files) expect(unzip(store, file)).toBe(`fixture:${file}`);
    expect(spawnSync('unzip', ['-t', store]).status).toBe(0);
  });

  it('rejects unknown flags without replacing an existing artifact', () => {
    const { root } = fixture();
    const archive = join(root, 'dist', 'sideband-comments-chrome.zip');
    writeFileSync(archive, 'preserve-existing-archive');
    const result = spawnSync(process.execPath, [join(root, 'package.mjs'), '--unknown'], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(readFileSync(archive, 'utf8')).toBe('preserve-existing-archive');
  });
});
