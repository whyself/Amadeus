import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, readdir, unlink, link, rename } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import { HttpError, resolveWithin, versionOf } from './workspace.mjs';

const locks = new Map();
async function exclusive(target, work) {
  const previous = locks.get(target) ?? Promise.resolve();
  let release;
  const next = new Promise(resolve => { release = resolve; });
  locks.set(target, next);
  await previous;
  try { return await work(); }
  finally { release(); if (locks.get(target) === next) locks.delete(target); }
}
export async function upload(root, input, stream, { maxBytes = 1024 ** 3, overwriteVersion } = {}) {
  const target = await resolveWithin(root, input, { createParents: true, allowMissing: true });
  if (target === root) throw new HttpError(400, 'A filename is required');
  const check = async () => {
    const info = await lstat(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (info?.isSymbolicLink() || info?.isDirectory()) throw new HttpError(409, 'Target is not a regular file');
    if (info && versionOf(info) !== overwriteVersion) throw new HttpError(409, 'File already exists or changed', { version: versionOf(info) });
    if (!info && overwriteVersion) throw new HttpError(409, 'The file changed before replacement');
  };
  await check();
  const temp = path.join(path.dirname(target), `.amadeus-upload-${randomUUID()}`);
  let bytes = 0;
  try {
    await pipeline(stream, new Transform({ transform(chunk, encoding, done) {
      bytes += chunk.length;
      done(bytes > maxBytes ? new HttpError(413, 'Upload exceeds the configured file size limit') : null, chunk);
    } }), createWriteStream(temp, { flags: 'wx', mode: 0o600 }));
    await exclusive(target, async () => {
      await resolveWithin(root, input, { allowMissing: true });
      await check();
      if (overwriteVersion) await rename(temp, target);
      else {
        // A hard link commits only if the destination does not exist; unlike rename it cannot silently overwrite.
        try { await link(temp, target); }
        catch (error) { if (error.code === 'EEXIST') throw new HttpError(409, 'File already exists'); throw error; }
      }
    });
    return { path: path.relative(root, target).split(path.sep).join('/'), bytes };
  } finally { await unlink(temp).catch(() => {}); }
}
export async function zipDirectory(root, target, { maxEntries = 100000 } = {}) {
  const entries = [];
  async function scan(folder, relative) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entries.length >= maxEntries) throw new HttpError(413, 'Too many files for a single ZIP download');
      if (entry.name.startsWith('.amadeus-upload-')) continue;
      const full = await resolveWithin(root, path.join(folder, entry.name));
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) { entries.push({ name: name + '/' }); await scan(full, name); }
      else if (entry.isFile()) entries.push({ name, full });
      else throw new HttpError(400, 'Folder contains a non-regular file');
    }
  }
  await scan(target, path.basename(target));
  const zip = new yazl.ZipFile();
  for (const entry of entries) {
    if (entry.full) zip.addFile(entry.full, entry.name);
    else zip.addEmptyDirectory(entry.name);
  }
  if (!entries.length) zip.addEmptyDirectory(path.basename(target));
  zip.on('error', error => zip.outputStream.destroy(error));
  zip.end();
  return zip.outputStream;
}
export function downloadName(filename) {
  return `attachment; filename="download${filename.endsWith('.zip') ? '.zip' : ''}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16))}`;
}
export async function download(root, input, req, res) {
  const target = await resolveWithin(root, input);
  const info = await lstat(target);
  if (!info.isFile() && !info.isDirectory()) throw new HttpError(400, 'Not a regular file or directory');
  const folder = info.isDirectory();
  const stream = folder ? await zipDirectory(root, target) : createReadStream(target);
  res.writeHead(200, { 'Content-Type': folder ? 'application/zip' : 'application/octet-stream', 'Content-Disposition': downloadName(path.basename(target) + (folder ? '.zip' : '')), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(!folder ? { 'Content-Length': info.size } : {}) });
  await pipeline(stream, res);
}
