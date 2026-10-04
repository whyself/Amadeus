// Render the actual Reader reference component against DSH's chat snapshot shape.
import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const bundle = await build({ stdin: {
  contents: `import React from 'react';
import {createRoot} from 'react-dom/client';
import {AssistantWithAnnotationLinks,watchFileAnnotation} from './packages/reader/src/client.jsx';
import {serializeAnnotations} from './packages/reader/src/annotations.mjs';
import themeStyles from './ui/dsh-theme.css';
const style=document.createElement('style');style.textContent=themeStyles;document.head.append(style);
const annotation={text:'Original quoted text.',annotation:'Explain',source:{kind:'file',path:'paper.pdf',pageStart:2}};
const user={kind:'user',anchorSeq:1,data:{content:[{type:'text',text:serializeAnnotations([annotation],'')} ]}};
const assistant={kind:'assistant-step',anchorSeq:4,data:{turn:1}};
const nodes=new Map([['user',user],['assistant',assistant]]);
const snapshot={order:['user','assistant'],nodes,locations:{getTurn:()=>['assistant']}};
let reply='Answer [注释 1]';
const root=createRoot(document.getElementById('root'));
const Native=()=>React.createElement('p',{},reply);
const render=()=>root.render(React.createElement(AssistantWithAnnotationLinks,{Native,node:assistant,sessionId:'s1',useChat:selector=>selector(snapshot),openAnnotation:note=>{
 window.opened=note;
 const host=document.getElementById('document');
 watchFileAnnotation(host,{page:note.source.pageStart,text:note.text});
 setTimeout(()=>host.innerHTML='<div style="height:1000px">Page 1</div><div data-pdf-page="2">Original quoted text.</div>',50);
}}));
window.stream=()=>{reply='Updated answer [注释 1] and invalid [注释 2]';render();};
window.nextRequest=()=>{nodes.set('plain',{kind:'user',anchorSeq:5,data:{content:[{type:'text',text:'ordinary request'}]}});snapshot.order.push('plain');assistant.anchorSeq=7;render();};
let stopWatching, lazyPages;
window.jumpToLazyPages=(first,last)=>{
 stopWatching?.();lazyPages?.disconnect();
 const host=document.getElementById('document');host.scrollTop=0;
 host.innerHTML=Array.from({length:10},(_,i)=>'<div data-pdf-page="'+(i+1)+'" style="height:700px"><div data-document-zoom-surface hidden><div data-pdf-text></div></div></div>').join('');
 lazyPages=new IntersectionObserver(entries=>{
  for(const entry of entries){
   if(!entry.isIntersecting)continue;
   const surface=entry.target.querySelector('[data-document-zoom-surface]');
   if(!surface.hidden)continue;
   const page=Number(entry.target.dataset.pdfPage);
   surface.querySelector('[data-pdf-text]').innerHTML='<div class="textLayer">'+(page===6?'First part':page===7?'second part':'Page '+page)+'</div>';
   surface.hidden=false;
  }
 },{root:host});
 for(const page of host.children)lazyPages.observe(page);
 stopWatching=watchFileAnnotation(host,{page:first,pageEnd:last,text:last===first?'First part':'First part second part'});
};
render();`, resolveDir: process.cwd(), sourcefile: 'annotation-regression.jsx', loader: 'jsx',
}, write: false, bundle: true, platform: 'browser', loader: { '.css': 'text', '.png': 'dataurl' }, plugins: [{ name: 'stub-primitives', setup(build) {
  build.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'primitives', namespace: 'stub' }));
  build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const Modal=()=>null; export const Button=()=>null;", loader: 'js' }));
} }], define: { 'process.env.NODE_ENV': '"development"' } });
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
  res.end(req.url === '/bundle.js' ? bundle.outputFiles[0].contents : '<div id="root"></div><div id="document" style="height:160px;overflow:auto"></div><script src="/bundle.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || 'msedge' });
  const page = await browser.newPage({ locale: 'zh-CN' }); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await expect(page.locator('#root')).toContainText('Answer');
  assert.deepEqual(errors, []);
  const reference = page.getByRole('button', { name: '查看注释 1', exact: true });
  await expect(reference).toBeVisible();
  await reference.hover();
  await expect(page.getByRole('tooltip')).toContainText('Original quoted text.');
  await page.evaluate(() => window.stream());
  await expect(reference).toHaveCount(1);
  await expect(page.locator('#root')).toContainText('invalid [注释 2]');
  await reference.click();
  await expect.poll(() => page.evaluate(() => window.opened?.source)).toEqual({ kind: 'file', path: 'paper.pdf', pageStart: 2 });
  await expect.poll(() => page.locator('#document').evaluate(host => host.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => CSS.highlights.get('amadeus-annotation-source')?.size)).toBe(1);
  assert.equal(await page.locator('[data-pdf-page="2"]').evaluate(node => getComputedStyle(node, '::highlight(amadeus-annotation-source)').backgroundColor), 'rgba(255, 205, 60, 0.5)');
  await page.evaluate(() => window.nextRequest());
  await expect(reference).toHaveCount(0);
  await page.evaluate(() => window.jumpToLazyPages(6, 6));
  await expect.poll(() => page.evaluate(() => [...CSS.highlights.get('amadeus-annotation-source') ?? []][0]?.toString())).toBe('First part');
  await expect(page.locator('[data-pdf-page="6"] [data-document-zoom-surface]')).not.toHaveAttribute('hidden', '');
  await page.evaluate(() => window.jumpToLazyPages(6, 7));
  await expect.poll(() => page.evaluate(() => [...CSS.highlights.get('amadeus-annotation-source') ?? []][0]?.toString())).toBe('First partsecond part');
  await expect(page.locator('[data-pdf-page="7"] [data-document-zoom-surface]')).not.toHaveAttribute('hidden', '');
  assert.deepEqual(errors, []);
  console.log('PASS: rendered/streaming references, provenance, plain-request reset, asynchronous source highlights, distant lazy PDF pages and cross-page quotes');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
