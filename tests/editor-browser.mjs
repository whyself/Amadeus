// Opt-in browser component regression: node tests/editor-browser.mjs
// Uses a fake editor iframe/API; does not verify code-server or Docker deployment.
import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium, webkit, expect } from '@playwright/test';

const result = await build({
  stdin: {
    contents: `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {EditorTab, apply} from './packages/editor/src/client.jsx';
import {attachWorkbench, retainWorkbench, disposeWorkbenches} from './packages/editor/src/frame-cache.mjs';
let closeHandler;
window.testClosed = 0;
window.testAnnotations = [];
window.addEventListener('amadeus:editor-selection', event => { event.detail.handled = true; window.testAnnotations.push(event.detail); });
window.testClose = () => {
  try { closeHandler('s1', {id: window.testTabId}); }
  catch (error) { if (error.name !== 'AmadeusEditorClosePending') throw error; }
};
apply({
  effect: callback => callback(),
  sidebarRightTabs: {register() {}},
  locale: {register: () => () => {}, getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {}},
  slots: {inject: (_name, callback) => callback(), register() {}},
  sidebarRight: {
    openResource() {}, openResourceIn() {},
    registerCloseHandler: (_kind, callback) => { closeHandler = callback; },
    closeIn: (session, id) => { closeHandler(session, {id}); window.testClosed++; },
  },
});
function Harness() {
  const [mounted, setMounted] = useState(true), [visible, setVisible] = useState(true);
  const [tabId, setTabId] = useState('editor-tab');
  window.testTabId = tabId;
  const [controller, setController] = useState(() => new AbortController());
  window.testMount = setMounted; window.testVisible = setVisible; window.testAbort = () => controller.abort();
  window.testEndTab = () => { controller.abort(); setMounted(false); };
  window.testNewTab = id => { setTabId(id); setController(new AbortController()); setMounted(true); };
  const [navigation, setNavigation] = useState({ revision: 0, params: new URLSearchParams(location.search).has('initial') ? {address: 'dsh-resource://file/session/s1/a.md'} : undefined });
  window.testNavigate = name => setNavigation(previous => ({revision: previous.revision + 1, params: {address: 'dsh-resource://file/session/s1/' + name}}));
  return mounted ? <EditorTab key={tabId} sessionId="s1" useTabInfo={() => ({tab: {id: tabId, navigation, visible, signal: controller.signal}})} /> : null;
}
window.testRetainMany = () => {
  for (let i = 0; i < 5; i++) {
    const placeholder = document.createElement('div'); document.body.append(placeholder);
    const signal = new AbortController();
    const release = attachWorkbench({key: 'cache-' + i, identity: 'cache-' + i, instance: 'cache-' + i, url: '/amadeus/code/?cache=' + i, placeholder, signal: signal.signal, visible: false});
    retainWorkbench('cache-' + i); release(); signal.abort(); placeholder.remove();
  }
};
window.testDisposeAll = () => disposeWorkbenches();
createRoot(document.getElementById('root')).render(<Harness/>);`,
    resolveDir: process.cwd(), loader: 'jsx', sourcefile: 'editor-browser-harness.jsx',
  }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'text' }, define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'stub-dsh-appearance-icons', setup(build) {
    build.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'appearance-icons', namespace: 'browser-test' }));
    build.onLoad({ filter: /.*/, namespace: 'browser-test' }, () => ({ contents: 'export const IconLightOutline16 = () => null; export const IconDarkOutline16 = () => null; export const IconFollowsystemOutline16 = () => null;', loader: 'js' }));
  } }],
});
const requests = [], loads = [];
let dirty = false, fontSize = 16, selectionText = 'Selected passage';
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const json = body => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)); };
  if (url.pathname === '/bundle.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end(result.outputFiles[0].contents); return; }
  if (url.pathname === '/amadeus/editor/workspace') {
    requests.push({ type: 'workspace', instance: url.searchParams.get('instance') });
    json({ url: `/amadeus/code/?${url.searchParams}` }); return;
  }
  if (url.pathname === '/amadeus/editor/events') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    response.write('data: {"type":"snapshot","documents":[]}\n\n');
    return;
  }
  if (url.pathname === '/amadeus/editor/command') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const command = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ type: 'command', instance: url.searchParams.get('instance'), ...command });
    if (command.action === 'open' && command.path === 'deleted.tex') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'File or directory not found' })); return;
    }
    if (command.action === 'fontSize') { if (command.size !== undefined) fontSize = command.size; json({ size: fontSize }); return; }
    json(command.action === 'status' ? { dirty } : command.action === 'selection' ? {text: selectionText, path: 'b.tex', lineStart: 1, lineEnd: 1} : { opened: true }); return;
  }
  if (url.pathname === '/amadeus/code/') {
    loads.push(url.searchParams.get('instance'));
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    response.end('<!doctype html><title>Fake editor fixture</title><p>Fake code-server frame</p>'); return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
  response.end('<!doctype html><html><head><style>html,body,#root{height:100%;margin:0}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = process.env.TEST_BROWSER_ENGINE === 'webkit'
    ? await webkit.launch({ headless: true })
    : await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || 'msedge' });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/?initial`);
  await expect(page.getByRole('button', { name: /添加到对话/ })).toBeEnabled();
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect.poll(() => loads.length).toBe(1);
  await expect.poll(() => requests.some(entry => entry.action === 'open' && entry.path === 'a.md')).toBe(true);
  const initialSource = await page.locator('iframe').getAttribute('src');
  const instance = new URL(initialSource, base).searchParams.get('instance');
  const browserId = await page.evaluate(() => sessionStorage.getItem('amadeus.editor.browser'));
  await page.locator('iframe').evaluate(element => { element.dataset.original = 'true'; });
  await page.evaluate(() => window.testNavigate('b.tex'));
  await expect.poll(() => requests.filter(entry => entry.action === 'open').at(-1)?.path).toBe('b.tex');
  await expect(page.getByRole('button', { name: /添加到对话/ })).toBeEnabled();
  assert.equal(await page.locator('iframe').getAttribute('src'), initialSource);
  assert.equal(await page.locator('iframe').getAttribute('data-original'), 'true');
  assert.equal(loads.length, 1, 'file switch must not reload the iframe');
  console.log('PASS: actual EditorTab switches files without remounting or reloading the fake iframe');

  await expect(page.locator('iframe')).toBeVisible();
  await page.locator('iframe').contentFrame().locator('body').click();
  await page.keyboard.press('Control+Equal');
  await expect.poll(() => fontSize).toBe(17);
  await page.keyboard.press('Control+0');
  await expect.poll(() => fontSize).toBe(16);
  assert.equal(await page.locator('iframe').evaluate(frame => frame.contentDocument.documentElement.style.zoom), '', 'keyboard shortcut changes code font only');
  await page.evaluate(() => window.testMount(false));
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(page.locator('iframe')).toBeHidden();
  assert.equal(await page.locator('iframe').evaluate(frame => frame.parentElement === document.body), true);
  await page.evaluate(() => window.testMount(true));
  await expect(page.locator('iframe')).toBeVisible();
  await expect(page.getByRole('button', { name: /添加到对话/ })).toBeEnabled();
  const capsule = page.locator('.amadeus-code-selection-pill');
  const capsuleBox = await capsule.boundingBox();
  assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('amadeus-code-selection-pill'), { x: capsuleBox.x + capsuleBox.width / 2, y: capsuleBox.y + capsuleBox.height / 2 }), true);
  assert.equal(await page.locator('iframe').getAttribute('data-original'), 'true');
  assert.equal(await page.locator('iframe').getAttribute('src'), initialSource);
  assert.equal(loads.length, 1, 'inactive body unmount/remount must keep existing browsing context');
  await page.evaluate(() => window.testVisible(false));
  await expect(page.locator('iframe')).toBeHidden();
  await page.evaluate(() => window.testVisible(true));
  await expect(page.locator('iframe')).toBeVisible();
  const bounds = await page.locator('iframe').boundingBox();
  assert.ok(bounds.width > 0 && bounds.height > 0 && bounds.y >= 0);
  console.log('PASS: inactive body unmount/remount and visibility changes retain attached iframe without reloading');
  await page.locator('#root').evaluate(root => root.setAttribute('data-sidebar-right-float-host', ''));
  await expect(page.locator('iframe')).toHaveCSS('z-index', '60');
  const beforeDrag = await page.locator('iframe').boundingBox();
  await page.locator('#root').evaluate(root => { root.style.transform = 'translate(31px, 47px)'; });
  await expect.poll(async () => {
    const box = await page.locator('iframe').boundingBox();
    return Math.abs(box.x - beforeDrag.x - 31) + Math.abs(box.y - beforeDrag.y - 47);
  }).toBeLessThan(1);
  const afterDrag = await page.locator('iframe').boundingBox();
  assert.equal(afterDrag.width, beforeDrag.width);
  assert.equal(afterDrag.height, beforeDrag.height);
  await page.locator('#root').evaluate(root => {
    root.removeAttribute('data-sidebar-right-float-host');
    root.setAttribute('data-sidebar-right-panel', 'fullscreen');
    root.style.transform = '';
  });
  await expect(page.locator('iframe')).toHaveCSS('z-index', '40');
  await page.locator('#root').evaluate(root => root.removeAttribute('data-sidebar-right-panel'));
  await expect(page.locator('iframe')).toHaveCSS('z-index', '10');
  assert.equal(loads.length, 1);
  console.log('PASS: float dragging tracks unchanged-size ancestor transforms and float/fullscreen layers update');

  await page.evaluate(() => history.replaceState(null, '', '/'));
  const beforeReload = requests.length;
  await page.reload();
  await expect(page.getByRole('button', { name: /添加到对话/ })).toBeEnabled();
  await expect.poll(() => loads.length).toBe(2);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('amadeus.editor.browser')), browserId);
  assert.equal(await page.locator('iframe').getAttribute('src'), initialSource);
  assert.equal(requests.slice(beforeReload).some(entry => entry.action === 'open' && entry.instance === instance), false);
  console.log('PASS: reload leaves file restoration to code-server');

  const seed = await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));
  const duplicate = await context.newPage();
  duplicate.on('pageerror', error => errors.push(error.message));
  await duplicate.addInitScript(values => { if (window.top === window) for (const [key, value] of Object.entries(values)) sessionStorage.setItem(key, value); }, seed);
  await duplicate.goto(base);
  await expect(duplicate.getByRole('button', { name: /添加到对话/ })).toBeEnabled();
  const duplicateId = await duplicate.evaluate(() => sessionStorage.getItem('amadeus.editor.browser'));
  assert.notEqual(duplicateId, browserId, 'concurrent duplicated storage must acquire a new Web Lock identity');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('amadeus.editor.browser')), browserId);
  assert.notEqual(await duplicate.locator('iframe').getAttribute('src'), initialSource);
  assert.equal(requests.some(entry => entry.action === 'open' && entry.instance === `editor-tab-${duplicateId}`), false);
  console.log('PASS: concurrent duplicated tab gets an independent bridge identity through browser Web Locks');

  await page.evaluate(() => window.testNavigate('deleted.tex'));
  await expect(page.getByRole('alert')).toContainText('File or directory not found');
  await expect(page.getByRole('button', { name: /添加到对话/ })).toBeEnabled();
  await page.getByRole('button', { name: /添加到对话/ }).hover();
  selectionText = '';
  await page.waitForTimeout(550);
  await expect(page.getByRole('button', { name: /添加到对话/ })).toBeVisible();
  await page.getByRole('button', { name: /添加到对话/ }).click();
  await expect.poll(() => page.evaluate(() => window.testAnnotations.length)).toBe(1);
  assert.equal(await page.evaluate(() => window.testAnnotations[0].text), 'Selected passage');
  await page.waitForTimeout(550);
  await expect(page.locator('.amadeus-code-selection-pill')).toHaveCount(0);
  selectionText = 'Selected passage';
  await page.reload();
  await expect(page.getByRole('button', { name: /添加到对话/ })).toBeEnabled();
  await page.getByRole('button', { name: /添加到对话/ }).click();
  await expect.poll(() => page.evaluate(() => window.testAnnotations.length)).toBe(1);
  assert.deepEqual(errors, []);
  console.log('PASS: missing file error, preserves working DSH selection');

  await page.evaluate(() => window.testNavigate('deleted.tex'));
  await expect(page.getByRole('alert')).toContainText('File or directory not found');
  const beforeRetryLoads = loads.length;
  await page.getByRole('button', { name: '重试连接', exact: true }).click();
  await expect.poll(() => loads.length).toBe(beforeRetryLoads + 1);
  await expect(page.getByRole('button', { name: /添加到对话/ })).toBeEnabled();

  let dialogCount = 0;
  let acceptClose = false;
  page.on('dialog', async dialog => { dialogCount++; if (acceptClose) await dialog.accept(); else await dialog.dismiss(); });
  await page.evaluate(() => window.testClose());
  await expect.poll(() => page.evaluate(() => window.testClosed)).toBe(1);
  assert.equal(dialogCount, 0, 'clean documents close without confirmation even after retry recreated iframe');
  const cleanSource = await page.locator('iframe').getAttribute('src');
  const beforeReopenLoads = loads.length;
  await page.locator('iframe').evaluate(element => { element.dataset.retained = 'yes'; });
  await page.evaluate(() => window.testEndTab());
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(page.locator('iframe')).toBeHidden();
  await page.evaluate(() => window.testNewTab('reopened-editor-tab'));
  await expect(page.getByRole('button', { name: /添加到对话/ })).toBeEnabled();
  await expect(page.locator('iframe')).toBeVisible();
  assert.equal(await page.locator('iframe').getAttribute('src'), cleanSource);
  assert.equal(await page.locator('iframe').getAttribute('data-retained'), 'yes');
  assert.equal(loads.length, beforeReopenLoads, 'a new tab reuses the closed clean workbench and its bridge');
  console.log('PASS: closing then reopening a clean editor in the same session retains its workbench');
  dirty = true;
  await page.evaluate(() => window.testClose());
  await expect.poll(() => dialogCount).toBe(1);
  // A round-trip through the page drains the close callback after dismissing.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
  assert.equal(await page.evaluate(() => window.testClosed), 1, 'cancel preserves editor');
  acceptClose = true;
  await page.evaluate(() => window.testClose());
  await expect.poll(() => page.evaluate(() => window.testClosed)).toBe(2);
  assert.equal(dialogCount, 2, 'accepted close bypasses recursive status/confirmation guard');
  assert.deepEqual(errors, []);
  console.log('PASS: authoritative clean status closes silently; dirty cancel preserves editor and acceptance bypasses recursive guard');
  await page.evaluate(() => window.testAbort());
  await expect(page.locator('iframe')).toHaveCount(0);
  console.log('PASS: confirmed dirty close disposes the workbench and cancel preserves it');
  await page.evaluate(() => window.testRetainMany());
  await expect(page.locator('iframe')).toHaveCount(3);
  await page.evaluate(() => window.testDisposeAll());
  await expect(page.locator('iframe')).toHaveCount(0);
  console.log('PASS: retained clean frames are bounded and plugin disposal releases every workbench');
} finally {
  await browser?.close();
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
