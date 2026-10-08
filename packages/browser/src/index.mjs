import path from 'node:path';
import { WebSocketServer } from 'ws';
import { BrowserManager, BrowserError } from './manager.mjs';
import { installProviderBridge } from './provider-bridge.mjs';
import { streamPage } from './stream.mjs';
import { sessionRoot, json } from '../../files/src/workspace.mjs';

export const inject = ['webServer', 'sessions', 'agents', 'tools', 'systemPrompt', 'browserUse'];
export async function apply(ctx, config = {}) {
  const manager = new BrowserManager({ stateDir: config.stateDir || path.resolve('.amadeus/browser'), executablePath: config.executablePath });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 16384 });
  ctx.provide('amadeusBrowser', manager);
  installProviderBridge(ctx, manager, config);
  ctx.effect(() => async () => { for (const socket of sockets.clients) socket.terminate(); sockets.close(); await manager.close(); });
  ctx.on('session/event', (session, event) => {
    const entry = manager.entries.get(session.id);
    if (entry && event.type === 'turn/start') entry.runId = String(event.data.turn ?? event.seq);
  });
  ctx.on('api-session/removed', sessionId => { void manager.closeSession(sessionId).catch(error => ctx.logger.warn(error)); });
  const handle = async (req, res) => {
    try {
      const url = new URL(req.url, 'http://amadeus');
      if (url.pathname === '/amadeus/browser/events' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' }); res.flushHeaders?.();
        const emit = state => { if (!res.destroyed && res.writableLength < 65536) res.write(`data: ${JSON.stringify(state)}\n\n`); };
        manager.on('state', emit); for (const entry of manager.entries.values()) emit(manager.state(entry));
        const heartbeat = setInterval(() => { if (!res.destroyed && res.writableLength < 65536) res.write(': keepalive\n\n'); }, 15000);
        res.once('close', () => { clearInterval(heartbeat); manager.off('state', emit); }); return;
      }
      const sessionId = url.searchParams.get('session'); await sessionRoot(ctx, sessionId);
      if (url.pathname === '/amadeus/browser/state' && req.method === 'GET') {
        const entry = manager.entries.get(sessionId) || await manager.ensure(sessionId); return json(res, 200, manager.state(entry));
      }
      if (url.pathname !== '/amadeus/browser/command' || req.method !== 'POST') throw new BrowserError('Route not found.', 404);
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 32768) throw new BrowserError('Browser command too large.', 413); chunks.push(chunk); }
      let input; try { input = JSON.parse(Buffer.concat(chunks)); } catch { throw new BrowserError('Invalid browser command.', 400); }
      if (!input || typeof input !== 'object' || input.action !== 'retry') throw new BrowserError('The AI browser is read-only.', 403);
      if (input.action === 'retry') {
        const old = manager.entries.get(sessionId);
        if (!old || old.browserId !== input.browserId || old.generation !== input.generation) throw new BrowserError('Browser instance changed.');
        if (!old.failed) return json(res, 200, manager.state(old));
        const entry = old.reconnect ? await old.reconnect() : await manager.ensure(sessionId);
        return json(res, 200, manager.state(entry));
      }
    } catch (error) { if (res.headersSent) res.destroy(); else json(res, error.status || 500, { error: error.message }); }
  };
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/amadeus/browser', handler: handle }));
  ctx.effect(() => ctx.webServer.registerUpgrade({ kind: 'exact', path: '/amadeus/browser/stream', handler: async (req, socket, head) => {
    try {
      const url = new URL(req.url, 'http://amadeus'); const sessionId = url.searchParams.get('session'); await sessionRoot(ctx, sessionId);
      const entry = manager.entries.get(sessionId); if (!entry) throw new BrowserError('Open the browser first.');
      manager.validate(entry, { browserId: url.searchParams.get('browserId'), generation: Number(url.searchParams.get('generation')) });
      const targetId = url.searchParams.get('target'); if (!entry.pages.has(targetId)) throw new BrowserError('Page not found.', 404);
      sockets.handleUpgrade(req, socket, head, ws => {
        void streamPage(manager, entry, targetId, ws).catch(error => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', error: error.message })); ws.close(1011); });
      });
    } catch (error) { if (!socket.destroyed) socket.end(`HTTP/1.1 ${error.status || 400} Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); }
  } }));
}
