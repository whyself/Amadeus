import { spawn } from 'node:child_process';
import { once, EventEmitter } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { chromium } from './runtime.mjs';
import { readPageMetadata } from './page-metadata.mjs';

export class BrowserError extends Error {
  constructor(message, status = 409) { super(message); this.status = status; }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class BrowserManager extends EventEmitter {
  constructor({ stateDir, executablePath = chromium.executablePath() }) {
    super(); this.stateDir = path.resolve(stateDir); this.executablePath = executablePath;
    this.entries = new Map(); this.creating = new Map(); this.generations = new Map(); this.stopping = false;
  }
  async ensure(sessionId) {
    if (this.stopping) throw new BrowserError('Browser service is stopping.');
    const entry = this.entries.get(sessionId);
    if (entry) {
      if (entry.failed) {
        if (entry.agent) throw new BrowserError('Browser process exited. Reconnect the browser to restore.');
        await this.closeSession(sessionId); return this.ensure(sessionId);
      }
      return entry;
    }
    if (this.creating.has(sessionId)) return this.creating.get(sessionId);
    const pending = this.create(sessionId).finally(() => this.creating.delete(sessionId));
    this.creating.set(sessionId, pending); return pending;
  }
  async create(sessionId) {
    const generation = (this.generations.get(sessionId) || 0) + 1;
    this.generations.set(sessionId, generation);
    const directory = path.join(this.stateDir, createHash('sha256').update(sessionId).digest('hex'));
    const profile = path.join(directory, 'profile');
    await mkdir(profile, { recursive: true, mode: 0o700 });
    // A fresh stderr CDP announcement avoids reading a stale DevToolsActivePort after restart.
    const child = spawn(this.executablePath, ['--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage', ...(process.platform === 'linux' ? ['--no-sandbox'] : []), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let browser;
    try {
      const endpoint = await new Promise((resolve, reject) => {
        let stderr = ''; const timeout = setTimeout(() => done(new Error('Chromium did not expose CDP in time.')), 20000);
        const done = (error, url) => { clearTimeout(timeout); child.off('error', errorHandler); child.off('exit', exited); child.stderr.off('data', data); error ? reject(error) : resolve(url); };
        const errorHandler = error => done(error); const exited = code => done(new Error(`Chromium exited during startup (${code}).`));
        const data = chunk => { stderr = (stderr + chunk).slice(-8192); const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) done(null, match[1]); };
        child.once('error', errorHandler); child.once('exit', exited); child.stderr.on('data', data);
      });
      browser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
      const context = browser.contexts()[0];
      const entry = { sessionId, browserId: randomUUID(), generation, endpoint, child, browser, context, directory, pages: new Map(), selected: null, agent: null, tail: Promise.resolve(), stateRevision: 0, reveal: null, persistTail: Promise.resolve() };
      let saved;
      try { saved = JSON.parse(await readFile(path.join(directory, 'pages.json'), 'utf8')); } catch {}
      entry.savedPages = Array.isArray(saved?.pages) ? saved.pages.filter(p => typeof p.url === 'string' && /^https?:/.test(p.url)) : [];
      this.entries.set(sessionId, entry);
      child.once('exit', () => { entry.failed = true; this.publish(entry); });
      context.on('page', page => { void this.track(entry, page).catch(() => {}); });
      for (const page of context.pages()) await this.track(entry, page);
      if (!entry.selected && entry.pages.size) entry.selected = entry.pages.keys().next().value;
      this.publish(entry); return entry;
    } catch (error) {
      if (browser) await browser.newBrowserCDPSession().then(cdp => cdp.send('Browser.close')).catch(() => {});
      if (child.exitCode === null) child.kill();
      this.entries.delete(sessionId); throw error;
    }
  }
  async track(entry, page) {
    if (page.isClosed()) return;
    const cdp = await entry.context.newCDPSession(page);
    let info;
    try { info = (await cdp.send('Target.getTargetInfo')).targetInfo; await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }); } finally { await cdp.detach(); }
    if (entry.pages.has(info.targetId)) return;
    const targetId = info.targetId;
    entry.pages.set(targetId, page);
    if (!entry.selected) entry.selected = targetId;
    const update = () => { this.publish(entry); };
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) update(); });
    page.on('domcontentloaded', update);
    page.on('load', update);
    page.once('close', () => { entry.pages.delete(targetId); if (entry.selected === targetId) entry.selected = entry.pages.keys().next().value || null; this.publish(entry, { persist: false }); });
    update();
  }
  async refresh(entry) {
    for (const page of entry.context.pages()) await this.track(entry, page);
    for (const [id, page] of entry.pages) if (page.isClosed()) entry.pages.delete(id);
    if (!entry.pages.has(entry.selected)) entry.selected = entry.pages.keys().next().value || null;
  }
  state(entry) {
    return { sessionId: entry.sessionId, browserId: entry.browserId, generation: entry.generation, revision: entry.stateRevision, selectedTargetId: entry.selected, failed: !!entry.failed, reveal: entry.reveal, pages: [...entry.pages].filter(([, p]) => !p.isClosed()).map(([targetId, p]) => ({ targetId, url: p.url(), title: entry.metadata?.get(targetId)?.title || '', favicon: entry.metadata?.get(targetId)?.favicon || null })) };
  }
  publish(entry, { persist = true } = {}) {
    if (this.entries.get(entry.sessionId) !== entry) return;
    entry.stateRevision++; this.emit('state', this.state(entry));
    entry.metadata ??= new Map(); entry.metadataPending ??= new Set();
    for (const [id, page] of entry.pages) if (!page.isClosed() && !entry.metadataPending.has(id)) {
      entry.metadataPending.add(id);
      const pageUrl = page.url(), previous = entry.metadata.get(id);
      void readPageMetadata(page, previous, metadata => {
        if (this.entries.get(entry.sessionId) !== entry || page.isClosed() || page.url() !== pageUrl || metadata.url !== pageUrl) return;
        if (entry.metadata.get(id)?.title !== metadata.title) {
          entry.metadata.set(id, { ...previous, title: metadata.title }); entry.stateRevision++; this.emit('state', this.state(entry));
        }
      }).then(metadata => {
        if (this.entries.get(entry.sessionId) !== entry || page.isClosed() || page.url() !== pageUrl) return;
        entry.metadata.set(id, metadata);
        if (previous?.title !== metadata.title || previous?.favicon !== metadata.favicon) { entry.stateRevision++; this.emit('state', this.state(entry)); }
      }).catch(() => {}).finally(() => {
        entry.metadataPending.delete(id);
        if (!page.isClosed() && page.url() !== pageUrl && this.entries.get(entry.sessionId) === entry) this.publish(entry, { persist: false });
      });
    }
    const pages = [...entry.pages.values()].filter(p => !p.isClosed() && /^https?:/.test(p.url())).map(p => ({ url: p.url() }));
    // A crashing target can disappear before the process exit notification.
    // Keep the last nonempty checkpoint; explicit page-close tools clear it below.
    if (persist && !entry.failed && !entry.disposing && pages.length) {
      const serialized = JSON.stringify({ pages });
      if (entry.persisted !== serialized) { entry.persisted = serialized; entry.persistTail = entry.persistTail.then(() => writeFile(path.join(entry.directory, 'pages.json'), serialized, { mode: 0o600 })).catch(() => { entry.persisted = null; }); }
    }
  }
  validate(entry, input) {
    if (input.browserId !== entry.browserId || input.generation !== entry.generation || entry.failed) throw new BrowserError('Browser instance changed. Refresh its state before acting.');
  }
  serial(entry, operation) {
    const pending = entry.tail.then(operation); entry.tail = pending.catch(() => {}); return pending;
  }
  async acquire(agent) {
    const entry = await this.ensure(agent.id);
    if (entry.agent && entry.agent !== agent) throw new BrowserError('Browser belongs to another activation of this conversation.');
    entry.agent = agent;
    entry.runId = null;
    return { entry, endpoint: entry.endpoint, release: () => { if (entry.agent === agent) entry.agent = null; } };
  }
  async runAI(entry, exec, operation) {
    return this.serial(entry, async () => {
      exec.signal.throwIfAborted();
      if (entry.failed) throw new BrowserError('Browser process is unavailable.');
      const raw = exec.name.replace('mcp__playwright-mcp__', '');
      const result = await operation();
      await this.refresh(entry);
      if (!result.isError && !entry.pages.size && (raw === 'browser_close' || (raw === 'browser_tabs' && exec.arguments?.action === 'close'))) {
        entry.persisted = '{"pages":[]}';
        entry.persistTail = entry.persistTail.then(() => writeFile(path.join(entry.directory, 'pages.json'), '{"pages":[]}', { mode: 0o600 })).catch(() => {});
      }
      if (!result.isError && !['browser_tabs', 'browser_close', 'browser_install', 'browser_resize'].includes(raw)) {
        const runId = entry.runId || 'activation';
        entry.reveal = { id: randomUUID(), runId, targetId: entry.selected };
      } else if (!result.isError && raw === 'browser_tabs' && ['new', 'select'].includes(exec.arguments?.action)) entry.reveal = { id: randomUUID(), runId: entry.runId || 'activation', targetId: entry.selected };
      this.publish(entry); return result;
    });
  }
  async closeSession(sessionId) {
    await this.creating.get(sessionId)?.catch(() => {});
    const entry = this.entries.get(sessionId); if (!entry) return;
    entry.failed = true; entry.disposing = true; this.publish(entry);
    // Closing Chromium interrupts outstanding MCP work before waiting for its queue.
    await entry.browser.newBrowserCDPSession().then(cdp => cdp.send('Browser.close')).catch(() => {});
    if (entry.child.exitCode === null) { const exited = once(entry.child, 'exit').catch(() => {}); entry.child.kill(); await Promise.race([exited, sleep(3000)]); }
    await entry.tail; await entry.persistTail;
    await entry.browser.close().catch(() => {}); this.entries.delete(sessionId);
  }
  async close() { this.stopping = true; await Promise.allSettled([...this.creating.values()]); await Promise.all([...this.entries.keys()].map(id => this.closeSession(id))); }
}
