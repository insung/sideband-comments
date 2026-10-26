import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Installation is JS so a user's Node can run it without a TypeScript runtime.
import { installHost, removeHost, installationPaths } from '../scripts/install.mjs';

const folders: string[] = [];
afterEach(async () => { for (const path of folders.splice(0)) await rm(path,{recursive:true,force:true}); });
describe('native host registration', () => {
  it('installs a macOS Chrome manifest, executable launcher and persistent settings, then removes only its registration', async () => {
    const home = await mkdtemp(join(tmpdir(),'sideband-install-')); folders.push(home);
    const project = join(home,'My project'); await mkdir(project);
    const options = { home, platform:'darwin', browser:'chrome', extensionId:'a'.repeat(32), project, author:'Reader', node:process.execPath, hostEntry:join(home,'host.cjs') };
    await installHost(options);
    const paths = installationPaths(options);
    expect(paths.manifest).toContain('Library/Application Support/Google/Chrome/NativeMessagingHosts');
    const manifest = JSON.parse(await readFile(paths.manifest,'utf8'));
    expect(manifest.allowed_origins).toEqual([`chrome-extension://${'a'.repeat(32)}/`]);
    expect(manifest.path).toBe(paths.launcher);
    expect((await stat(paths.launcher)).mode & 0o100).toBeTruthy();
    expect(await readFile(paths.launcher,'utf8')).toContain(process.execPath);
    expect(JSON.parse(await readFile(paths.config,'utf8')).roots).toEqual([project]);
    await installHost({...options, project:undefined,author:undefined});
    expect(JSON.parse(await readFile(paths.config,'utf8')).author).toBe('Reader');
    await removeHost(options);
    await expect(stat(paths.manifest)).rejects.toThrow();
    expect(JSON.parse(await readFile(paths.config,'utf8')).roots).toEqual([project]);
  });
  it('rejects malformed extension ids before creating files', async () => {
    const home = await mkdtemp(join(tmpdir(),'sideband-install-')); folders.push(home);
    await expect(installHost({home,platform:'darwin',browser:'chrome',extensionId:'invalid'})).rejects.toThrow(/extension/i);
  });
});
