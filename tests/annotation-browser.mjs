// Render the actual Reader reference component against DSH's chat snapshot shape.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { projectAnnotationBubbles, projectAnnotationQueue } from '../scripts/dsh-chat-patch.mjs';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const chatSource = projectAnnotationBubbles(await readFile('node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js','utf8'));
const contentParts = chatSource.slice(chatSource.indexOf('function contentParts('),chatSource.indexOf('function retrySeconds('));
const bubbleStart = chatSource.indexOf('function UserStyleBubble(');
const bubble = chatSource.slice(bubbleStart,chatSource.indexOf('\n\t\t/**',bubbleStart));
const conversationSource = projectAnnotationQueue(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'));
const queueStart = conversationSource.indexOf('const EMPTY_QUEUE = []');
const queueDock = conversationSource.slice(queueStart,conversationSource.indexOf('//#endregion',queueStart));
const bundle = await build({ stdin: {
  contents: `import React from 'react';
import {createRoot} from 'react-dom/client';
import {AnnotationDock,AssistantWithAnnotationLinks,renderAnnotatedBubble,installSelection,watchFileAnnotation} from './packages/reader/src/client.jsx';
import {annotationDisplayContent,createAnnotationStore,serializeAnnotations} from './packages/reader/src/annotations.mjs';
import * as react_jsx_runtime from 'react/jsx-runtime';
const react=React,MessageItem_module_css_default={};
const _deepseek_ai_dsh_client_ui_primitives={projectUserText:text=>text,FileTypeIcon:()=>null,fileExtension:()=>"txt",fileSizeText:()=>"8 B"};
MessageItem_module_css_default.bubble='native-user-bubble';
Object.assign(_deepseek_ai_dsh_client_ui_primitives,{IconQueueOutlineRegular:()=>null});
${contentParts}
${bubble}
const QueueDock_module_css_default={};
${queueDock}
import themeStyles from './ui/dsh-theme.css';
const style=document.createElement('style');style.textContent=themeStyles;document.head.append(style);
const annotation={text:'Original quoted text.',annotation:'Explain',source:{kind:'file',path:'paper.pdf',pageStart:2}};
const dockStore=createAnnotationStore();dockStore.add('s1',annotation);const dockRoot=createRoot(document.getElementById('dock'));
window.showDock=()=>dockRoot.render(React.createElement(AnnotationDock,{sessionId:'s1',store:dockStore,useInput:selector=>selector({draft:'',phase:'plain'}),inputActions:{setDraft(){}}}));
globalThis.__amadeusAnnotationContent=content=>annotationDisplayContent(content,count=>count+' 条注释');
globalThis.__amadeusAnnotationBubble=renderAnnotatedBubble;
const pendingHost=document.getElementById('pending'),pendingRoot=createRoot(pendingHost);
window.pendingTexts=[];window.pendingBubbles=[];new MutationObserver(()=>{window.pendingTexts.push(pendingHost.textContent);window.pendingBubbles.push(pendingHost.querySelectorAll('.native-user-bubble,.amadeus-sent-message').length);}).observe(pendingHost,{childList:true,characterData:true,subtree:true});
window.showPending=steering=>pendingRoot.render(React.createElement(UserStyleBubble,{content:[{type:'text',text:serializeAnnotations([annotation],'Visible request')},{type:'file',attachment:{name:'notes.txt',bytes:8}}],echo:true,pending:steering,renderMessageImages:()=>null,t:k=>k}));
window.showPlain=()=>pendingRoot.render(React.createElement(UserStyleBubble,{content:[{type:'text',text:'Plain request'}],echo:true,renderMessageImages:()=>null,t:k=>k}));
window.showAnnotationOnly=()=>pendingRoot.render(React.createElement(UserStyleBubble,{content:[{type:'text',text:serializeAnnotations([annotation],'')}],echo:true,renderMessageImages:()=>null,t:k=>k}));
window.installSelection=()=>installSelection({}, {add(){}}, {id:'s1'});
const queueHost=document.getElementById('queue'),queueRoot=createRoot(queueHost);
new MutationObserver(()=>window.pendingTexts.push(queueHost.textContent)).observe(queueHost,{childList:true,characterData:true,subtree:true});
window.showQueue=admitted=>{
 const text=serializeAnnotations([annotation],'Visible queued request');window.queueWire=text;
 const submission={placement:'queued',requestId:'q1',text,attachments:[]};
 const state={pendingSubmissions:[submission],running:true,subagent:{address:{mode:'readonly'}}};
 const inbox={'next-turn':admitted?[{id:'q1',source:{kind:'user',rpcId:'q1'},content:[{type:'text',text}]}]:[]};
 queueRoot.render(React.createElement(QueueDock,{useSession:selector=>selector(state),useProjection:()=>inbox,updateQueue:()=>{},notify:()=>{},loadImage:()=>{},t:k=>k}));
};
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
  res.end(req.url === '/bundle.js' ? bundle.outputFiles[0].contents : '<div id="root"></div><div id="pending"></div><div id="queue"></div><div id="document" style="height:160px;overflow:auto"></div><p id="quote" data-chat-anchor-key="quote" data-chat-flow-kind="assistant-step">Quote for selection</p><div id="dock" style="position:relative;height:60px"></div><script src="/bundle.js"></script>');
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
  for (const steering of [false,true]) {
    await page.evaluate(value=>window.showPending(value),steering);
    await expect(page.locator('#pending')).toContainText('1 条注释');
    await expect(page.locator('#pending')).toContainText('Visible request');
    await expect(page.locator('#pending')).toContainText('notes.txt');
    assert.ok((await page.evaluate(()=>window.pendingTexts)).every(text=>!text.includes('Response annotations')&&!text.includes('response-annotations')&&!text.includes('以下各条')));
  }
  await page.evaluate(()=>window.showPlain());await expect(page.locator('#pending')).toContainText('Plain request');
  await page.evaluate(()=>{window.pendingBubbles=[];window.showAnnotationOnly();});
  await expect(page.locator('#pending .amadeus-sent-chip')).toBeVisible();
  await expect(page.locator('#pending .native-user-bubble')).toHaveCount(0);
  assert.ok((await page.evaluate(()=>window.pendingBubbles)).every(count=>count===0));
  await page.locator('#pending .amadeus-sent-chip').hover();await expect(page.getByRole('region',{name:'已发送注释详情'})).toBeVisible();await page.mouse.move(0,0);await page.getByRole('region',{name:'已发送注释详情'}).waitFor({state:'hidden'});
  await page.evaluate(()=>window.installSelection());
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('amadeus:editor-selection',{detail:{sessionId:'s1',text:'Quote for selection',source:{kind:'file',path:'paper.pdf'},x:40,y:100}})));
  const comment=page.getByRole('textbox',{name:'针对选中文本的问题'});await expect(comment).toBeVisible();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('amadeus:annotation-submit',{detail:{sessionId:'s1'}})));await expect(comment).toHaveCount(0);
  await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.getElementById('quote'));getSelection().addRange(range);document.dispatchEvent(new KeyboardEvent('keyup'));});
  await page.waitForTimeout(180);await expect(page.locator('.amadeus-selection')).toHaveCount(0);
  await page.locator('#quote').evaluate(node=>{node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));node.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));});
  await expect(page.locator('.amadeus-selection-trigger')).toBeVisible();await page.locator('.amadeus-selection-trigger').click();await expect(comment).toBeVisible();
  await comment.fill('Keep typing');await expect(comment).toHaveValue('Keep typing');
  await page.mouse.click(5,5);await expect(comment).toHaveCount(0);
  await page.waitForTimeout(180);await expect(page.locator('.amadeus-selection')).toHaveCount(0);
  await page.evaluate(()=>{const frame=document.createElement('iframe');frame.id='blank-frame';frame.srcdoc='<body style="height:80px">Blank editor area</body>';document.body.append(frame);});
  const reopenFromEditor=()=>page.evaluate(()=>window.dispatchEvent(new CustomEvent('amadeus:editor-selection',{detail:{sessionId:'s1',text:'New selection',source:{kind:'file',path:'paper.pdf'},x:40,y:100}})));
  await reopenFromEditor();await expect(comment).toBeFocused();
  await page.frameLocator('#blank-frame').locator('body').click();await expect(comment).toHaveCount(0);
  await page.waitForTimeout(180);await expect(page.locator('.amadeus-selection')).toHaveCount(0);
  await reopenFromEditor();await expect(comment).toBeFocused();await comment.fill('Fresh comment');await expect(comment).toHaveValue('Fresh comment');await comment.press('Escape');await expect(comment).toHaveCount(0);
  await reopenFromEditor();await expect(comment).toBeFocused();
  const quoteBox=await page.locator('#quote').boundingBox();
  await page.mouse.move(quoteBox.x+2,quoteBox.y+quoteBox.height/2);await page.mouse.down();await page.mouse.move(quoteBox.x+120,quoteBox.y+quoteBox.height/2,{steps:8});await page.mouse.up();
  await expect(page.locator('.amadeus-selection-trigger')).toBeVisible();await page.locator('.amadeus-selection-trigger').click();await expect(comment).toBeFocused();await comment.press('Escape');
  await page.evaluate(()=>window.showDock());
  const summary=page.locator('#dock .amadeus-summary-chip');await summary.focus();
  const details=page.getByRole('region',{name:'全部注释'});await expect(details).toBeVisible();await summary.press('Tab');
  const edit=details.getByRole('button',{name:'编辑注释 1',exact:true});await expect(edit).toBeFocused();await page.waitForTimeout(120);await expect(details).toBeVisible();
  await edit.press('Shift+Tab');await expect(summary).toBeFocused();await summary.press('ArrowDown');await expect(edit).toBeFocused();await edit.press('Escape');await expect(details).toHaveCount(0);await expect(summary).toBeFocused();await summary.blur();
  for (const admitted of [false,true]) {
    await page.evaluate(value=>window.showQueue(value),admitted);
    await expect(page.locator('#queue')).toContainText('1 条注释');await expect(page.locator('#queue')).toContainText('Visible queued request');
    assert.ok((await page.evaluate(()=>window.pendingTexts)).every(text=>!text.includes('Response annotations')&&!text.includes('response-annotations')&&!text.includes('以下各条')));
    assert.ok((await page.evaluate(()=>window.queueWire)).includes('<response-annotations>'));
  }
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
  console.log('PASS: native pending/steering echoes never reveal annotation envelopes; rendered/streaming references, provenance, plain-request reset, asynchronous source highlights and lazy/cross-page PDFs');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
