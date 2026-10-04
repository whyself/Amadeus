// Real DSH regression with generated credentials and an isolated data home.
// No model calls, existing workspaces or production containers are used.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const root = process.cwd();
const output = path.join(root, 'test-results');
await mkdir(output, { recursive: true });
const directory = await mkdtemp(path.join(output, 'native-files-'));
const workspace = path.join(directory, 'workspace');
await mkdir(path.join(workspace, 'docs'), { recursive: true });
await writeFile(path.join(workspace, 'audit.md'), '# Audit\n\nSelection evidence.\n');
await writeFile(path.join(workspace, 'file10.txt'), 'ten');
await writeFile(path.join(workspace, 'file2.txt'), 'two');
await writeFile(path.join(workspace, 'docs', 'nested.txt'), 'nested');
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const username = 'test', password = randomBytes(24).toString('hex');
const config = path.join(directory, 'config.json');
await writeFile(config, JSON.stringify({ username, password, host: '127.0.0.1', port, home: path.join(directory, 'home'), workspace, playwrightMcp: { enabled: false } }));
const child = spawn(process.execPath, ['scripts/start.mjs'], { cwd: root, env: { ...process.env, AMADEUS_CONFIG: config }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '', browser, page;
child.stdout.on('data', chunk => { log += chunk; });
child.stderr.on('data', chunk => { log += chunk; });
const errors = [], uploadConflicts = [];
try {
  await expect.poll(async () => {
    if (child.exitCode !== null) throw new Error(`DSH startup exited ${child.exitCode}: ${log}`);
    try { return (await fetch(origin, { signal: AbortSignal.timeout(1000) })).status; } catch { return 0; }
  }, { timeout: 120000 }).toBe(401);
  browser = await chromium.launch({ channel: process.env.TEST_BROWSER_CHANNEL || 'msedge', headless: true });
  const context = await browser.newContext({ locale: 'zh-CN', httpCredentials: { username, password }, acceptDownloads: true, viewport: { width: 1400, height: 1000 } });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() === 409 && new URL(response.url()).pathname === '/amadeus/files/upload') uploadConflicts.push(response.url()); });
  await page.goto(origin);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '稍后配置', exact: true }).click();
  const input = page.locator('[data-composer-input]').first();
  await input.click();
  const cdp = await context.newCDPSession(page);
  for (const text of ['n', 'ni', 'nihao']) {
    await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
    assert.equal(await page.evaluate(() => window.getSelection().toString()), '', 'IME caret stays collapsed');
  }
  await cdp.send('Input.insertText', { text: '你好' });
  await expect(input).toHaveText('你好');
  await input.press('Control+a'); await input.press('Backspace');
  console.log('PASS: Lexical IME composition and Chinese commit with the retained seed fix');
  await input.click(); await input.pressSequentially('kept draft');
  await expect(input).toHaveText('kept draft');
  console.log('PASS: native queue renders without the obsolete state.queue wrapper');
  await page.getByRole('button', { name: '打开右侧边栏', exact: true }).click();
  await page.getByRole('button', { name: '工作区文件' }).click();
  const tree = page.locator('[data-files-state="tree"]');
  await expect.poll(async () => (await tree.getAttribute('data-files-root'))?.replaceAll('\\', '/')).toBe(workspace.replaceAll('\\', '/'));
  await expect(page.locator('.amadeus-tree')).toHaveCount(0);
  await expect(tree.locator('[data-files-entry]')).toHaveCount(4);
  const names = await tree.locator('[data-files-entry] > button').allTextContents();
  assert.deepEqual(names, ['docs', 'audit.md', 'file2.txt', 'file10.txt']);
  await expect(page.getByRole('button', { name: '上传到 项目根目录', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: '在编辑器中打开 audit.md', exact: true })).toHaveCount(1);
  console.log('PASS: upstream tree, native natural ordering and one set of Amadeus actions');

  async function uploadTo(target, name, contents) {
    await page.getByRole('button', { name: `上传到 ${target || '项目根目录'}`, exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '上传文件', exact: true }).click();
    await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(contents) });
  }
  await uploadTo('', 'uploaded.txt', 'uploaded root');
  await expect.poll(() => readFile(path.join(workspace, 'uploaded.txt'), 'utf8').catch(()=>null)).toBe('uploaded root');
  await expect(tree.getByRole('button', { name: 'uploaded.txt', exact: true })).toBeVisible();
  await tree.getByRole('button', { name: 'docs', exact: true }).click();
  await uploadTo('docs', 'new.txt', 'nested upload');
  await expect.poll(() => readFile(path.join(workspace, 'docs/new.txt'), 'utf8').catch(()=>null)).toBe('nested upload');
  await expect(tree.getByRole('button', { name: 'new.txt', exact: true })).toBeVisible();
  await uploadTo('', 'uploaded.txt', 'replacement');
  await page.getByRole('button', { name: '替换', exact: true }).click();
  await expect.poll(() => readFile(path.join(workspace, 'uploaded.txt'), 'utf8')).toBe('replacement');
  await writeFile(path.join(workspace, 'docs', 'external.txt'), 'external write');
  await expect(tree.getByRole('button', { name: 'external.txt', exact: true })).toBeVisible({ timeout: 15000 });
  console.log('PASS: root/nested uploads, version-confirmed replacement and native directory watch');

  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载 项目', exact: true }).click();
  const download = await downloading;
  await download.saveAs(path.join(directory, 'workspace.zip'));
  const zip = await readFile(path.join(directory, 'workspace.zip'));
  assert.equal(zip.subarray(0, 2).toString(), 'PK');
  assert.ok(zip.includes(Buffer.from('docs/new.txt')));
  await page.getByRole('button', { name: '删除 uploaded.txt', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await readFile(path.join(workspace, 'uploaded.txt'), 'utf8'), 'replacement');
  await page.getByRole('button', { name: '删除 uploaded.txt', exact: true }).click();
  await page.locator('.amadeus-confirm-delete').click();
  await expect(tree.getByRole('button', { name: 'uploaded.txt', exact: true })).toHaveCount(0);
  await assert.rejects(readFile(path.join(workspace, 'uploaded.txt')), { code: 'ENOENT' });
  console.log('PASS: ZIP download, canceled deletion and confirmed deletion refresh the upstream tree');

  if (process.platform !== 'win32') {
    await mkdir(path.join(workspace, 'a'));
    await writeFile(path.join(workspace, 'a/b.txt'), 'nested survivor');
    await writeFile(path.join(workspace, 'a\\b.txt'), 'literal backslash');
    await page.getByRole('button', { name: '删除 a\\b.txt', exact: true }).click();
    await page.locator('.amadeus-confirm-delete').click();
    await expect(tree.getByRole('button', { name: 'a\\b.txt', exact: true })).toHaveCount(0);
    await assert.rejects(readFile(path.join(workspace, 'a\\b.txt')), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(workspace, 'a/b.txt'), 'utf8'), 'nested survivor');
    console.log('PASS: POSIX literal backslash deletion does not alias a nested file');
  }

  await tree.getByRole('button', { name: 'audit.md', exact: true }).click();
  const body = page.locator('[data-amadeus-path="audit.md"]').first();
  await body.getByText('Selection evidence.', { exact: true }).waitFor();
  await body.evaluate(host => {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent.includes('Selection evidence.')) continue;
      const range = document.createRange(); range.selectNodeContents(walker.currentNode);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); return;
    }
    throw new Error('selection target not found');
  });
  await page.locator('.amadeus-selection-trigger').click();
  await page.getByRole('textbox', { name: '针对选中文本的问题' }).fill('保持出处');
  await page.getByRole('button', { name: '添加注释', exact: true }).click();
  await expect(page.locator('.amadeus-summary-chip').first()).toContainText('1');
  const notes = await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('amadeus.annotations.')).flatMap(key => JSON.parse(sessionStorage.getItem(key))));
  assert.equal(notes[0].source.path, 'audit.md'); assert.equal(notes[0].source.heading, 'Audit');
  await page.screenshot({ path: path.join(directory, 'native-files.png') });
  assert.equal(uploadConflicts.length, 1, 'the replacement dialog follows one expected upload conflict');
  const expectedResourceError = 'Failed to load resource: the server responded with a status of 409 (Conflict)';
  assert.ok(errors.filter(error => error === expectedResourceError).length <= uploadConflicts.length);
  assert.deepEqual(errors.filter(error => error !== expectedResourceError), []);
  console.log('PASS: native Markdown preview, selection comment and fork source heading survive DSH 0.2');
} finally {
  if (errors.length) await writeFile(path.join(directory, 'browser-errors.json'), JSON.stringify(errors, null, 2));
  await page?.screenshot({ path: path.join(directory, 'final.png') }).catch(()=>{});
  await browser?.close();
  if (child.exitCode === null) {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      await new Promise(resolve => killer.once('exit', resolve));
    } else {
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    }
  }
  await writeFile(path.join(directory, 'startup.log'), log);
  console.log(`Evidence: ${directory}`);
}
