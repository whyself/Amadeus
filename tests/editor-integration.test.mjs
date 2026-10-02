import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { apply } from '../packages/editor/src/index.mjs';
import extension from '../packages/editor/extension/extension.cjs';

test('editor host prepares isolated workspaces and forwards validated commands to the real bridge', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'amadeus-editor-integration-'));
  const root = path.join(temporary, 'project');
  const other = path.join(temporary, 'other');
  const stateDir = path.join(temporary, 'state');
  const bridgeDir = path.join(stateDir, 'bridge');
  await fs.mkdir(root);
  await fs.mkdir(other);
  await fs.writeFile(path.join(root, 'paper.tex'), 'hello');
  const routes = [];
  const upgrades = [];
  const disposers = [];
  const listeners = new Map();
  const ctx = {
    sessions: new Map([['one', { header: { cwd: root } }], ['two', { header: { cwd: other } }]]),
    fs: { processPath: target => target },
    on(name, callback) { listeners.set(name, callback); return () => listeners.delete(name); },
    get() {},
    effect(callback) { const dispose = callback(); if (typeof dispose === 'function') disposers.push(dispose); },
    webServer: { register(route) { routes.push(route); }, registerUpgrade(route) { upgrades.push(route); } },
  };
  let server, bridge;
  t.after(async () => {
    if (bridge) await bridge.dispose();
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    for (const dispose of disposers.reverse()) await dispose();
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
    assert.match(path.basename(temporary), /^amadeus-editor-integration-/);
    await fs.rm(temporary, { recursive: true, force: true });
  });
  await apply(ctx, { stateDir, bridgeDir, productFile: path.join(temporary, 'absent-product.json') });
  assert.ok(routes.some(route => route.path === '/amadeus/code'));
  assert.ok(upgrades.some(route => route.path === '/amadeus/code' && route.kind === 'prefix'));
  const route = routes.find(route => route.path === '/amadeus/editor');
  server = http.createServer(route.handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/amadeus/editor`;
  const workspace = (session = 'one', instance = 'pad') => fetch(`${base}/workspace?${new URLSearchParams({ session, instance })}`);
  const command = (body, session = 'one', instance = 'pad') => fetch(`${base}/command?${new URLSearchParams({ session, instance })}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
  assert.equal((await fetch(`${base}/workspace?instance=pad`)).status, 400);
  assert.equal((await fetch(`${base}/workspace?session=one`)).status, 400);
  assert.equal((await workspace('missing')).status, 404);
  const ready = await (await workspace()).json();
  const id = createHash('sha256').update(JSON.stringify(['one', 'pad'])).digest('hex');
  assert.equal(ready.id, id);
  const workspaceFile = new URL(ready.url, base).searchParams.get('workspace');
  const canonicalRoot = await fs.realpath(root);
  assert.deepEqual(JSON.parse(await fs.readFile(workspaceFile, 'utf8')), { folders: [{ path: canonicalRoot }], settings: { 'amadeus.bridgeId': id, 'workbench.activityBar.location': 'default', 'workbench.sideBar.location': 'right' } });
  const modified = (await fs.stat(workspaceFile)).mtimeMs;
  assert.deepEqual(await (await workspace()).json(), ready);
  assert.equal((await fs.stat(workspaceFile)).mtimeMs, modified);
  assert.notEqual((await (await workspace('one', 'desktop')).json()).id, id);
  assert.notEqual((await (await workspace('two')).json()).id, id);
  assert.equal((await command({ action: 'status' })).status, 503);

  const calls = [];
  const document = { uri: { scheme: 'file', fsPath: path.join(canonicalRoot, 'paper.tex') }, isDirty: true, getText: () => 'hello', lineCount: 1 };
  const editor = { document, selection: { start: { line: 0 }, end: { line: 0 } } };
  const vscode = {
    workspace: {
      getConfiguration: () => ({ get: () => id }), workspaceFolders: [{ uri: { fsPath: canonicalRoot } }], textDocuments: [document],
      openTextDocument: async uri => { calls.push(['open', uri.fsPath]); return document; },
    },
    window: { activeTextEditor: editor, visibleTextEditors: [editor], showTextDocument: async (_document, options) => { calls.push(['show', options]); return editor; }, showErrorMessage() {} },
    commands: { executeCommand: async (commandName, uri, discard) => {
      calls.push([commandName]);
      assert.equal(uri, document.uri);
      if (document.isDirty && !discard) return { open: true, dirty: true };
      document.isDirty = false;
      return { open: true, dirty: false, refreshed: true };
    } },
    Uri: { file: fsPath => ({ fsPath }) },
  };
  bridge = await extension.createBridge(vscode, bridgeDir);
  assert.deepEqual(await (await command({ action: 'status' })).json(), { dirty: true });
  assert.deepEqual(await (await command({ action: 'open', path: 'paper.tex', command: 'terminal.new' })).json(), { opened: true });
  assert.deepEqual(calls[0], ['open', path.join(canonicalRoot, 'paper.tex')]);
  assert.deepEqual(calls[1], ['show', { preview: false, preserveFocus: false }]);
  assert.deepEqual(await (await command({ action: 'documents' })).json(), { documents: [{ path: path.join(canonicalRoot, 'paper.tex'), dirty: true }] });
  assert.deepEqual(await (await command({ action: 'reload', path: 'paper.tex' })).json(), { open: true, dirty: true });
  assert.deepEqual(await (await command({ action: 'reload', path: 'paper.tex', discard: true })).json(), { open: true, dirty: false, refreshed: true });
  assert.equal((await command({ action: 'reload', path: 'missing.tex' })).status, 404);
  for (const action of ['save', 'undo', 'redo', 'markdown-preview', 'latex-build', 'latex-preview']) {
    assert.equal((await command({ action })).status, 400);
  }
  assert.deepEqual(await (await command({ action: 'selection' })).json(), { text: 'hello', path: 'paper.tex', lineStart: 1, lineEnd: 1 });
  assert.equal((await command({ action: 'open', path: '../other/file' })).status, 400);
  assert.equal((await command({ action: 'open', path: other })).status, 403);
  assert.equal((await command({ action: 'open', path: '.' })).status, 400);
  assert.equal((await command({ action: 'open', path: 'missing.tex' })).status, 404);
  assert.equal((await command({ action: 'terminal.new' })).status, 400);
  assert.equal((await command('{')).status, 400);
  assert.equal((await command({ action: 'open', path: 'paper.tex', text: 'x'.repeat(66000) })).status, 413);
  assert.equal((await command({ action: 'status' }, 'one', 'desktop')).status, 503);
  assert.equal((await command({ action: 'status' }, 'two')).status, 503);
  const secondId = createHash('sha256').update(JSON.stringify(['two', 'pad'])).digest('hex');
  await fs.copyFile(path.join(bridgeDir, `${id}.json`), path.join(bridgeDir, `${secondId}.json`));
  assert.equal((await command({ action: 'status' }, 'two')).status, 503, 'a registration for a different workspace must not be forwarded');

  const reverts = () => calls.filter(call => call[0] === 'amadeus.reloadFile').length;
  const before = reverts();
  await fs.writeFile(path.join(root, 'paper.tex'), 'agent change');
  listeners.get('fs/observed')(path.join(root, 'paper.tex'), { kind: 'present' });
  for (let i = 0; i < 100 && reverts() === before; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(reverts(), before + 1, 'Host observation reloads code-server without a browser event stream');

  document.isDirty = true;
  await fs.writeFile(path.join(root, 'paper.tex'), 'another agent change');
  const registration = JSON.parse(await fs.readFile(path.join(bridgeDir, `${id}.json`), 'utf8'));
  const protectedResult = await fetch(`http://127.0.0.1:${registration.port}/command`, {
    method: 'POST', headers: { Authorization: `Bearer ${registration.token}` },
    body: JSON.stringify({ action: 'externalChange', path: path.join(root, 'paper.tex') }),
  });
  assert.equal((await protectedResult.json()).dirty, true);
  assert.equal(reverts(), before + 1, 'background refresh does not discard unsaved edits');
});
