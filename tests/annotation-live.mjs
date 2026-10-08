// Read-only live smoke (no model request or document write).
// node tests/annotation-live.mjs CONFIG WORKSPACE_LABEL CONVERSATION TURN DOCUMENT_RELATIVE_PATH
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import yaml from 'js-yaml';
import { serializeAnnotations } from '../packages/reader/src/annotations.mjs';

const [configPath, workspaceLabel, conversationTitle, turn, texPath] = process.argv.slice(2);
if (!configPath || !workspaceLabel || !conversationTitle || !/^\d+$/.test(turn ?? '') || !/\.(tex|pdf)$/i.test(texPath ?? '')) throw new Error('Provide CONFIG WORKSPACE_LABEL CONVERSATION TURN TEX_OR_PDF_RELATIVE_PATH (with an existing compiled PDF).');
const directPdf=texPath.toLowerCase().endsWith('.pdf');
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
  await expect(reference).toBeVisible({timeout:30000});await reference.hover();await expect(page.getByRole('tooltip')).toBeVisible();
  const tooltip=page.getByRole('tooltip');
  assert.equal(await tooltip.evaluate(node=>node.parentElement===document.body),true);
  await expect.poll(async()=>{
    const anchor=await reference.boundingBox(),panel=await tooltip.boundingBox();
    return anchor&&panel?Math.min(Math.abs(panel.y-anchor.y-anchor.height-6),Math.abs(panel.y+panel.height-anchor.y+6)):Infinity;
  }).toBeLessThan(2);
  const envelope=serializeAnnotations([{text:'Sample quote',annotation:'Explain',source:{kind:'file',path:'sample.pdf',pageStart:2}}],'Visible request');
  assert.deepEqual(await page.evaluate(text=>globalThis.__amadeusAnnotationContent([{type:'text',text}]),envelope),[{type:'text',text:'1 条注释\n\nVisible request'}]);
  await reference.click();await expect.poll(()=>page.locator('[data-amadeus-path]').count()).toBeGreaterThan(0);
  console.log('PASS: real historical reference, tooltip, source navigation and installed submission display hook');
  await page.getByRole('button',{name:'新标签页',exact:true}).first().click();
  if(directPdf)await page.locator('[data-sidebar-right-guide-entry="amadeus-code-server"]').click();
  else{
    await page.locator('[data-sidebar-right-guide-entry="files"]').click();
    const tree=page.locator('[data-files-state="tree"]');
    for(const folder of texPath.split('/').slice(0,-1))await tree.getByRole('button',{name:folder,exact:true}).click();
    await page.getByRole('button',{name:`在编辑器中打开 ${texPath}`,exact:true}).click();
  }
  const workbench=page.frameLocator('iframe.amadeus-code-frame');
  await workbench.locator('.monaco-workbench').waitFor({timeout:90000});
  if(directPdf){
    await workbench.locator('.monaco-workbench').click({position:{x:200,y:30}});await page.keyboard.press('Control+p');
    const quick=workbench.locator('.quick-input-box input');await quick.fill(texPath);await workbench.locator('.quick-input-list .monaco-list-row').filter({hasText:texPath.split('/').at(-1)}).first().waitFor();await quick.press('Enter');
  }else{
    await expect(workbench.locator('.tab.active')).toContainText(texPath.split('/').at(-1));
    await workbench.locator('.view-lines').first().click();await page.keyboard.press('Control+Shift+p');
    const palette=workbench.locator('.quick-input-box input');await palette.fill('>LaTeX Workshop: View LaTeX PDF file');
    await workbench.locator('.quick-input-list .monaco-list-row').filter({hasText:'View LaTeX PDF file'}).first().waitFor();await palette.press('Enter');
  }
  await expect.poll(()=>page.frames().filter(frame=>new URL(frame.url() || 'about:blank').pathname.endsWith('/viewer.html')).length,{timeout:60000}).toBeGreaterThan(0);
  const pdf=page.frames().find(frame=>new URL(frame.url() || 'about:blank').pathname.endsWith('/viewer.html'));
  await pdf.locator('.textLayer span').first().waitFor({timeout:60000});
  const span=pdf.locator('.textLayer span').filter({hasText:/\S.{5,}/}).first();await span.scrollIntoViewIfNeeded();
  const selectPdfText=async()=>{const box=await span.boundingBox();await page.mouse.move(box.x+2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width-2,box.y+box.height/2,{steps:12});await page.mouse.up();};
  const textBox=await span.boundingBox();await selectPdfText();
  const pill=page.locator('.amadeus-code-selection-pill');await expect(pill).toBeVisible();
  const control=await pill.boundingBox();assert.ok(Math.abs(control.y-textBox.y-textBox.height)<50,'PDF action stays beside the visible selection');await pill.click();
  const comment=page.getByRole('textbox',{name:'针对选中文本的问题',exact:true});await expect(comment).toBeVisible();
  await comment.fill('Cancel this comment');await expect(comment).toHaveValue('Cancel this comment');
  await pdf.locator('#viewerContainer').click({position:{x:6,y:25}});await expect(comment).toHaveCount(0);
  await page.waitForTimeout(200);await expect(comment).toHaveCount(0);
  await selectPdfText();await expect(pill).toBeVisible();await pill.click();await expect(comment).toBeVisible();
  await comment.fill('PDF selection smoke');await page.getByRole('button',{name:'添加注释',exact:true}).click();
  const saved=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('amadeus.annotations.')).flatMap(([,value])=>JSON.parse(value)).find(note=>note.annotation==='PDF selection smoke'));
  assert.ok(saved?.text);assert.equal(saved.source.path,texPath.replace(/\.tex$/,'.pdf'));assert.equal(saved.source.format,'pdf');assert.ok(saved.source.pageStart>0);
  await page.screenshot({path:'test-results/annotation-live.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: real LaTeX Workshop nested PDF selection, blank-area dismissal, fresh selection and PDF path/page provenance');
} finally {await browser.close();}
