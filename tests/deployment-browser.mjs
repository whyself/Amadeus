// Full container smoke: DSH, native document viewer, TeX, code-server and PWA.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, chmod, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const image = process.env.AMADEUS_TEST_IMAGE;
if (!image) throw new Error('Set AMADEUS_TEST_IMAGE to a built image.');
const root = process.cwd(), output = path.join(root, 'test-results');
await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(output, 'deployment-'));
const workspace = path.join(directory, 'workspace');
await mkdir(workspace); await chmod(workspace, 0o777);
await writeFile(path.join(workspace, 'paper.tex'), '\\documentclass{article}\n\\begin{document}\nNative selection sample.\\end{document}\n');
await writeFile(path.join(workspace, 'notes.md'), '# Notes\n\nDocker native preview.\n');
await copyFile(path.join(root, 'tests/fixtures/lecture.docx'), path.join(workspace, 'lecture.docx'));
const username = 'smoke', password = randomBytes(24).toString('hex');
const config = path.join(directory, 'config.json');
await writeFile(config, JSON.stringify({ username, password, host: '0.0.0.0', port: 3080, home: '/data/dsh-home', workspace: '/workspace', editor: { upstream: 'http://127.0.0.1:8080', bridgeDir: '/data/editor/bridge' }, playwrightMcp: { enabled: false } }));
await chmod(config, 0o644);
const name = `amadeus-deployment-${process.pid}`;
function docker(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`docker ${args[0]} failed: ${stderr}`)));
  });
}
let started = false, browser, page;
const errors = [], consoleErrors = [];
let openingEditor = false;
try {
  await docker(['run', '-d', '--name', name, '-p', '127.0.0.1::3080', '--mount', `type=bind,source=${config},target=/config/amadeus.yml,readonly`, '--mount', `type=bind,source=${workspace},target=/workspace`, image]);
  started = true;
  const port = (await docker(['port', name, '3080/tcp'])).split(':').at(-1);
  const origin = `http://127.0.0.1:${port}`;
  await expect.poll(async () => { try { return (await fetch(origin, { signal: AbortSignal.timeout(1000) })).status; } catch { return 0; } }, { timeout: 120000 }).toBe(401);
  const headers = { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` };
  assert.equal((await fetch(origin, { headers })).status, 200);
  assert.equal((await fetch(origin + '/amadeus/ping')).status, 401);
  const manifest = await fetch(origin + '/manifest.webmanifest'); assert.equal(manifest.status, 200);
  assert.equal((await manifest.json()).short_name, 'Amadeus');
  await docker(['exec', name, 'xelatex', '-interaction=nonstopmode', '-halt-on-error', '-output-directory=/workspace', '/workspace/paper.tex']);
  console.log('PASS: container authentication, public PWA manifest and actual XeLaTeX compilation');
  browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || 'msedge' });
  const context = await browser.newContext({ locale: 'zh-CN', httpCredentials: { username, password }, viewport: { width: 1500, height: 1000 } });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location().url, openingEditor }); });
  await page.goto(origin);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '稍后配置', exact: true }).click();
  const input = page.locator('[data-composer-input]').first();
  await input.click();
  const cdp = await context.newCDPSession(page);
  for (const text of ['n', 'ni', 'nihao']) {
    await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
    assert.equal(await page.evaluate(() => window.getSelection().toString()), '');
  }
  await cdp.send('Input.insertText', { text: '你好' }); await expect(input).toHaveText('你好');
  await input.press('Control+a'); await input.press('Backspace');
  console.log('PASS: actual Chromium Chinese composition and commit on DSH 0.2');
  await page.getByRole('button', { name: '打开右侧边栏', exact: true }).click();
  await page.getByRole('button', { name: '工作区文件' }).click();
  const tree = page.locator('[data-files-state="tree"]');
  await tree.getByRole('button', { name: 'paper.pdf', exact: true }).click();
  const textLayer = page.locator('[data-pdf-page="1"] [data-pdf-text] .textLayer').first();
  await textLayer.locator('span').first().waitFor();
  const canvas = page.locator('[data-pdf-page="1"] canvas');
  const controls = page.locator('[data-document-zoom-controls]');
  const zoomFrame = await page.locator('[data-document-zoom-frame]').boundingBox();
  await page.mouse.move(zoomFrame.x + zoomFrame.width / 2, zoomFrame.y + zoomFrame.height - 22);
  await expect(controls).toHaveAttribute('data-document-zoom-visible', 'true');
  await controls.hover();
  const initialWidth = (await canvas.boundingBox()).width;
  await controls.getByRole('button', { name: '放大', exact: true }).click();
  await expect.poll(async () => (await canvas.boundingBox()).width).toBeGreaterThan(initialWidth);
  const selectionColors = () => textLayer.evaluate(element => {
    const probe = document.createElement('span'); probe.style.backgroundColor = 'var(--dsw-alias-bg-document-selection)';
    element.append(probe);
    const expected = getComputedStyle(probe).backgroundColor; probe.remove();
    return { actual: getComputedStyle(element.querySelector('span'), '::selection').backgroundColor, expected };
  });
  const light = await selectionColors(); assert.equal(light.actual, light.expected);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => page.locator('body').evaluate(body => body.hasAttribute('data-ds-dark-theme'))).toBe(true);
  const dark = await selectionColors(); assert.equal(dark.actual, dark.expected);
  await page.screenshot({ path: path.join(directory, 'native-pdf-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  console.log('PASS: native PDF text layer, zoom and upstream theme selection colors');
  await page.getByRole('tab', { name: /文件/ }).first().click();
  await tree.getByRole('button', { name: 'lecture.docx', exact: true }).click();
  await page.locator('[data-pdf-page="1"] [data-pdf-text] .textLayer span').first().waitFor({ timeout: 60000 });
  console.log('PASS: actual LibreOffice document conversion and native text layer');
  await page.getByRole('tab', { name: /文件/ }).first().click();
  openingEditor = true;
  await page.getByRole('button', { name: '在编辑器中打开 notes.md', exact: true }).click();
  const frame = page.frameLocator('iframe.amadeus-code-frame');
  await frame.locator('.monaco-workbench').waitFor({ timeout: 90000 });
  await expect(frame.locator('.tab.active')).toContainText('notes.md');
  await expect.poll(async () => (await frame.locator('.view-lines').allTextContents()).join('\n')).toContain('Docker native preview.');
  await page.screenshot({ path: path.join(directory, 'code-server.png') });
  assert.deepEqual(errors, []);
  const unexpected = consoleErrors.filter(error => {
    if (!error.openingEditor || !/^Failed to load resource:/.test(error.text)) return true;
    const pathname = new URL(error.url, origin).pathname;
    // Bridge polling starts before VS Code has an active document. Its 503
    // (connecting), 409 (no active editor) and optional code-server 404 resources
    // are startup states; the assertions above require the document to open.
    return !((pathname.startsWith('/amadeus/editor/') && /status of (503|409)/.test(error.text))
      || (pathname.startsWith('/amadeus/code/') && /status of 404/.test(error.text) && !/\.(js|css)(?:$|\?)/.test(pathname)));
  });
  assert.deepEqual(unexpected, []);
  console.log('PASS: actual DSH-to-code-server bridge opens the selected file without console errors');
} finally {
  await page?.screenshot({ path: path.join(directory, 'final.png') }).catch(()=>{});
  if (errors.length || consoleErrors.length) await writeFile(path.join(directory, 'browser-errors.json'), JSON.stringify({ errors, consoleErrors }, null, 2));
  await browser?.close();
  if (started) {
    await writeFile(path.join(directory, 'container.log'), await docker(['logs', name]));
    await docker(['rm', '-f', name]);
  }
  console.log(`Evidence: ${directory}`);
}
