import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import bridgeModule from '../packages/editor/extension/extension.cjs';

test('editor bridge authenticates, confines files, and exposes only editor actions', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'amadeus-editor-'));
  const workspace = path.join(temporary, 'project');
  const directory = path.join(temporary, 'bridge');
  await fs.mkdir(workspace);
  const file = path.join(workspace, 'paper.tex');
  const outside = path.join(temporary, 'outside.tex');
  await fs.writeFile(file, 'hello');
  await fs.writeFile(outside, 'secret');
  const calls = [];
  const settings = { workbench: { colorTheme: 'Default Light+', colorCustomizations: {
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': '#ABCDEF',
    '[Default Light+]': { 'editor.lineHighlightBackground': '#0000000F' },
    '[Default Dark+]': { 'editor.lineHighlightBackground': '#FFFFFF14' },
    '[Default Light Modern]': { 'activityBar.foreground': '#123456' },
    '[Default Dark Modern]': { 'editor.lineHighlightBackground': '#112233' },
  } }, editor: { fontSize: 16 } };
  const document = { uri: { scheme: 'file', fsPath: file }, isDirty: true, lineCount: 1, getText: () => 'hello', positionAt: character => ({ line: 0, character }) };
  const current = { document, selection: { start: { line: 0 }, end: { line: 0 } }, revealRange() {} };
  const vscode = {
    workspace: { getConfiguration: section => section === 'amadeus' ? { get: () => 'a'.repeat(64) } : {
      get: key => key === 'colorCustomizations' ? { ...settings[section]?.[key], 'sideBar.background': 'workspace-only' } : settings[section]?.[key],
      inspect: key => ({ globalValue: settings[section]?.[key] }),
      update: async (key, value) => { settings[section][key] = value; },
    }, workspaceFolders: [{ uri: { fsPath: workspace } }], textDocuments: [document], openTextDocument: async () => document },
    window: { activeTextEditor: current, visibleTextEditors: [current], showTextDocument: async () => current, showErrorMessage() {} },
    commands: { executeCommand: async (command, uri, discard) => {
      calls.push(command);
      assert.equal(uri, document.uri);
      if (document.isDirty && !discard) return { open: true, dirty: true };
      document.isDirty = false;
      return { open: true, dirty: false, refreshed: true };
    } },
    Uri: { file: fsPath => ({ fsPath }) },
    Position: class { constructor(line, character) { this.line = line; this.character = character; } },
    Selection: class { constructor(start, end) { this.start = start; this.end = end; } },
    Range: class { constructor(start, end) { this.start = start; this.end = end; } },
    ConfigurationTarget: { Global: 1 },
  };
  const bridge = await bridgeModule.createBridge(vscode, directory);
  t.after(async () => { await bridge.dispose(); await fs.rm(temporary, { recursive: true, force: true }); });
  const registration = JSON.parse(await fs.readFile(path.join(directory, `${'a'.repeat(64)}.json`), 'utf8'));
  assert.match(registration.token, /^[a-f0-9]{64}$/);
  assert.equal(registration.workspace, workspace);
  const invoke = (body, token = registration.token) => fetch(`http://127.0.0.1:${registration.port}/command`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  assert.equal((await invoke({ action: 'status' }, 'invalid')).status, 401);
  assert.deepEqual(await (await invoke({ action: 'status' })).json(), { dirty: true });
  assert.deepEqual(await (await invoke({ action: 'documents' })).json(), { documents: [{ path: file, dirty: true }] });
  assert.deepEqual(await (await invoke({ action: 'reload', path: file })).json(), { open: true, dirty: true });
  assert.deepEqual(calls, [], 'dirty documents are never reverted without explicit discard');
  assert.deepEqual(await (await invoke({ action: 'reload', path: file, discard: true })).json(), { open: true, dirty: false, refreshed: true });
  assert.deepEqual(calls, ['amadeus.reloadFile']);
  assert.equal((await invoke({ action: 'open', path: outside })).status, 403);
  assert.equal((await invoke({ action: 'open', path: 'paper.tex' })).status, 400);
  assert.equal((await invoke({ action: 'open', path: file, text: 'ell' })).status, 200);
  assert.equal(current.selection.start.character, 1);
  assert.equal(current.selection.end.character, 4);
  assert.deepEqual(await (await invoke({ action: 'selection' })).json(), { text: 'hello', path: 'paper.tex', lineStart: 1, lineEnd: 1 });
  assert.equal((await invoke({ action: 'theme', theme: 'dark' })).status, 200);
  assert.equal(settings.workbench.colorTheme, 'Default Dark Modern');
  assert.deepEqual(settings.workbench.colorCustomizations['[Default Light Modern]'], { 'activityBar.foreground': '#123456', 'editor.lineHighlightBackground': '#0000000F' });
  assert.equal(settings.workbench.colorCustomizations['[Default Dark Modern]']['editor.lineHighlightBackground'], '#112233');
  assert.equal(settings.workbench.colorCustomizations['editor.lineHighlightBorder'], '#00000000');
  assert.equal(settings.workbench.colorCustomizations['editorCursor.foreground'], '#ABCDEF');
  assert.equal(settings.workbench.colorCustomizations['sideBar.background'], undefined, 'workspace overrides are not copied to global settings');
  assert.equal((await invoke({ action: 'theme', theme: 'light' })).status, 200);
  assert.equal(settings.workbench.colorTheme, 'Default Light Modern');
  for (const selector of ['[Default Dark Modern][Default Light Modern]', '[*Modern*]']) {
    const customized = {
      '[Default Light+]': { 'editor.lineHighlightBackground': '#0000000F' },
      '[Default Dark+]': { 'editor.lineHighlightBackground': '#FFFFFF14' },
      [selector]: { 'editor.lineHighlightBackground': '#445566' },
    };
    settings.workbench.colorCustomizations = customized;
    assert.equal((await invoke({ action: 'theme', theme: 'dark' })).status, 200);
    assert.equal((await invoke({ action: 'theme', theme: 'light' })).status, 200);
    assert.deepEqual(settings.workbench.colorCustomizations, customized, 'combined/wildcard Modern override stays effective');
    assert.equal(settings.workbench.colorCustomizations['[Default Dark Modern]'], undefined);
    assert.equal(settings.workbench.colorCustomizations['[Default Light Modern]'], undefined);
  }
  assert.equal((await invoke({ action: 'theme', theme: 'invalid' })).status, 400);
  assert.deepEqual(await (await invoke({ action: 'fontSize' })).json(), { size: 16 });
  assert.deepEqual(await (await invoke({ action: 'fontSize', size: 18 })).json(), { size: 18 });
  assert.equal(settings.editor.fontSize, 18);
  assert.equal((await invoke({ action: 'fontSize', size: 100 })).status, 400);
  assert.equal((await invoke({ action: 'executeCommand', command: 'terminal.new' })).status, 400);
  for (const action of ['save', 'undo', 'redo', 'markdown-preview', 'latex-build', 'latex-preview']) {
    assert.equal((await invoke({ action })).status, 400);
  }
  assert.deepEqual(calls, ['amadeus.reloadFile'], 'unexposed VS Code commands stay unavailable');
  document.getText = () => 'x'.repeat(50000);
  assert.equal((await invoke({ action: 'selection' })).status, 200);
  document.getText = () => 'x'.repeat(50001);
  assert.equal((await invoke({ action: 'selection' })).status, 413);
  assert.equal((await invoke({ action: 'open', path: file, text: 'a'.repeat(66000) })).status, 413);
  const beforeWatcher = calls.length;
  await fs.writeFile(file, 'agent changed this file');
  for (let i = 0; i < 200 && calls.length === beforeWatcher; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(calls.slice(beforeWatcher), ['amadeus.reloadFile'], 'disk writes reload without injecting a watcher event or connecting a browser');
});

