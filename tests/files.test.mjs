import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, readdir, lstat, symlink, rm, mkdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { upload, zipDirectory } from '../packages/files/src/transfer.mjs';
import { childWithin, resolveWithin, versionOf } from '../packages/files/src/workspace.mjs';
import { inspectRemoval, removeConfirmed } from '../packages/files/src/remove.mjs';
import { editableResource } from '../packages/files/src/editable-resource.mjs';

test('editable file classification leaves DSH native resource routing intact', () => {
  assert.equal(editableResource('dsh-resource://file/session/s1/.gitignore'), true);
  assert.equal(editableResource('dsh-resource://file/session/s1/template.cls'), true);
  assert.equal(editableResource('dsh-resource://file/session/s1/page.html'), true);
  assert.equal(editableResource('dsh-resource://file/session/s1/notes.md'), true);
  assert.equal(editableResource('dsh-resource://file/session/s1/paper.pdf'), false);
  assert.equal(editableResource('dsh-resource://file/session/s1/../secret'), false);
});

async function workspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amadeus-test-'));
  t.after(async () => { assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)); await rm(root, { recursive: true, force: true }); });
  return root;
}
test('folder structure, collision approval, atomic commit and transfer limits', async t => {
  const root = await workspace(t);
  await upload(root, '课程/week1/a.md', Readable.from('hello'));
  assert.equal(await readFile(path.join(root, '课程/week1/a.md'), 'utf8'), 'hello');
  await assert.rejects(upload(root, '课程/week1/a.md', Readable.from('lost')), e => e.status === 409);
  const version = versionOf(await lstat(path.join(root, '课程/week1/a.md')));
  await upload(root, '课程/week1/a.md', Readable.from('updated'), { overwriteVersion: version });
  await assert.rejects(upload(root, '课程/week1/a.md', Readable.from('stale'), { overwriteVersion: version }), e => e.status === 409);
  await assert.rejects(upload(root, 'large.txt', Readable.from('123456789'), { maxBytes: 4 }), e => e.status === 413);
  assert.equal((await readdir(root)).some(n => n.startsWith('.amadeus-upload-') || n === 'large.txt'), false);
  assert.equal(await readFile(path.join(root, '课程/week1/a.md'), 'utf8'), 'updated');
});
test('simultaneous new uploads cannot silently replace one another', async t => {
  const root = await workspace(t);
  const result = await Promise.allSettled(['first', 'second'].map(value => upload(root, 'same.txt', Readable.from(value))));
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(result.filter(r => r.status === 'rejected')[0].reason.status, 409);
});
test('traversal, absolute escape and symlink escape refused', async t => {
  const root = await workspace(t), outside = await workspace(t);
  assert.throws(() => childWithin(root, '../secret'));
  assert.throws(() => childWithin(root, '..\\secret'));
  assert.throws(() => childWithin(root, outside));
  await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(resolveWithin(root, 'escape/private.txt', { createParents: true, allowMissing: true }), e => e.status === 403);
});
test('ZIP retains names and empty directories', async t => {
  const root = await workspace(t);
  await upload(root, 'notes/a.txt', Readable.from('amadeus'));
  await mkdir(path.join(root, 'empty'));
  const chunks = [];
  for await (const chunk of await zipDirectory(root, root)) chunks.push(chunk);
  const zip = Buffer.concat(chunks);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(zip.includes(Buffer.from('notes/a.txt')));
  assert.ok(zip.includes(Buffer.from('empty/')));
});
test('deletion preview is read-only and confirmation deletes only the named file', async t => {
  const root = await workspace(t);
  await upload(root, 'remove.txt', Readable.from('selected'));
  await upload(root, 'keep.txt', Readable.from('keep'));
  const preview = await inspectRemoval(root, 'remove.txt');
  assert.equal(preview.directory, false);
  assert.equal(await readFile(path.join(root, 'remove.txt'), 'utf8'), 'selected');
  await assert.rejects(removeConfirmed(root, 'remove.txt'), e => e.status === 400);
  await assert.rejects(removeConfirmed(root, 'keep.txt', preview.version), e => e.status === 409);
  await removeConfirmed(root, 'remove.txt', preview.version);
  await assert.rejects(lstat(path.join(root, 'remove.txt')), e => e.code === 'ENOENT');
  assert.equal(await readFile(path.join(root, 'keep.txt'), 'utf8'), 'keep');
});

test('POSIX literal-backslash confirmation preserves identity beside a nested path', { skip: process.platform === 'win32' }, async t => {
  const root = await workspace(t);
  const uploaded = await upload(root, 'a\\b.txt', Readable.from('literal'));
  assert.equal(uploaded.path, 'a\\b.txt');
  await upload(root, 'a/b.txt', Readable.from('nested'));
  const preview = await inspectRemoval(root, 'a\\b.txt');
  assert.equal(preview.path, 'a\\b.txt');
  await removeConfirmed(root, preview.path, preview.version);
  await assert.rejects(readFile(path.join(root, 'a\\b.txt')), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(root, 'a/b.txt'), 'utf8'), 'nested');
});
test('folder deletion rejects stale nested changes and refreshes confirmation', async t => {
  const root = await workspace(t);
  await upload(root, 'folder/nested/a.txt', Readable.from('old'));
  await mkdir(path.join(root, 'folder/empty'));
  const preview = await inspectRemoval(root, 'folder');
  assert.equal(preview.directory, true);
  const version = versionOf(await lstat(path.join(root, 'folder/nested/a.txt')));
  await upload(root, 'folder/nested/a.txt', Readable.from('new content'), { overwriteVersion: version });
  await assert.rejects(removeConfirmed(root, 'folder', preview.version), e => e.status === 409);
  const fresh = await inspectRemoval(root, 'folder');
  await removeConfirmed(root, 'folder', fresh.version);
  assert.deepEqual(await readdir(root), []);
});
test('deletion refuses workspace root, path escapes and symlink traversal', async t => {
  const root = await workspace(t), outside = await workspace(t);
  for (const input of ['', '.', root, '../escape', '..\\escape', outside]) await assert.rejects(inspectRemoval(root, input));
  await upload(outside, 'keep.txt', Readable.from('outside'));
  await symlink(outside, path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(inspectRemoval(root, 'link'), e => e.status === 403);
  await mkdir(path.join(root, 'folder'));
  await symlink(outside, path.join(root, 'folder/link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(inspectRemoval(root, 'folder'), e => e.status === 403);
  assert.equal(await readFile(path.join(outside, 'keep.txt'), 'utf8'), 'outside');
});
