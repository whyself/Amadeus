import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readFile, writeFile, stat, rm, mkdir } from 'node:fs/promises';
import { prepareWorkspace, editorFile, bridgeCommand, workspaceId } from '../packages/editor/src/workspace.mjs';

test('generated workspaces are stable, session isolated, and never rewrite user project settings', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amadeus-editor-'));
  t.after(async () => { assert.ok(root.startsWith(os.tmpdir())); await rm(root, { recursive: true, force: true }); });
  const stateDir = path.join(root, 'state'), project = path.join(root, 'project');
  await mkdir(project); await writeFile(path.join(project, '中文 # file.tex'), 'text');
  const options = { root: project, stateDir, sessionId: 's1' };
  const workspace = await prepareWorkspace(options);
  const file = new URL(workspace.url, 'http://localhost').searchParams.get('workspace');
  const before = (await stat(file)).mtimeMs;
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), { folders: [{ path: project }], settings: { 'amadeus.bridgeId': workspaceId('s1'), 'workbench.activityBar.location': 'default', 'workbench.sideBar.location': 'right' } });
  assert.deepEqual(await prepareWorkspace(options), workspace);
  assert.equal((await stat(file)).mtimeMs, before);
  assert.notEqual((await prepareWorkspace({ ...options, sessionId: 's2' })).url, workspace.url);
  assert.equal(await editorFile(project, '中文 # file.tex'), path.join(project, '中文 # file.tex'));
  await assert.rejects(editorFile(project, '../outside'), error => error.status === 400);
  await assert.rejects(editorFile(project, '.'), error => error.status === 400);
  await assert.rejects(bridgeCommand({ sessionId: 's1', root: project, bridgeDir: stateDir, command: { action: 'status' } }), error => error.status === 503);
  await writeFile(path.join(stateDir, `${workspaceId('s1')}.json`), JSON.stringify({ port: 1234, token: 'a'.repeat(64), workspace: '/different-project' }));
  await assert.rejects(bridgeCommand({ sessionId: 's1', root: project, bridgeDir: stateDir, command: { action: 'status' }, request: () => { throw new Error('must not be called'); } }), error => error.status === 503);
});
