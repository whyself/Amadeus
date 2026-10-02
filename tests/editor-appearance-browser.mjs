// Check installed DSH export names before using icon DOM stand-ins. Unchecked
// stubs previously hid exports that upstream had removed.
import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nativeSource = await readFile(require.resolve('@deepseek-ai/dsh-client-ui-primitives'), 'utf8');
const exportNames = new Set([...nativeSource.matchAll(/export \{([^}]+)\};?/gs)].flatMap(match=>match[1].split(',').map(name=>name.trim().split(/\s+as\s+/).at(-1))));
const nativeIcons = ['IconLightOutlineMedium','IconDarkOutlineMedium','IconFollowsystemOutlineMedium'];
for (const name of nativeIcons) assert.ok(exportNames.has(name), `Missing DSH icon export: ${name}`);

const bundle = await build({ stdin: {
  contents: `import React from 'react';
import {createRoot} from 'react-dom/client';
import {installEditorAppearance,resolvedEditorAppearance} from './packages/editor/src/appearance.jsx';
let component, dictionary;
window.themeEvents=0;
window.addEventListener('amadeus:editor-appearance',()=>window.themeEvents++);
window.resolvedEditorAppearance=resolvedEditorAppearance;
installEditorAppearance({locale:{register:(_namespace,dict)=>{dictionary=dict.zh;return ()=>{};}},slots:{inject:(_name,fn)=>fn(),register:(options,Component)=>{window.registeredAppearanceSlot=options.name;component=Component;return ()=>{};}}});
createRoot(document.getElementById('root')).render(React.createElement(component,{t:key=>dictionary[key]}));`,
  resolveDir: process.cwd(), sourcefile: 'editor-appearance-regression.jsx', loader: 'jsx',
}, bundle: true, write: false, platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name:'checked-dsh-icons', setup(build) {
  build.onResolve({filter:/^@deepseek-ai\/dsh-client-ui-primitives$/},()=>({path:'icons',namespace:'checked-icons'}));
  build.onLoad({filter:/.*/,namespace:'checked-icons'},()=>({contents:"import React from 'react';\n"+nativeIcons.map(name=>`export const ${name}=()=>React.createElement('svg');`).join('\n'),loader:'js',resolveDir:process.cwd()}));
} }] });
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/bundle.js' ? bundle.outputFiles[0].contents : '<div id="root"></div><script src="/bundle.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || 'msedge' });
  const page = await browser.newPage(); const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{if(!localStorage.getItem('amadeus.editor.appearance'))localStorage.setItem('amadeus.editor.appearance','dark');});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const row = page.locator('.amadeus-editor-appearance');
  await expect(row).toContainText('编辑器外观');
  await expect(row.locator('svg')).toHaveCount(3);
  await expect(row.getByRole('button',{name:'深色',exact:true})).toHaveAttribute('aria-pressed','true');
  await row.getByRole('button',{name:'浅色',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('amadeus.editor.appearance')),'light');
  assert.equal(await page.evaluate(()=>window.resolvedEditorAppearance()),'light');
  assert.equal(await page.evaluate(()=>window.themeEvents),1);
  await page.reload();
  await expect(row.getByRole('button',{name:'浅色',exact:true})).toHaveAttribute('aria-pressed','true');
  await row.getByRole('button',{name:'跟随系统',exact:true}).click();
  await page.emulateMedia({colorScheme:'dark'});
  assert.equal(await page.evaluate(()=>window.resolvedEditorAppearance()),'dark');
  await page.emulateMedia({colorScheme:'light'});
  assert.equal(await page.evaluate(()=>window.resolvedEditorAppearance()),'light');
  assert.equal(await page.evaluate(()=>window.registeredAppearanceSlot),'settings.general.item');
  assert.deepEqual(errors,[]);
  console.log('PASS: installed DSH exports, historical background modes, saved preference, reload and system color changes');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
}
