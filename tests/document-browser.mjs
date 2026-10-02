// Opt-in live regression: node tests/document-browser.mjs CONFIG_PATH PDF_RELATIVE_PATH
// Uses a fresh browser context, never submits a prompt or changes document content.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import yaml from 'js-yaml';

const config = yaml.load(await readFile(process.argv[2], 'utf8'));
const port = Number(process.env.TEST_PORT || config.port || 3080);
const browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage({ locale: 'zh-CN', httpCredentials: { username: config.username, password: config.password }, viewport: { width: 1400, height: 1000 } });
  await page.goto(`http://127.0.0.1:${port}`);
  const input = page.locator('[contenteditable=true]');
  await input.click();
  const cdp = await page.context().newCDPSession(page);
  const compose = async text => {
    await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => window.getSelection().toString()), '', 'IME caret must stay collapsed');
  };
  for (const text of ['n', 'ni', 'nih', 'nihao']) await compose(text);
  await cdp.send('Input.insertText', { text: '你好' });
  assert.equal(await input.innerText(), '你好');
  await input.press('Control+a');
  await compose('z'); await compose('zhong');
  await cdp.send('Input.insertText', { text: '中' });
  assert.equal(await input.innerText(), '中', 'composition replaces the selected draft');
  await input.press('Control+a'); await input.press('Backspace');
  await compose('q');
  await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
  assert.equal((await input.innerText()).trim(), '', 'cancelled composition leaves no seed');
  await input.pressSequentially('abc');
  assert.equal(await input.innerText(), 'abc');
  await input.press('Control+a'); await input.press('Backspace');
  console.log('PASS: IME first character, continuous composition, Chinese commit, replacement, cancellation, ASCII');

  await page.getByRole('button', { name: '打开右侧边栏', exact: true }).click();
  await page.getByRole('button', { name: '工作区文件' }).click();
  for (const name of process.argv[3].split('/')) await page.getByRole('button', { name, exact: true }).click();
  const controls = page.locator('[data-document-zoom-controls]');
  await controls.waitFor();
  const zoomFrame = await page.locator('[data-document-zoom-frame]').boundingBox();
  await page.mouse.move(zoomFrame.x + zoomFrame.width / 2, zoomFrame.y + zoomFrame.height - 22);
  await controls.locator('[aria-label="放大"]').waitFor();
  await controls.hover();
  const frame = page.locator('[data-document-zoom-frame]');
  await page.locator('[data-pdf-page="1"] [data-pdf-text] .textLayer span').first().waitFor();
  const canvas = page.locator('[data-pdf-page="1"] canvas');
  const initial = (await canvas.boundingBox()).width;
  await controls.getByRole('button', { name: '放大', exact: true }).click();
  await page.waitForTimeout(100);
  assert.ok((await canvas.boundingBox()).width > initial, 'native zoom-in enlarges the PDF');
  assert.equal(await frame.getAttribute('data-document-zoom-mode'), 'fixed');
  const alignment = await page.locator('[data-pdf-page="1"]').evaluate(node => {
    const canvas = node.querySelector('canvas').getBoundingClientRect();
    const text = node.querySelector('.textLayer').getBoundingClientRect();
    return Math.abs(canvas.width - text.width);
  });
  assert.ok(alignment < 2, `native zoomed text layer must align with canvas: ${alignment}`);
  const menu = controls.getByRole('button', { name: '选择缩放比例', exact: true });
  await menu.click();
  const fit = page.locator('[role="menuitem"]').filter({ hasText: '适应宽度' }).last();
  await fit.click();
  await page.waitForTimeout(100);
  assert.equal(await frame.getAttribute('data-document-zoom-mode'), 'fit-width');
  console.log('PASS: native PDF zoom and fit-width controls work without Amadeus PDF overlays');
} finally { await browser.close(); }
