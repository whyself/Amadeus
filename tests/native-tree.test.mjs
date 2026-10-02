import test from 'node:test';
import assert from 'node:assert/strict';
import { relativeNativePath } from '../packages/files/src/native-tree.mjs';

test('native tree actions use bounded POSIX and Windows relative paths', () => {
  assert.equal(relativeNativePath('/workspace', '/workspace/子目录/note.md'), '子目录/note.md');
  assert.equal(relativeNativePath('/workspace', '/workspace/a\\b.txt'), 'a\\b.txt');
  assert.equal(relativeNativePath('/workspace/', '/workspace'), '');
  assert.equal(relativeNativePath('/', '/notes/a.md'), 'notes/a.md');
  assert.equal(relativeNativePath('C:\\Project', 'c:/project/a.md'), 'a.md');
  assert.equal(relativeNativePath('\\\\server\\share', '//SERVER/share/a.md'), 'a.md');
  for (const target of ['/workspace2/a.md', '/workspace/../a.md', '/workspace/./a.md', '/workspace//a.md', '/workspace/a\0.md']) {
    assert.equal(relativeNativePath('/workspace', target), null, target);
  }
  assert.equal(relativeNativePath('/Workspace', '/workspace/a.md'), null);
  assert.equal(relativeNativePath('', '/a.md'), null);
});
