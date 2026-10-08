import path from 'node:path';
import { createCodeServerProxy } from './proxy.mjs';
import { sessionRoot, json, routeErrors, HttpError } from '../../files/src/workspace.mjs';
import { prepareWorkspace, editorFile, pdfAnnotationSource, bridgeCommand, bridgeEvents } from './workspace.mjs';
import { createBackgroundRefresh } from './background-refresh.mjs';

export const inject = ['webServer', 'sessions', 'fs'];
const actions = new Set(['open', 'selection', 'pdfSource', 'status', 'documents', 'reload', 'theme', 'fontSize']);

function waitForResponse(res) {
  return new Promise(resolve => {
    const done = () => {
      res.off('drain', done);
      res.off('close', done);
      res.off('error', done);
      resolve();
    };
    res.once('drain', done);
    res.once('close', done);
    res.once('error', done);
  });
}

export async function apply(ctx, config = {}) {
  const stateDir = path.resolve(config.stateDir || '.amadeus/editor');
  const bridgeDir = path.resolve(config.bridgeDir || process.env.AMADEUS_EDITOR_BRIDGE_DIR || path.join(stateDir, 'bridge'));
  const proxy = createCodeServerProxy({ upstream: config.upstream || 'http://127.0.0.1:8080' });
  ctx.effect(() => () => proxy.close());
  ctx.effect(() => createBackgroundRefresh(ctx, bridgeDir));
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/amadeus/code', handler: proxy.handle }));
  ctx.effect(() => ctx.webServer.registerUpgrade({ kind: 'prefix', path: '/amadeus/code', handler: proxy.upgrade }));
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/amadeus/editor', handler: routeErrors(async (req, res) => {
    const url = new URL(req.url, 'http://amadeus');
    const sessionId = url.searchParams.get('session');
    const root = await sessionRoot(ctx, sessionId);
    const instance = url.searchParams.get('instance');
    if (!instance || instance.length > 256) throw new HttpError(400, 'Editor instance is required');
    const bridgeId = JSON.stringify([sessionId, instance]);
    if (url.pathname === '/amadeus/editor/workspace' && req.method === 'GET') {
      return json(res, 200, await prepareWorkspace({ sessionId: bridgeId, root, stateDir }));
    }
    if (url.pathname === '/amadeus/editor/events' && req.method === 'GET') {
      const controller = new AbortController();
      const abort = () => controller.abort();
      req.once('aborted', abort);
      res.once('close', abort);
      try {
        const stream = await bridgeEvents({ sessionId: bridgeId, root, bridgeDir, signal: controller.signal });
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.flushHeaders?.();
        for await (const chunk of stream.body || []) {
          if (res.destroyed) break;
          if (!res.write(chunk)) await waitForResponse(res);
        }
      } catch (error) {
        if (!res.headersSent) throw error;
        if (!controller.signal.aborted) res.destroy(error);
      } finally {
        abort();
        req.off('aborted', abort);
        res.off('close', abort);
        if (!res.destroyed && !res.writableEnded) res.end();
      }
      return;
    }
    if (url.pathname !== '/amadeus/editor/command' || req.method !== 'POST') throw new HttpError(404, 'Route not found');
    let size = 0, chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) throw new HttpError(413, 'Editor request is too large');
      chunks.push(chunk);
    }
    let command;
    try { command = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Invalid editor command'); }
    if (!command || !actions.has(command.action)) throw new HttpError(400, 'Unknown editor command');
    if (command.action === 'pdfSource') {
      if (typeof command.fileUri !== 'string' || !command.fileUri || command.fileUri.length > 8192) throw new HttpError(400, 'PDF file URI is required');
      return json(res, 200, await pdfAnnotationSource(root, command.fileUri));
    }
    // Construct a new object, never forward arbitrary caller-supplied commands.
    const input = { action: command.action };
    if (input.action === 'open') {
      if (typeof command.path !== 'string' || !command.path) throw new HttpError(400, 'File path is required');
      input.path = await editorFile(root, command.path);
      if (typeof command.text === 'string') input.text = command.text.slice(0, 50000);
      if (Number.isSafeInteger(command.line) && command.line > 0) input.line = command.line;
    }
    if (input.action === 'reload') {
      if (typeof command.path !== 'string' || !command.path) throw new HttpError(400, 'File path is required');
      input.path = await editorFile(root, command.path);
      input.discard = command.discard === true;
    }
    if (input.action === 'theme') {
      if (!['light', 'dark'].includes(command.theme)) throw new HttpError(400, 'Invalid editor theme');
      input.theme = command.theme;
    }
    if (input.action === 'fontSize' && command.size !== undefined) {
      if (!Number.isInteger(command.size) || command.size < 10 || command.size > 36) throw new HttpError(400, 'Invalid editor font size');
      input.size = command.size;
    }
    json(res, 200, await bridgeCommand({ sessionId: bridgeId, root, bridgeDir, command: input }));
  }) }));
}
