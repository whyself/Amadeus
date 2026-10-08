// Model-free integration based on DSH's MIT-licensed browser-use upstream e2e harness.
// Exercises the installed official provider, real MCP and disposable Chromium.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import Include from '@deepseek-ai/cordis-plugin-include';
import BrowserUse from '@deepseek-ai/dsh-browser-use';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import Tools from '@deepseek-ai/dsh-tools';
import Llm, { ToolCallId } from '@deepseek-ai/dsh-llm';
import Sessions, { SessionId } from '@deepseek-ai/dsh-session';
import Agents from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import Projections from '@deepseek-ai/dsh-session-projection';
import * as Provider from '../packages/browser/src/index.mjs';
import {streamPage} from '../packages/browser/src/stream.mjs';
import WebSocket, {WebSocketServer} from 'ws';
import { resolveBrowserRuntime } from '../scripts/browser-bootstrap.mjs';

const runtime = resolveBrowserRuntime(process.cwd());
const executable = process.env.DSH_BROWSER_EXECUTABLE || [runtime.executable, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
assert.ok(executable && existsSync(executable), 'Install Chromium with npm run setup:browsers or set DSH_BROWSER_EXECUTABLE.');
const output = path.resolve('test-results');
await mkdir(output, { recursive: true });

{
  const directory = await mkdtemp(path.join(output, 'shared-browser-'));
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><title>Official browser fixture</title><h1>Fixture ${req.url}</h1><button onclick="this.textContent='Clicked'">Click fixture</button>`);
  });
  const ctx = new Context();
  const routes=[], upgrades=[];
  ctx.provide('webServer', {register(route){routes.push(route); return () => {};}, registerUpgrade(route){upgrades.push(route); return () => {};}});
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    let browserConfig = { executablePath: executable, stateDir:path.join(directory,'browsers') }; 
    const modules = new Map([
      ['browserUse', BrowserUse], ['prompt', SystemPrompt], ['tools', Tools], ['llm', Llm],
      ['sessions', Sessions], ['agents', Agents], ['loop', AgentLoop], ['projections', Projections], ['browser', Provider],
    ]);
    const configPath = path.join(directory, 'cordis.yml');
    await writeFile(configPath, JSON.stringify([...modules.keys()].map(name => ({ id: name, name, config: name === 'loop' ? { agents: [] } : name === 'browser' ? browserConfig : {} }))));
    ctx.baseUrl = pathToFileURL(directory).href + '/';
    await ctx.plugin(Loader);
    ctx.loader.builtins.include = Include;
    ctx.loader.internal = { version: 'v2', async import(name) { assert.ok(modules.has(name)); return modules.get(name); } };
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } });
    await ctx.loader.await();
    const owner = await ctx.agents.create({ sessionId: SessionId('browser-one'), meta: { cwd: directory } });
    await owner.agent.whenIdle();
    const schemas = ctx.tools.schemas(owner.agent);
    assert.ok(schemas.length > 5 && schemas.every(tool => tool.name.startsWith('mcp__playwright-mcp__')));
    const call = async (agent, name, args) => {
      const result = await ctx.tools.execute({ agent, name: `mcp__playwright-mcp__${name}`, arguments: args, callId: ToolCallId(crypto.randomUUID()), signal: AbortSignal.timeout(30000) });
      assert.equal(result.isError, false, JSON.stringify(result.content));
      return JSON.stringify(result.content);
    };
    assert.match(await call(owner.agent, 'browser_navigate', { url: `${origin}/one` }), /Page URL: .*\/one/);
    assert.match(await call(owner.agent, 'browser_evaluate', { function: '() => document.querySelector("h1").textContent' }), /Fixture.*one/);
    const other = await ctx.agents.create({ sessionId: SessionId('browser-two'), meta: { cwd: directory } });
    await other.agent.whenIdle();
    const child = await ctx.agents.create({ sessionId: SessionId('browser-child'), parentAgent: owner.agent, meta: { cwd: directory, origin: 'subagent' } });
    await child.agent.whenIdle();
    assert.equal(ctx.tools.schemas(child.agent).filter(tool => tool.name.startsWith('mcp__playwright-mcp__')).length, 0);
    assert.equal(ctx.get('amadeusBrowser').entries.has(child.agent.id), false);
    await child.dispose();
    assert.match(await call(other.agent, 'browser_navigate', { url: origin + '/two' }), /Page URL: .*\/two/);
    assert.match(await call(owner.agent, 'browser_snapshot', {}), /Page URL: .*\/one/);
    assert.match(await call(other.agent, 'browser_snapshot', {}), /Page URL: .*\/two/);
    const manager=ctx.get('amadeusBrowser'); const entry=manager.entries.get(owner.agent.id);
    assert.ok(entry && entry.selected); const firstTarget=entry.selected;
    const route=routes.find(route=>route.path==='/amadeus/browser');
    const controlServer=createServer(route.handler);controlServer.listen(0,'127.0.0.1');await once(controlServer,'listening');
    for(const action of ['take','release','mouse','text','navigate','select','new']) {
      const response=await fetch('http://127.0.0.1:'+controlServer.address().port+'/amadeus/browser/command?session='+owner.agent.id,{method:'POST',body:JSON.stringify({action,browserId:entry.browserId,generation:entry.generation})});
      assert.equal(response.status,403,action+' must be refused for the read-only AI browser');
    }
    await new Promise(resolve=>controlServer.close(resolve));
    await call(owner.agent,'browser_evaluate',{function:'() => document.querySelector("h1").textContent="First page"'});
    await call(owner.agent,'browser_tabs',{action:'new'});
    await call(owner.agent,'browser_navigate',{url:origin+'/one'});
    const secondTarget=entry.selected;assert.notEqual(secondTarget,firstTarget);
    await call(owner.agent,'browser_evaluate',{function:'() => document.querySelector("h1").textContent="Second identical URL"'});
    await call(owner.agent,'browser_tabs',{action:'select',index:0});
    assert.equal(entry.selected,firstTarget);
    assert.match(await call(owner.agent,'browser_evaluate',{function:'() => document.querySelector("h1").textContent'}),/First page/);
    const streamServer=new WebSocketServer({port:0,host:'127.0.0.1'});await once(streamServer,'listening');
    streamServer.on('connection', socket => { void streamPage(manager,entry,entry.selected,socket).catch(() => socket.close(1011)); });
    const viewer=new WebSocket('ws://127.0.0.1:'+streamServer.address().port);viewer.on('error',()=>{});
    const frame=await Promise.race([once(viewer,'message').then(([data])=>JSON.parse(data)),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('No browser frame')),15000); timer.unref();})]);
    assert.equal(frame.targetId,firstTarget);assert.ok(frame.data.length>1000);assert.equal(frame.generation,entry.generation);
    await writeFile(path.join(directory,'shared-browser-frame.jpg'),Buffer.from(frame.data,'base64'));
    viewer.close();await once(viewer,'close');await new Promise(resolve=>streamServer.close(resolve));
    await entry.persistTail;
    const before = JSON.parse(await readFile(path.join(entry.directory,'pages.json'),'utf8'));
    assert.ok(before.pages.some(page => page.url === origin+'/one'));
    const oldGeneration=entry.generation;
    const exit=once(entry.child,'exit'); entry.child.kill(); await exit;
    assert.equal(entry.failed,true);
    const validExecutable=manager.executablePath;
    manager.executablePath=path.join(directory,'missing-browser');
    await assert.rejects(entry.reconnect());
    const retryable=manager.entries.get(owner.agent.id);
    assert.ok(retryable.failed && typeof retryable.reconnect==='function');
    manager.executablePath=validExecutable;
    const restored=await retryable.reconnect();
    assert.ok(restored.generation>oldGeneration);
    assert.ok(restored.savedPages.some(page=>page.url===origin+'/one'));
    await call(owner.agent,'browser_snapshot',{});
    assert.match(await call(owner.agent,'browser_navigate',{url:origin+'/recovered'}),/recovered/);
    await restored.persistTail;
    await manager.closeSession(owner.agent.id);
    const saved=JSON.parse(await readFile(path.join(restored.directory,'pages.json'),'utf8'));
    assert.ok(saved.pages.some(page=>page.url===origin+'/recovered'));
    await other.dispose();
    await owner.dispose();
    assert.deepEqual(ctx.tools.schemas(owner.agent), []);
    console.log('PASS: shared browser, independent conversations, read-only API, stable target identity for identical URLs, streamed JPEG, saved-page recovery, crash reconnection, cleanup');
  } finally {
    await ctx.fiber.dispose();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
