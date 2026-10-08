// Read-only live smoke (no model request or document write).
// node tests/annotation-navigation-live.mjs CONFIG WORKSPACE_LABEL CONVERSATION TURN
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import yaml from 'js-yaml';
import { serializeAnnotations } from '../packages/reader/src/annotations.mjs';

const [configPath, workspaceLabel, conversationTitle, turn] = process.argv.slice(2);
if (!configPath || !workspaceLabel || !conversationTitle || !/^\d+$/.test(turn ?? '')) throw new Error('Provide CONFIG WORKSPACE_LABEL CONVERSATION TURN.');
const config = yaml.load(await readFile(configPath,'utf8'));
const origin = `http://127.0.0.1:${Number(process.env.TEST_PORT || config.port || 3080)}`;
await mkdir('test-results',{recursive:true});
const browser = await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL || 'msedge',headless:true});
let page;
try {
  await expect.poll(async()=>{try{return(await fetch(origin,{signal:AbortSignal.timeout(1000)})).status;}catch{return 0;}},{timeout:60000}).toBe(401);
  page = await browser.newPage({httpCredentials:{username:config.username,password:config.password},locale:'zh-CN',viewport:{width:1500,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{
    if(message.type()==='error'&&!message.text().startsWith('Failed to load resource:')&&!message.text().includes('[lifecycle] Long running operations during shutdown'))errors.push(message.text());
  });
  await page.goto(origin);await page.locator('[data-composer-input]').first().waitFor();
  const workspace=page.locator('[data-row-key^="workspace:"]').filter({hasText:workspaceLabel});
  const conversation=page.getByRole('treeitem').filter({hasText:conversationTitle});
  await expect.poll(async()=>{
    if(await workspace.getAttribute('aria-expanded')!=='true')await workspace.click({position:{x:12,y:17}});
    return conversation.count();
  },{timeout:15000}).toBe(1);
  await conversation.click();
  await expect(page.getByRole('navigation',{name:'会话层级'})).toContainText(conversationTitle);
  await page.getByRole('button',{name:new RegExp(`^(加载并)?跳转到第 ${turn} 轮$`)}).click();
  const reference=page.locator(`[data-chat-node-key^="14:assistant-step${turn}:"]:not([data-chat-group-part="reasoning"])`).getByRole('button',{name:'查看注释 1',exact:true}).last();
  await expect(reference).toBeVisible({timeout:30000});await reference.hover();await page.getByRole('tooltip').waitFor();
  await page.evaluate(()=>{const port=document.querySelector('[data-conversation-scroll]');window.scrollSamples=[];window.scrollPort=port;port.addEventListener('scroll',()=>scrollSamples.push({time:performance.now(),top:port.scrollTop,quoteY:[...CSS.highlights.get("amadeus-annotation-source")||[]][0]?.getBoundingClientRect().top}));});
  const before=await page.evaluate(()=>scrollPort.scrollTop);await reference.click();
  await page.waitForTimeout(1500);
  const trace=await page.evaluate(()=>({overflowAnchor:getComputedStyle(scrollPort).overflowAnchor,before:0,after:scrollPort.scrollTop,samples:scrollSamples,highlight:[...CSS.highlights.get('amadeus-annotation-source')||[]].map(r=>({text:r.toString(),rect:r.getBoundingClientRect().toJSON()})),tooltip:!!document.querySelector('[role=tooltip]')}));
  trace.before=before;
  assert.ok(trace.samples.filter(s=>Number.isFinite(s.quoteY)).length>=3,'quote progresses through multiple scroll deliveries');
  const last=trace.highlight[0]?.rect;assert.ok(last?.top>100&&last.bottom<800,'quote lands visibly above composer');
  await page.waitForTimeout(200);const finalY=await page.evaluate(()=>[...CSS.highlights.get('amadeus-annotation-source')||[]][0]?.getBoundingClientRect().top);assert.ok(Math.abs(last.top-finalY)<2,'final quote position remains stable after native layout compensation');
  console.log('PASS animated historical quote navigation and stable final highlight',JSON.stringify(trace));
  await reference.scrollIntoViewIfNeeded();
  await page.evaluate(()=>{
    scrollPort.addEventListener('amadeus:annotation-jump',event=>{
      const animate=event.detail.animate;
      event.detail.animate=options=>{
        let writes=0;const originalWrite=options.viewport.write;
        options.viewport.write=function(...args){writes++;return originalWrite.apply(this,args);};
        animate(options);
        scrollPort.dispatchEvent(new WheelEvent('wheel',{deltaY:120}));
        window.canceledBeforeFrame=options.viewport.annotationAnimation===null;
        setTimeout(()=>{window.writesAfterCancel=writes;options.viewport.write=originalWrite;},80);
      };
    },{once:true,capture:true});
  });
  await reference.click();await expect.poll(()=>page.evaluate(()=>window.canceledBeforeFrame)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.writesAfterCancel)).toBe(0);
  console.log('PASS actual native wheel intent cancels quote jump before first animation frame');
}finally{await browser.close();}
