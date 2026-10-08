// Real authenticated DSH UI, disposable home/workspace, no model calls.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { chromium, expect } from '@playwright/test';
import { initializeProfileFromDefault } from '@deepseek-ai/dsh/profile-boot';

await mkdir('test-results', { recursive: true });
const directory = await mkdtemp(path.resolve('test-results/shared-ui-'));
const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
let submitted = '';
const fixture = createServer((req, res) => {
  if (req.url === '/site-icon.svg') {
    if (!req.headers.cookie?.includes('site-icon-ready=yes')) { res.writeHead(401); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" rx="3" fill="#2563eb"/><path d="M4 12L8 3l4 9M5.5 9h5" fill="none" stroke="white" stroke-width="1.5"/></svg>'); return;
  }
  if (req.url.startsWith('/submitted')) submitted = new URL(req.url, 'http://fixture').searchParams.get('value');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': 'site-icon-ready=yes; Path=/; SameSite=Lax' });
  res.end('<!doctype html><meta charset="utf-8"><title>共同浏览器测试</title><link rel="icon" href="/site-icon.svg"><h1>共同网页</h1><input id="value" style="position:absolute;left:40px;top:70px;width:400px;height:40px;font-size:24px"><button style="position:absolute;left:40px;top:140px" onclick="document.querySelector(\'h1\').textContent=document.querySelector(\'#value\').value;fetch(\'/submitted?value=\'+encodeURIComponent(document.querySelector(\'#value\').value))">提交</button>');
});
fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening'); const fixtureUrl = `http://127.0.0.1:${fixture.address().port}/form`;
const username = 'fixture', password = randomBytes(24).toString('hex'); const config = path.join(directory, 'config.json');
const executablePath = process.env.DSH_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
await writeFile(config, JSON.stringify({ username, password, host: '127.0.0.1', port, home: path.join(directory, 'home'), workspace: directory, browserUse: { enabled: true, executablePath } }));
const driver=path.join(directory,'driver.mjs');
await writeFile(driver, `export const inject=['webServer','agents','tools'];
export function apply(ctx){ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/_test/browser',handler:async(req,res)=>{try{let data='';for await(const chunk of req)data+=chunk;const input=JSON.parse(data);const agent=ctx.agents.get(input.session);if(!agent)throw new Error('Fixture Agent is not loaded');if(input.turn)agent.session.append('turn/start',{turn:input.turn});const result=await ctx.tools.execute({agent,name:'mcp__playwright-mcp__'+input.name,arguments:input.args,callId:crypto.randomUUID(),signal:AbortSignal.timeout(30000)});res.writeHead(result.isError?500:200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));}catch(error){res.writeHead(500);res.end(error.message);}}}));}`);
initializeProfileFromDefault('amadeus', 'web', path.join(directory, 'home'));
const overlay=path.join(directory,'home/profiles/amadeus/cordis.patch.yml');await writeFile(overlay,JSON.stringify([{insert:[{id:'browser-test-driver',name:driver.replaceAll('\\','/')}]}]));
const child = spawn(process.execPath, ['scripts/start.mjs'], { env: { ...process.env, AMADEUS_CONFIG: config }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '', browser;
child.stdout.on('data', data => { log += data; }); child.stderr.on('data', data => { log += data; });
try {
  await expect.poll(async () => { if (child.exitCode !== null) throw new Error(log); try { return (await fetch(origin, { signal: AbortSignal.timeout(1000) })).status; } catch { return 0; } }, { timeout: 120000 }).toBe(401);
  browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: process.env.TEST_BROWSER_CHANNEL || 'msedge' } : { executablePath }), headless: true });
  const context = await browser.newContext({ httpCredentials: { username, password }, viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '稍后配置', exact: true }).click();
  await page.getByRole('button', { name: '打开右侧边栏', exact: true }).click();
  let sessionId;
  page.on('request',request=>{if(request.url().includes('/amadeus/browser/state?'))sessionId=new URL(request.url()).searchParams.get('session');});
  await page.getByRole('button',{name:'AI 浏览器',exact:false}).last().click();
  const viewer=page.locator('[data-amadeus-browser]');await expect(viewer).toBeVisible();
  await expect.poll(()=>sessionId).toBeTruthy();
  await viewer.locator('.amadeus-browser-page-name').evaluate(element => {
    window.seenBrowserTitles = [element.textContent];
    window.browserTitleObserver = new MutationObserver(() => window.seenBrowserTitles.push(element.textContent));
    window.browserTitleObserver.observe(element, { childList: true, characterData: true, subtree: true });
  });
  const call=async(name,args,turn)=>{const response=await fetch(origin+'/_test/browser',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(username+':'+password).toString('base64')},body:JSON.stringify({session:sessionId,name,args,turn})});const body=await response.text();assert.equal(response.status,200,body);return body;};
  await page.getByRole('button',{name:'收起右侧边栏',exact:true}).click();
  await call('browser_navigate',{url:fixtureUrl},1);
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('textbox',{name:'AI 浏览器地址'})).toHaveValue(fixtureUrl);
  await expect(viewer.getByRole('textbox',{name:'AI 浏览器地址'})).toHaveAttribute('readonly','');
  await expect(viewer.getByRole('button',{name:'用户接管',exact:true})).toHaveCount(0);
  await expect(viewer.getByRole('status')).toHaveCount(0,{timeout:20000});
  await expect(viewer.locator('img.amadeus-browser-favicon')).toHaveAttribute('src', /^data:image\/svg\+xml;base64,/, { timeout: 10000 });
  await expect.poll(() => viewer.locator('img.amadeus-browser-favicon').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(viewer.locator('.amadeus-browser-page-name')).toHaveText('共同浏览器测试');
  await call('browser_evaluate', { function: '() => { document.title = ""; return document.title; }' });
  await expect(viewer.locator('.amadeus-browser-page-name')).not.toHaveText(fixtureUrl);
  await call('browser_evaluate', { function: '() => { document.title = "跳转后的标题"; return document.title; }' });
  await expect(viewer.locator('.amadeus-browser-page-name')).toHaveText('跳转后的标题');
  assert.equal(await page.evaluate(() => window.seenBrowserTitles.some(title => /^https?:\/\//.test(title))), false);
  assert.equal(await viewer.locator('canvas').evaluate(canvas=>getComputedStyle(canvas).pointerEvents),'none');
  assert.match(await call('browser_evaluate',{function:'() => document.querySelector("#value").value'}),/Result/);
  const rejected=await fetch(origin+'/amadeus/browser/command?session='+encodeURIComponent(sessionId),{method:'POST',headers:{Authorization:'Basic '+Buffer.from(username+':'+password).toString('base64')},body:JSON.stringify({action:'text',text:'must not reach browser'})});assert.equal(rejected.status,403);
  await call('browser_evaluate',{function:'() => {document.querySelector("#value").value="AI 正在操作";document.querySelector("h1").textContent="AI 正在操作";return document.querySelector("#value").value;}'});
  await page.screenshot({path:path.join(directory,'ai-browser-readonly.png')});
  await page.getByRole('button',{name:'收起右侧边栏',exact:true}).click();
  await call('browser_snapshot',{});
  await expect(viewer).toBeHidden();
  await call('browser_snapshot',{},2);await expect(viewer).toBeVisible();
  await page.getByRole('button',{name:'新标签页',exact:true}).last().click();
  await page.getByRole('button',{name:/^浏览器/}).last().click();
  const address=page.getByPlaceholder('输入 HTTP(S) 地址');await address.fill(fixtureUrl);await address.press('Enter');
  const nativeFrame=page.frameLocator('[data-sidebar-browser-frame="iframe"]');
  await nativeFrame.locator('#value').fill('用户原生浏览器输入');await expect(nativeFrame.locator('#value')).toHaveValue('用户原生浏览器输入');
  const ai=await call('browser_evaluate',{function:'() => document.querySelector("#value").value'});assert.ok(ai.includes('AI 正在操作'));assert.ok(!ai.includes('用户原生浏览器输入'));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: AI auto-open, read-only frame and API, hide suppression, new turn reveal, native iframe remains independently interactive; screenshot: '+path.join(directory,'ai-browser-readonly.png'));
} catch (error) { console.error(log.slice(-3000)); throw error; } finally {
  await browser?.close(); child.kill('SIGTERM'); fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve));
}
