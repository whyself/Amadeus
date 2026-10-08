import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { HttpError, resolveWithin } from '../../files/src/workspace.mjs';

export const workspaceId = sessionId => createHash('sha256').update(sessionId).digest('hex');

export async function prepareWorkspace({ sessionId, root, stateDir }) {
  const id = workspaceId(sessionId);
  const directory = path.join(stateDir, 'workspaces');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${id}.code-workspace`);
  const content = JSON.stringify({ folders: [{ path: root }], settings: {
    'amadeus.bridgeId': id,
    'workbench.activityBar.location': 'default',
    'workbench.sideBar.location': 'right',
  } }, null, 2);
  // Preserve the workspace mtime: VS Code watches this file while it is open.
  if (await readFile(file, 'utf8').catch(() => '') !== content) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, content, { mode: 0o600 }); await rename(temporary, file); }
    finally { await rm(temporary, { force: true }); }
  }
  return { id, url: `/amadeus/code/?${new URLSearchParams({ workspace: file })}` };
}

export async function editorFile(root, input) {
  const file = await resolveWithin(root, input);
  if (!(await stat(file)).isFile()) throw new HttpError(400, 'Only regular files can be opened in the editor');
  return file;
}

export async function pdfAnnotationSource(root, fileUri) {
  let file;
  try {
    const url = new URL(fileUri);
    if (url.protocol !== 'file:' || url.search || url.hash || (url.hostname && url.hostname !== 'localhost')) throw new Error('Invalid PDF URI');
    file = fileURLToPath(url);
  } catch { throw new HttpError(400, 'Invalid PDF file URI'); }
  if (path.extname(file).toLowerCase() !== '.pdf') throw new HttpError(400, 'Only PDF selections are supported');
  const checked = await editorFile(root, file);
  return { path: path.relative(root, checked).split(path.sep).join('/') };
}

async function bridgeRegistration({ sessionId, root, bridgeDir }) {
  const registration = await readFile(path.join(bridgeDir, `${workspaceId(sessionId)}.json`), 'utf8').then(JSON.parse).catch(() => null);
  if (!registration || registration.workspace !== root || !Number.isInteger(registration.port) || registration.port < 1 || registration.port > 65535 || !/^[a-f0-9]{64}$/.test(registration.token ?? '')) {
    throw new HttpError(503, '编辑器正在连接。请等待 code-server 加载，或检查 Amadeus Bridge 扩展。');
  }
  return registration;
}

export async function bridgeEvents({ sessionId, root, bridgeDir, request = fetch, signal }) {
  const registration = await bridgeRegistration({ sessionId, root, bridgeDir });
  let response;
  try {
    response = await request(`http://127.0.0.1:${registration.port}/events`, {
      headers: { Authorization: `Bearer ${registration.token}` }, signal,
    });
  } catch { throw new HttpError(503, '编辑器连接中断，请等待重连后重试。'); }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new HttpError(response.status, result.error || 'Editor events failed');
  }
  return response;
}

export async function bridgeCommand({ sessionId, root, bridgeDir, command, request = fetch }) {
  const registration = await bridgeRegistration({ sessionId, root, bridgeDir });
  let response;
  try {
    response = await request(`http://127.0.0.1:${registration.port}/command`, {
      method: 'POST', headers: { Authorization: `Bearer ${registration.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command), signal: AbortSignal.timeout(15000),
    });
  } catch { throw new HttpError(503, '编辑器连接中断，请等待重连后重试。'); }
  const result = await response.json();
  if (!response.ok) throw new HttpError(response.status, result.error || 'Editor command failed');
  return result;
}
