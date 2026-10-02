import path from 'node:path';
import { lstat, mkdir } from 'node:fs/promises';
import { sessionRoot, resolveWithin, HttpError, json, routeErrors } from './workspace.mjs';
import { upload, download } from './transfer.mjs';
import { inspectRemoval, removeConfirmed } from './remove.mjs';

export const inject = ['webServer', 'sessions', 'workspaceRegistry'];

export async function apply(ctx, config = {}) {
  // Remote browsers cannot use DSH's host-native directory picker. Register the
  // configured mount before the first browser session; create is path-idempotent.
  if (config.workspace) await ctx.workspaceRegistry.create(path.resolve(config.workspace));
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/amadeus/files', handler: routeErrors(async (req, res) => {
    const url = new URL(req.url, 'http://amadeus');
    const root = await sessionRoot(ctx, url.searchParams.get('session'));
    const input = url.searchParams.get('path') ?? '';
    if (req.method === 'GET' && url.pathname === '/amadeus/files/remove-preview') {
      const { path: relative, directory, version } = await inspectRemoval(root, input);
      return json(res, 200, { path: relative, directory, version });
    }
    if (req.method === 'DELETE' && url.pathname === '/amadeus/files/remove') {
      return json(res, 200, await removeConfirmed(root, input, url.searchParams.get('version')));
    }
    if (req.method === 'GET' && url.pathname === '/amadeus/files/download') return download(root, input, req, res);
    if (req.method === 'PUT' && url.pathname === '/amadeus/files/upload') {
      const maxBytes = config.maxUploadBytes ?? 1024 ** 3;
      if (Number(req.headers['content-length']) > maxBytes) throw new HttpError(413, 'Upload exceeds the configured file size limit');
      return json(res, 201, await upload(root, input, req, { maxBytes, overwriteVersion: url.searchParams.get('overwriteVersion') || undefined }));
    }
    if (req.method === 'POST' && url.pathname === '/amadeus/files/mkdir') {
      const target = await resolveWithin(root, input, { createParents: true, allowMissing: true });
      await mkdir(target).catch(error => { if (error.code !== 'EEXIST') throw error; });
      if (!(await lstat(target)).isDirectory()) throw new HttpError(409, 'A file occupies this directory path');
      return json(res, 201, { path: input });
    }
    throw new HttpError(404, 'Route not found');
  }) }), 'amadeus file transfers');
}
