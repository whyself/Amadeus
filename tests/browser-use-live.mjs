// Model-free integration based on DSH's MIT-licensed browser-use upstream e2e harness.
// Exercises the installed official provider, real MCP and disposable Chromium.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
import * as Provider from '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp';
import { resolveBrowserRuntime } from '../scripts/browser-bootstrap.mjs';

const runtime = resolveBrowserRuntime(process.cwd());
const executable = process.env.DSH_BROWSER_EXECUTABLE || [runtime.executable, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
assert.ok(executable && existsSync(executable), 'Install Chromium with npm run setup:browsers or set DSH_BROWSER_EXECUTABLE.');
const output = path.resolve('test-results');
await mkdir(output, { recursive: true });

for (const mode of ['launch', 'attach']) {
  const directory = await mkdtemp(path.join(output, `official-browser-${mode}-`));
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><title>Official browser fixture</title><h1>Fixture ${req.url}</h1><button onclick="this.textContent='Clicked'">Click fixture</button>`);
  });
  const ctx = new Context();
  let external, externalExit;
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    let browserConfig = { mode: 'launch', headless: true, executablePath: executable };
    if (mode === 'attach') {
      const profile = path.join(directory, 'external-profile');
      external = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--no-sandbox', 'about:blank'], { stdio: 'ignore', windowsHide: true });
      externalExit = once(external, 'exit');
      const deadline = Date.now() + 20000;
      let port;
      while (!port && Date.now() < deadline) {
        if (external.exitCode !== null) throw new Error(`External browser exited: ${external.exitCode}`);
        try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch {}
        if (!port) await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.ok(Number(port) > 0, 'External browser exposes a debugging endpoint');
      browserConfig = { mode: 'attach', endpoint: `http://127.0.0.1:${port}` };
    }
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
    const owner = await ctx.agents.create({ sessionId: SessionId(`browser-${mode}-one`), meta: { cwd: directory } });
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
    const other = await ctx.agents.create({ sessionId: SessionId(`browser-${mode}-two`), meta: { cwd: directory } });
    await other.agent.whenIdle();
    if (mode === 'launch') {
      assert.match(await call(other.agent, 'browser_navigate', { url: `${origin}/two` }), /Page URL: .*\/two/);
      assert.match(await call(owner.agent, 'browser_snapshot', {}), /Page URL: .*\/one/);
      assert.match(await call(other.agent, 'browser_snapshot', {}), /Page URL: .*\/two/);
    } else {
      assert.equal(ctx.tools.schemas(other.agent).filter(tool => tool.name.startsWith('mcp__playwright-mcp__')).length, 0);
      const pages = await (await fetch(`${browserConfig.endpoint}/json/list`)).json();
      assert.ok(pages.some(page => page.url === `${origin}/one`));
    }
    await other.dispose();
    await owner.dispose();
    assert.deepEqual(ctx.tools.schemas(owner.agent), []);
    if (mode === 'attach') {
      assert.equal(external.exitCode, null);
      const pages = await (await fetch(`${browserConfig.endpoint}/json/list`)).json();
      assert.ok(pages.some(page => page.url === `${origin}/one`));
    }
    console.log(`PASS: official provider ${mode}, real page navigation, ${mode === 'launch' ? 'independent Session pages' : 'exclusive Session ownership and retained external browser'}, cleanup`);
  } finally {
    await ctx.fiber.dispose();
    if (external && external.exitCode === null) external.kill('SIGTERM');
    if (externalExit) await externalExit;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
