import { chmod, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const hostName = 'com.sideband_comments.chrome';
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
export function installationPaths({ home = homedir(), platform = process.platform, browser = 'chrome' } = {}) {
  if (!['darwin','linux'].includes(platform)) throw new Error('This native host installer supports macOS Chrome and Linux Chrome/Chromium.');
  if (!['chrome','chromium'].includes(browser)) throw new Error('Unknown browser.');
  const directory = platform === 'darwin'
    ? join(home, 'Library', 'Application Support', browser === 'chrome' ? 'Google/Chrome' : 'Chromium', 'NativeMessagingHosts')
    : join(home, '.config', browser === 'chrome' ? 'google-chrome' : 'chromium', 'NativeMessagingHosts');
  const data = platform === 'darwin' ? join(home, 'Library', 'Application Support', 'Sideband Comments') : join(home, '.config', 'sideband-comments');
  return { manifest: join(directory, `${hostName}.json`), launcher: join(data, 'chrome-host.sh'), config: join(data, 'chrome-host.json') };
}
export async function installHost(options = {}) {
  const { extensionId, project, author, node = process.execPath, hostEntry = fileURLToPath(new URL('../dist/host.cjs', import.meta.url)) } = options;
  if (typeof extensionId !== 'string' || !/^[a-p]{32}$/.test(extensionId)) throw new Error('Provide the 32-letter Chrome extension ID using --extension-id.');
  if (!isAbsolute(node) || !isAbsolute(hostEntry)) throw new Error('Node and native host paths must be absolute.');
  const paths = installationPaths(options);
  const previous = await readFile(paths.config, 'utf8').then(JSON.parse).catch(error => {
    if (error.code === 'ENOENT') return { roots: [], author: '' };
    throw error;
  });
  const roots = project ? [await realpath(project)] : previous.roots;
  for (const root of roots) if (!(await stat(root)).isDirectory()) throw new Error('Project root must be a directory.');
  if (author !== undefined && (!author.trim() || author.length > 100)) throw new Error('Provide a nonblank author name (maximum 100 characters).');
  const config = { extensionId, roots, author: author === undefined ? previous.author : author.trim() };
  await mkdir(dirname(paths.config), { recursive: true, mode: 0o700 });
  await mkdir(dirname(paths.manifest), { recursive: true });
  const atomicWrite = async (path, content, mode) => {
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, { flag: 'wx', mode });
    await rename(temporary, path);
  };
  await atomicWrite(paths.config, JSON.stringify(config, null, 2) + '\n', 0o600);
  await atomicWrite(paths.launcher, `#!/bin/sh\nexec ${quote(node)} ${quote(hostEntry)} --config ${quote(paths.config)} "$@"\n`, 0o700);
  await chmod(paths.launcher, 0o700);
  await atomicWrite(paths.manifest, JSON.stringify({ name: hostName, description: 'Sideband Comments local Markdown and comment storage', path: paths.launcher, type: 'stdio', allowed_origins: [`chrome-extension://${extensionId}/`] }, null, 2) + '\n', 0o600);
  return paths;
}
export async function removeHost(options = {}) {
  const paths = installationPaths(options);
  await rm(paths.manifest, { force: true });
  await rm(paths.launcher, { force: true });
  return paths; // Keep user configuration and all project comments.
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const options = {};
  let remove = false;
  const names = { '--extension-id':'extensionId', '--project':'project', '--author':'author', '--browser':'browser', '--home':'home' };
  try {
    for (let i = 2; i < process.argv.length; i++) {
      const arg = process.argv[i];
      if (arg === '--remove') { remove = true; continue; }
      if (!(arg in names) || !process.argv[i + 1]) throw new Error(`Unknown or incomplete option: ${arg}`);
      options[names[arg]] = process.argv[++i];
    }
    if (!remove) await stat(fileURLToPath(new URL('../dist/host.cjs', import.meta.url)));
    const paths = remove ? await removeHost(options) : await installHost(options);
    console.log(remove ? 'Native host removed. Project comments and saved settings were preserved.' : 'Native host registered. Open Sideband Comments extension settings to register project folders and author.');
    console.log(`Registration: ${paths.manifest}`);
  } catch (error) { console.error(`Sideband Comments: ${error.message}`); process.exitCode = 1; }
}
