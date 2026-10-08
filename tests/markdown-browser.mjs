// Actual DSH MarkdownText, including streaming parsing and theme/citation styles.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { patchFrontendMarkdown } from '../scripts/dsh-markdown-patch.mjs';

const assets=path.resolve('node_modules/@deepseek-ai/dsh-web-frontend/dist/assets');
const index=await readFile('node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html','utf8');
const entry=/src="\.\/assets\/(index-[^"]+\.js)"/.exec(index)[1];
const frontend=patchFrontendMarkdown(await readFile(path.join(assets,entry),'utf8'));
const factory=/function ([\w$]+)\(\)\{return\{react:[\w$]+,"react\/jsx-runtime":/.exec(frontend)[1];
const boot=frontend.indexOf('const fo=globalThis.dshDesktopBoot');
assert.ok(boot>0);
const native=frontend.slice(0,boot)+frontend.slice(frontend.indexOf('\n// Amadeus safe inline HTML formatting'))+`\nexport const testBuiltins=${factory}();`;

const markdown = '- **附件：** <u>/workspace/ComputationalMethods/Assignments/Assignments_3/251502023_汪翰元_A3.pdf</u> （136 KB，6 页，md5 `555471f3d6e7059f61ccccd9eac23545`）\n\nH<sub>2</sub>O，E=mc<sup>2</sup>。<br>下一行。\n\n<u>**嵌套加粗**与下划线</u> [注释 1]\n\n$E=mc^2$\n\n| 项目 | 值 |\n| --- | --- |\n| 文件 | `paper.pdf` |\n\n```html\n<u>code stays literal</u>\n```\n\n<script>window.injected=true</script>\n\n<u onclick="window.injected=true">attributes stay literal</u>';
const bundle = await build({stdin:{resolveDir:process.cwd(),sourcefile:'markdown-browser.jsx',loader:'jsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {MarkdownText,MarkdownDelegateProvider} from '@deepseek-ai/dsh-client-ui-primitives';
import {AssistantWithAnnotationLinks,renderAnnotationReferenceText} from './packages/reader/src/client.jsx';
globalThis.__amadeusAnnotationReferenceText=renderAnnotationReferenceText;
import {serializeAnnotations} from './packages/reader/src/annotations.mjs';
import theme from './ui/dsh-theme.css';
const style=document.createElement('style');style.textContent=theme;document.head.append(style);
let reply=${JSON.stringify(markdown)},streaming=false;
const labels={code:{copyLabel:'复制',copiedLabel:'已复制'},footnotes:'脚注'};
const user={kind:'user',anchorSeq:1,data:{content:[{type:'text',text:serializeAnnotations([{text:'选中原文',annotation:'解释',source:{kind:'file',path:'paper.pdf',pageStart:2}}],'')}]}};
const assistant={kind:'assistant-step',anchorSeq:3,data:{turn:1}};
const snapshot={order:['u','a'],nodes:new Map([['u',user],['a',assistant]])};
const root=createRoot(document.getElementById('root'));
const Native=()=>React.createElement(MarkdownDelegateProvider,{openFile:path=>window.openedFile=path},React.createElement(MarkdownText,{text:reply,streaming,labels}));
window.renderMarkdown=(text,live=false)=>{reply=text;streaming=live;root.render(React.createElement(AssistantWithAnnotationLinks,{Native,node:assistant,useChat:selector=>selector(snapshot),openAnnotation:note=>window.openedNote=note}));};
window.renderMarkdown(reply);`},outfile:'test-results/markdown-fixture.js',write:false,bundle:true,platform:'browser',loader:{'.css':'text','.png':'dataurl'},define:{'process.env.NODE_ENV':'"development"'},plugins:[
  {name:'native-markdown-formatting',setup(build){
    build.onResolve({filter:/^(react(?:\/jsx-runtime)?|react-dom(?:\/client)?|@deepseek-ai\/dsh-client-ui-primitives)$/},args=>({path:args.path,namespace:'native'}));
    build.onLoad({filter:/.*/,namespace:'native'},args=>{
      const prefix='import {testBuiltins} from "/frontend.js";';
      const code=args.path==='react'?'const React=testBuiltins.react;export default React;export const {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore,useLayoutEffect}=React;':args.path==='react/jsx-runtime'?'export const {jsx,jsxs,Fragment}=testBuiltins["react/jsx-runtime"];':args.path==='react-dom'?'export const {createPortal}=testBuiltins["react-dom"];':args.path==='react-dom/client'?'export const {createRoot}=testBuiltins["react-dom/client"];':'export const {MarkdownText,MarkdownDelegateProvider,Button,Modal}=testBuiltins["@deepseek-ai/dsh-client-ui-primitives"];';
      return {contents:prefix+code,loader:'js'};
    });
  }}
] ,external:['/frontend.js'],format:'esm'});
const script=bundle.outputFiles.find(file=>file.path.endsWith('.js')).contents;
const cssLinks=[...index.matchAll(/href="\.\/assets\/([^"/]+\.css)"/g)].map(match=>`<link rel="stylesheet" href="/${match[1]}">`).join('');
const server=http.createServer(async(req,res)=>{
  if(req.url==='/bundle.js'||req.url==='/frontend.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(req.url==='/bundle.js'?script:native);return;}
  const target=path.resolve(assets,new URL(req.url,'http://fixture').pathname.slice(1));
  if(target.startsWith(assets+path.sep)){
    const file=await readFile(target).catch(()=>null);
    if(file){res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript; charset=utf-8':target.endsWith('.css')?'text/css; charset=utf-8':'application/octet-stream');res.end(file);return;}
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><meta charset="utf-8">'+cssLinks+'<style>body{margin:24px;font:16px/1.6 system-ui;background:#fff;color:#20242b;--dsw-alias-label-primary:#20242b;--dsw-alias-bg-base:#fff;--dsw-alias-markdown-code-block:#f5f5f5}body[data-ds-dark-theme]{background:#1f1f1f;color:#eee;--dsw-alias-label-primary:#eee;--dsw-alias-bg-base:#1f1f1f;--dsw-alias-markdown-code-block:#2b2b2b}#root{max-width:980px}</style><div id="root"></div><script type="module" src="/bundle.js"></script>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  await mkdir('test-results',{recursive:true});browser=await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL||'msedge',headless:true});
  const page=await browser.newPage({locale:'zh-CN',viewport:{width:1100,height:1000}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await expect(page.locator('li u')).toContainText('251502023_汪翰元_A3.pdf');
  await expect(page.locator('sub')).toHaveText('2');await expect(page.locator('sup').filter({hasText:'2'})).toHaveCount(1);
  await expect(page.locator('u strong')).toHaveText('嵌套加粗');await expect(page.locator('br')).toHaveCount(1);
  await expect(page.locator('table')).toContainText('paper.pdf');await expect(page.locator('.katex')).toHaveCount(1);await expect(page.locator('.katex-error')).toHaveCount(0);
  await expect(page.locator('pre')).toContainText('<u>code stays literal</u>');await expect(page.locator('#root')).toContainText('<script>window.injected=true</script>');
  assert.equal(await page.evaluate(()=>window.injected),undefined);await expect(page.locator('#root [onclick]')).toHaveCount(0);
  const reference=page.getByRole('button',{name:'查看注释 1',exact:true});
  await page.locator('#root').evaluate(root=>{root.style.transform='translate(100px, 40px)';root.style.contain='layout';});
  await reference.hover();const tooltip=page.getByRole('tooltip');await expect(tooltip).toBeVisible();
  const position=async()=>({anchor:await reference.boundingBox(),popup:await tooltip.boundingBox()});
  await expect.poll(async()=>{const boxes=await position();return Math.abs(boxes.popup.x-boxes.anchor.x)}).toBeLessThan(2);
  assert.equal(await tooltip.evaluate(node=>node.parentElement===document.body),true);
  await reference.focus();
  await page.locator('#root').evaluate(root=>root.style.transform='translate(60px, 80px)');
  await expect.poll(async()=>{const boxes=await position();return Math.abs(boxes.popup.x-boxes.anchor.x)}).toBeLessThan(2);
  await page.mouse.move(0,0);await reference.blur();await tooltip.waitFor({state:'hidden'});await page.locator('#root').evaluate(root=>{root.style.transform='';root.style.contain='';});
  for(const [theme,color,hover]of [['light','rgb(37, 99, 235)','rgb(29, 78, 216)'],['dark','rgb(138, 180, 248)','rgb(173, 202, 255)']]){
    await page.mouse.move(0,0);await page.evaluate(dark=>document.body.toggleAttribute('data-ds-dark-theme',dark),theme==='dark');
    await expect(reference).toHaveCSS('color',color);await expect(reference).toHaveCSS('border-top-width','0px');await expect(reference).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await reference.hover();await expect(reference).toHaveCSS('color',hover);await page.getByRole('tooltip').waitFor();
    await reference.focus();await expect(reference).toHaveCSS('outline-width','2px');await reference.click();assert.equal(await page.evaluate(()=>window.openedNote.source.path),'paper.pdf');
    await page.mouse.move(0,0);await reference.blur();await page.getByRole('tooltip').waitFor({state:'hidden'});
    await page.screenshot({path:`test-results/markdown-${theme}.png`});
  }
  await page.evaluate(()=>window.renderMarkdown('<u>Streaming path',true));await expect(page.locator('#root')).toContainText('<u>Streaming path');
  await page.evaluate(()=>window.renderMarkdown('<u>Streaming path</u> [注释 1]',true));await expect(page.locator('u')).toHaveText('Streaming path');await expect(reference).toBeVisible();
  await page.evaluate(()=>window.renderMarkdown('<u>Streaming path</u> [注释 1]',false));await expect(reference).toBeVisible();
  await page.evaluate(()=>window.renderMarkdown('<script>[注释 1]</script>\n\n[注释 1][missing]'));
  await expect(page.locator('#root')).toContainText('<script>[注释 1]</script>');await expect(reference).toHaveCount(0);
  await page.evaluate(()=>window.renderMarkdown('Note [注释 1]'));
  await expect(reference).toBeVisible();
  await page.evaluate(()=>{window.originalVisualViewport=window.visualViewport;Object.defineProperty(window,'visualViewport',{configurable:true,value:{offsetLeft:0,offsetTop:0,width:260,height:240,addEventListener(){},removeEventListener(){}}});});
  await reference.hover();await expect(tooltip).toBeVisible();const constrained=await tooltip.boundingBox();assert.ok(constrained.width<=244&&constrained.height<=224&&constrained.x+constrained.width<=252&&constrained.y+constrained.height<=232);
  await page.mouse.move(0,0);await tooltip.waitFor({state:'hidden'});await page.evaluate(()=>Object.defineProperty(window,'visualViewport',{configurable:true,value:window.originalVisualViewport}));
  assert.deepEqual(errors,[]);console.log('PASS: actual Markdown underline/sub/sup/br, nested formatting, math/tables/code, literal unsafe HTML, streaming and blue borderless light/dark annotation references');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
