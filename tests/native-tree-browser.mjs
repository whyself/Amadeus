// Slot lifecycle regression: disposal must release an already-rendered wrapper
// even when DSH does not notify its renderer after component reassignment.
import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const bundle = await build({ stdin: {
  contents: `import React from 'react';
import {createRoot} from 'react-dom/client';
import {apply} from './packages/files/src/client.jsx';
const root = createRoot(document.getElementById('root'));
let entry, changed, closed;
function Native() { return <div data-files-state="tree" data-files-root="/workspace"><header>Native files</header><ul><li data-files-entry="file" data-files-path="/workspace/a.txt"><button>a.txt</button></li></ul></div>; }
entry = {options:{key:'@deepseek-ai/dsh-client-ui-sidebar-files'},component:Native};
const disposers=[];
apply({effect:fn=>{const off=fn();if(typeof off==='function')disposers.push(off);},locale:{getSnapshot:()=>({active:'zh'}),subscribe:()=>()=>{}},sidebarRight:{openTabIn(){}},slots:{inject:(_name,fn)=>fn(),entries:()=>entry?[entry]:[],subscribe:(_name,fn)=>{changed=fn;return ()=>{changed=null;};}}});
const tab={id:'file-tab',signal:new AbortController().signal,actions:{}};
const props={sessionId:'s1',useTabInfo:()=>({tab}),refresh(){}};
const render=()=>root.render(React.createElement(entry.component,props));
window.reregister=()=>{entry=null;changed();entry={options:{key:'@deepseek-ai/dsh-client-ui-sidebar-files'},component:Native};changed();render();};
window.dispose=()=>{for(const off of disposers.reverse())off();closed=entry.component===Native;};
window.restored=()=>closed;
render();`, resolveDir: process.cwd(), sourcefile: 'native-tree-lifecycle.jsx', loader: 'jsx',
}, write: false, bundle: true, platform: 'browser', loader: { '.css': 'text' }, plugins: [{ name: 'stub-primitives', setup(build) {
  build.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'primitives', namespace: 'stub' }));
  build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "import React from 'react'; export const Modal=()=>null; export const Button=props=>React.createElement('button',props);", loader: 'js', resolveDir: process.cwd() }));
} }], define: { 'process.env.NODE_ENV': '"development"' } });
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/bundle.js' ? bundle.outputFiles[0].contents : '<div id="root"></div><script src="/bundle.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || 'msedge' });
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await expect(page.locator('.amadeus-native-root-actions')).toHaveCount(1);
  await expect(page.locator('.amadeus-native-row-actions')).toHaveCount(1);
  await page.evaluate(()=>window.reregister());
  await expect(page.locator('.amadeus-native-row-actions')).toHaveCount(1);
  await page.evaluate(()=>window.dispose());
  await expect(page.locator('.amadeus-native-row-actions')).toHaveCount(0);
  await expect(page.locator('.amadeus-native-root-actions')).toHaveCount(0);
  await expect(page.getByRole('button', {name:'a.txt',exact:true})).toBeVisible();
  assert.equal(await page.evaluate(()=>window.restored()), true);
  assert.deepEqual(errors, []);
  console.log('PASS: native registration replacement is wrapped; plugin disposal removes mounted actions without a slot rerender');
} finally {
  await browser?.close();
  server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
}
