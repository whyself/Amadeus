// Targeted Chromium/WebKit smoke; requires the corresponding Playwright runtime.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { chromium, webkit } from 'playwright';
import { injectBrowserCompatibility } from '../packages/login/src/browser-compat.mjs';
import { pwaManifestSource, serviceWorkerSource } from '../packages/login/src/pwa.mjs';

const pdfClient = await readFile(path.resolve(import.meta.dirname, '../node_modules/@deepseek-ai/dsh-client-ui-sidebar-documentpreview/lib/client.pdf.js'), 'utf8');
// The bundler emits a JS string literal (including \x escapes), not JSON.
const pdfSource = runInNewContext(/var _dsh_pdf_worker_default = ("(?:[^"\\]|\\.)*");/.exec(pdfClient)[1]);
assert.ok(pdfSource.includes('WorkerMessageHandler') && pdfSource.includes('pdfjs'));
const html = injectBrowserCompatibility('<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"><div id="panel" style="height:100px;overflow:auto"><div style="height:1000px">Scroll panel</div></div><div id="composer" contenteditable="true">Compose</div></div></body></html>');
const server = createServer((req, res) => {
  if (req.url === '/manifest.webmanifest') { res.setHeader('Content-Type', 'application/manifest+json'); res.end(pwaManifestSource); }
  else if (req.url === '/sw.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(serviceWorkerSource); }
  else { res.setHeader('Content-Type', 'text/html'); res.end(html); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
try {
  for (const engine of ['chromium', 'webkit']) {
    const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || 'msedge' }));
    try {
      const context = await browser.newContext({ hasTouch: engine === 'webkit' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ forceFallback }) => {
        globalThis.nativeBlob = Blob;
        globalThis.nativeWithResolvers = Promise.withResolvers;
        globalThis.nativeMapInsert = Map.prototype.getOrInsert;
        if (forceFallback) {
          delete Map.prototype.getOrInsert;
          delete Map.prototype.getOrInsertComputed;
          delete Promise.withResolvers;
          Object.defineProperty(navigator, 'standalone', { value: true });
        }
      }, { forceFallback: engine === 'webkit' });
      await page.goto(url);
      const state = await page.evaluate(() => ({
        blobPreserved: Blob === nativeBlob,
        promisePreserved: !nativeWithResolvers || Promise.withResolvers === nativeWithResolvers,
        mapPreserved: !nativeMapInsert || Map.prototype.getOrInsert === nativeMapInsert,
        viewport: document.querySelector('meta[name="viewport"]').content,
        manifest: document.querySelector('link[rel="manifest"]').getAttribute('href'),
      }));
      assert.equal(state.blobPreserved, engine !== 'webkit');
      assert.equal(state.manifest, '/manifest.webmanifest');
      if (engine === 'chromium') {
        assert.ok(state.promisePreserved && state.mapPreserved);
        assert.equal(state.viewport, 'width=device-width, initial-scale=1');
      } else assert.match(state.viewport, /user-scalable=no/);
      assert.equal(await page.evaluate(async source => {
        const blob = new Blob([source, '\nself.postMessage({type:"ready",value:new Map().getOrInsertComputed("test", () => 42)});\n'], { type: 'text/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl, { type: 'module', name: 'dsh-pdf' });
        try {
          return await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(Error('PDF worker timeout')), 15000);
            worker.onmessage = event => { if (event.data.type === 'ready') { clearTimeout(timeout); resolve(event.data.value); } };
            worker.onerror = event => { clearTimeout(timeout); reject(Error(event.message)); };
          });
        } finally { worker.terminate(); URL.revokeObjectURL(workerUrl); }
      }, pdfSource), 42);
      if (engine === 'webkit') {
        await page.locator('#composer').tap();
        await page.keyboard.type(' ready');
        assert.match(await page.locator('#composer').textContent(), /ready/);
        assert.deepEqual(await page.evaluate(() => {
          const panel = document.querySelector('#panel');
          panel.scrollTop = 0;
          const down = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 50 });
          panel.dispatchEvent(down);
          panel.scrollTop = 0;
          const up = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -50 });
          panel.dispatchEvent(up);
          return { down: down.defaultPrevented, up: up.defaultPrevented };
        }), { down: false, up: true });
      }
      await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready);
      assert.deepEqual(errors, []);
      console.log(`${engine}: native API/viewport checks, installed PDF worker, PWA registration${engine === 'webkit' ? ', standalone typing and scroll guards' : ''} passed`);
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