test('unconfigured workbench skips bridge startup quietly', async () => {
  const vscode = { workspace: { getConfiguration: () => ({ get: () => '' }) } };
  assert.equal(await bridgeModule.createBridge(vscode), undefined);
});

test('failed bridge registration disposes document lifecycle listeners before retrying', async t => {
  const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'amadeus-bridge-failure-')));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const directory = path.join(temporary, 'not-a-directory');
  await fs.writeFile(directory, '');
  let installed = 0, disposed = 0;
  const listen = () => { installed++; return { dispose() { disposed++; } }; };
  const vscode = { workspace: {
    getConfiguration: () => ({ get: () => 'a'.repeat(64) }), workspaceFolders: [{ uri: { fsPath: temporary } }], textDocuments: [],
    onDidOpenTextDocument: listen, onDidCloseTextDocument: listen, onDidChangeTextDocument: listen, onDidSaveTextDocument: listen,
  }, window: { showErrorMessage() {} } };
  await assert.rejects(bridgeModule.createBridge(vscode, directory));
  await assert.rejects(bridgeModule.createBridge(vscode, directory));
  assert.equal(installed, 8);
  assert.equal(disposed, installed);
});

test('bridge activation waits for folders, replaces registrations, and disposes late startup', async t => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'amadeus-activation-'));
  const directory = path.join(temporary, 'bridge');
  let id = 'a'.repeat(64), folderListener, configListener, disposedListeners = 0;
  const errors = [];
  const vscode = {
    workspace: {
      getConfiguration: () => ({ get: () => id }), workspaceFolders: undefined,
      onDidChangeWorkspaceFolders: callback => { folderListener = callback; return { dispose: () => disposedListeners++ }; },
      onDidChangeConfiguration: callback => { configListener = callback; return { dispose: () => disposedListeners++ }; },
    },
    window: { showErrorMessage: message => errors.push(message) },
    commands: { executeCommand: async () => {} },
  };
  const service = bridgeModule.startBridgeService(vscode, { directory, retryMs: 5, startupMs: 100 });
  t.after(async () => { await service.dispose(); await fs.rm(temporary, { recursive: true, force: true }); });
  await service.refresh();
  assert.deepEqual(errors, [], 'folders arriving late must not toast');
  vscode.workspace.workspaceFolders = [{ uri: { fsPath: temporary } }];
  folderListener(); await service.refresh();
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, `${id}.json`), 'utf8')).workspace, temporary);
  const previous = id;
  id = 'b'.repeat(64);
  configListener({ affectsConfiguration: key => key === 'amadeus.bridgeId' });
  await service.refresh();
  await assert.rejects(fs.stat(path.join(directory, `${previous}.json`)), { code: 'ENOENT' });
  await fs.stat(path.join(directory, `${id}.json`));
  await service.dispose();
  await assert.rejects(fs.stat(path.join(directory, `${id}.json`)), { code: 'ENOENT' });
  assert.equal(disposedListeners, 2);
  assert.deepEqual(errors, []);

  let release, started;
  const startup = new Promise(resolve => { started = resolve; });
  let lateDisposed = false;
  const late = bridgeModule.startBridgeService(vscode, { factory: async () => {
    started(); await new Promise(resolve => { release = resolve; });
    return { dispose: async () => { lateDisposed = true; } };
  } });
  await startup;
  const stopped = late.dispose(); release(); await stopped;
  assert.equal(lateDisposed, true, 'late registration must be removed after deactivation');
});

