import path from 'node:path';
import { createHash } from 'node:crypto';
import { lstat, readdir, realpath, rm } from 'node:fs/promises';
import { childWithin, HttpError, resolveWithin } from './workspace.mjs';

// Confirmation is tied to this path and its current contents, not just its name.
export async function inspectRemoval(root, input) {
  const canonicalRoot = await realpath(root);
  const target = await resolveWithin(canonicalRoot, input);
  if (target === canonicalRoot) throw new HttpError(403, '不能删除项目根目录');
  const info = await lstat(target);
  if (!info.isFile() && !info.isDirectory()) throw new HttpError(400, '只能删除普通文件或文件夹');
  const hash = createHash('sha256').update(target);
  const pending = [target];
  let count = 0;
  while (pending.length) {
    const current = await resolveWithin(canonicalRoot, pending.pop());
    const item = await lstat(current);
    if (!item.isFile() && !item.isDirectory()) throw new HttpError(403, '文件夹中包含无法删除的特殊文件');
    if (++count > 100000) throw new HttpError(413, '目录项过多，无法通过此操作删除');
    hash.update(JSON.stringify([path.relative(canonicalRoot, current), item.isDirectory(), item.dev, item.ino, item.size, item.mtimeMs, item.ctimeMs]));
    if (item.isDirectory()) {
      const names = (await readdir(current)).sort();
      for (const name of names) pending.push(childWithin(canonicalRoot, path.join(current, name)));
    }
  }
  return { root: canonicalRoot, target, path: path.relative(canonicalRoot, target).split(path.sep).join('/'), directory: info.isDirectory(), version: hash.digest('hex') };
}

export async function removeConfirmed(root, input, version) {
  if (typeof version !== 'string' || !/^[a-f0-9]{64}$/.test(version)) throw new HttpError(400, '请先确认删除');
  const current = await inspectRemoval(root, input);
  if (current.version !== version) throw new HttpError(409, '内容已变化，请关闭弹窗后重新确认删除');
  // Recheck the resolved absolute target immediately before recursive removal.
  const resolved = await resolveWithin(current.root, current.target);
  const absolute = await realpath(resolved);
  childWithin(current.root, absolute);
  if (absolute === current.root || absolute !== current.target) throw new HttpError(403, '删除路径已变化');
  await rm(absolute, { recursive: current.directory, force: false });
  return { path: current.path, removed: true };
}
