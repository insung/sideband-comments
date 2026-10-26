import { lstat, readdir, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export function contains(root: string, file: string): boolean {
  const path = relative(root, file);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}
export async function documentAccess(url: string, roots: string[]): Promise<{ root: string; file: string; path: string }> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'file:' || (parsed.hostname && parsed.hostname !== 'localhost')) throw new Error('Only local Markdown files are supported.');
  const requested = fileURLToPath(parsed);
  const file = await realpath(requested);
  if (!/^\.(md|markdown|mdown|mkdn|mkd)$/i.test(extname(requested)) || !/^\.(md|markdown|mdown|mkdn|mkd)$/i.test(extname(file))) throw new Error('Open a Markdown file.');
  const candidates: string[] = [];
  for (const configured of roots) {
    const root = await realpath(configured);
    if (contains(root, file) && contains(root, requested)) candidates.push(root);
  }
  const root = candidates.sort((a, b) => b.length - a.length)[0];
  if (!root) throw new Error('File is outside registered projects. Open extension settings and register its project folder.');
  const info = await stat(file);
  if (!info.isFile()) throw new Error('Open a Markdown file.');
  if (info.size > 256 * 1024) throw new Error('Document is too large (maximum 256 KiB).');
  return { root, file, path: relative(root, file).split(sep).join('/') };
}
// The shared repository follows filesystem paths. Refuse symlinked stores before using it.
export async function assertStoreSafe(root: string): Promise<void> {
  const directory = join(root, '.comments');
  const inspect = async (path: string) => {
    const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (info?.isSymbolicLink()) throw new Error('Symlinked comment stores are not supported.');
    return info;
  };
  await inspect(directory);
  await inspect(join(directory, 'store.lock'));
  for (const name of ['threads', 'documents']) {
    const path = join(directory, name);
    const info = await inspect(path);
    if (!info) continue;
    if (!info.isDirectory()) throw new Error('Invalid comment store directory.');
    for (const item of await readdir(path)) if (item.endsWith('.jsonl')) await inspect(join(path, item));
  }
}