test('managed empty workspace recovery touches unchanged config once and then registers arriving folders', async t => {
  const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'amadeus-rescan-')));
  const id = 'c'.repeat(64), file = path.join(temporary, `${id}.code-workspace`);
  const content = JSON.stringify({ folders: [{ path: temporary }], settings: { 'amadeus.bridgeId': id } });
  await fs.writeFile(file, content);
  await fs.utimes(file, new Date(1000), new Date(1000));
  const vscode = {
    workspace: {
      workspaceFolders: [], workspaceFile: { scheme: 'file', fsPath: file },
      getConfiguration: () => ({ get: () => id }),
      onDidChangeWorkspaceFolders: () => ({ dispose() {} }), onDidChangeConfiguration: () => ({ dispose() {} }),
    },
    window: { showErrorMessage: message => assert.fail(message) }, commands: { executeCommand: async () => {} },
  };
  const service = bridgeModule.startBridgeService(vscode, { directory: temporary, recoveryMs: 0 });
  t.after(async () => { await service.dispose(); await fs.rm(temporary, { recursive: true, force: true }); });
  await service.refresh();
  const modified = (await fs.stat(file)).mtimeMs;
  assert.ok(modified > 1000);
  await service.refresh(); await service.refresh();
  assert.equal((await fs.stat(file)).mtimeMs, modified, 'rescan happens once per workspace');
  assert.equal(await fs.readFile(file, 'utf8'), content);
  vscode.workspace.workspaceFolders = [{ uri: { fsPath: temporary } }];
  await service.refresh();
  await fs.stat(path.join(temporary, `${id}.json`));
  vscode.workspace.workspaceFolders = [];
  assert.equal(await bridgeModule.rescanManagedWorkspace(vscode, () => false), false, 'cancelled activation cannot touch config');
  vscode.workspace.workspaceFile.fsPath = path.join(temporary, 'unmanaged.code-workspace');
  assert.equal(await bridgeModule.rescanManagedWorkspace(vscode), false);
  vscode.workspace.workspaceFile.fsPath = file;
  await fs.writeFile(file, JSON.stringify({ folders: [{ path: temporary }], settings: { 'amadeus.bridgeId': 'd'.repeat(64) } }));
  assert.equal(await bridgeModule.rescanManagedWorkspace(vscode), false);
  await fs.writeFile(file, JSON.stringify({ folders: [{ path: '.' }], settings: { 'amadeus.bridgeId': id } }));
  assert.equal(await bridgeModule.rescanManagedWorkspace(vscode), false);
});
