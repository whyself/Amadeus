import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { Context } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import { PluginPackages, createRuntimeResolution } from '@deepseek-ai/dsh-app-boot';
import { INSTALL_ANCHOR } from '@deepseek-ai/dsh/profile-boot';
import { createRuntimePatch } from '../scripts/runtime-patch.mjs';
import { resolveBrowserUseConfig } from '../scripts/browser-use-config.mjs';
import { resolveBrowserRuntime, ensurePlaywrightBrowsers } from '../scripts/browser-bootstrap.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const patchFor = config => createRuntimePatch({ root, home: '/home/amadeus', config });

test('official per-Session browser provider replaces the generic MCP connection', () => {
  const patch = patchFor({});
  const inserts = patch.find(row => row.insert).insert;
  const registry = inserts.find(row => row.id === 'amadeus-browser-use');
  assert.match(registry.name, /^file:\/\//);
  assert.ok(existsSync(fileURLToPath(registry.name)));
  const provider = inserts.find(row => row.id === 'amadeus-browser');
  assert.match(provider.name, /packages\/browser\/dist\/index\.mjs$/);
  assert.deepEqual(provider.config, { stateDir: path.join('/home/amadeus', 'browser'), mode: 'launch', headless: true });
  assert.equal(inserts.some(row => row.id === 'amadeus-mcp-playwright'), false);
  assert.equal(patch.some(row => row.id === 'amadeus-mcp-playwright'), false);
});

test('disable and new configuration precedence do not start another browser', () => {
  for (const config of [{ browserUse: { enabled: false } }, { playwrightMcp: { enabled: false } }]) {
    assert.equal(resolveBrowserUseConfig(config), null);
    assert.equal(patchFor(config).find(row => row.insert).insert.some(row => row.id === 'amadeus-browser'), false);
  }
  assert.deepEqual(resolveBrowserUseConfig({ playwrightMcp: { enabled: false }, browserUse: { enabled: true } }), { mode: 'launch', headless: true });
});

test('supported legacy settings migrate; obsolete launch overrides fail explicitly', () => {
  assert.deepEqual(resolveBrowserUseConfig({ playwrightMcp: { headless: false, timeoutMs: 90000, browser: 'chromium', isolated: true } }), { mode: 'launch', headless: false, toolCallTimeoutMs: 90000 });
  for (const old of [{ command: 'custom-mcp' }, { args: ['--headless'] }, { browser: 'firefox' }, { isolated: false }, { idleTimeoutMs: 600000 }]) {
    assert.throws(() => resolveBrowserUseConfig({ playwrightMcp: old }), /Migrate playwrightMcp/);
  }
});

test('launch and attach use the official schema and endpoint validation', () => {
  assert.deepEqual(resolveBrowserUseConfig({ browserUse: { mode: 'launch', executablePath: '/opt/chromium', toolCallTimeoutMs: 90000 } }), { mode: 'launch', headless: true, executablePath: '/opt/chromium', toolCallTimeoutMs: 90000 });
  for (const endpoint of ['http://127.0.0.1:9222', 'ws://127.0.0.1:9222/devtools/browser/id']) {
    assert.deepEqual(resolveBrowserUseConfig({ browserUse: { mode: 'attach', endpoint } }), { mode: 'attach', endpoint });
  }
  for (const input of [{ mode: 'unknown' }, { mode: 'attach' }, { mode: 'attach', endpoint: 'file:///tmp/browser' }, { mode: 'attach', endpoint: 'http://[' }, { headless: 'false' }, { toolCallTimeoutMs: 0 }, { command: 'other' }, { enabled: 'false' }, { mode: 'attach', endpoint: 'http://localhost:9222', headless: true }]) {
    assert.throws(() => resolveBrowserUseConfig({ browserUse: input }));
  }
});

test('bootstrap resolves the official provider runtime instead of the test browser', () => {
  const runtime = resolveBrowserRuntime(root);
  assert.ok(existsSync(runtime.cli));
  assert.ok(runtime.executable);
  assert.equal(runtime.mcpVersion, '0.0.80');
  assert.equal(runtime.providerVersion, '0.2.1-alpha.1');
});

test('the actual DSH loader imports official plugins from a home outside the project', async () => {
  const ctx = new Context();
  ctx.baseUrl = pathToFileURL(path.join(tmpdir(), 'amadeus-external-home', 'profiles', 'amadeus')).href + '/';
  try {
    await ctx.plugin(Loader);
    await ctx.plugin(PluginPackages, { resolution: await createRuntimeResolution({ installAnchor: INSTALL_ANCHOR }) });
    const inserts = patchFor({ browserUse: { mode: 'attach', endpoint: 'http://127.0.0.1:9222' } }).find(row => row.insert).insert;
    const registry = await ctx.loader.import(inserts.find(row => row.id === 'amadeus-browser-use').name);
    const provider = await ctx.loader.import(inserts.find(row => row.id === 'amadeus-browser-use-playwright').name);
    assert.equal(typeof registry.default, 'function');
    assert.equal(typeof provider.apply, 'function');
    assert.deepEqual(provider.inject, ['browserUse', 'agents', 'tools', 'systemPrompt']);
  } finally {
    await ctx.fiber.dispose();
  }
});

test('bootstrap skips disabled, attached and explicitly installed browsers', async () => {
  // A nonexistent project root would fail runtime resolution if these paths did not skip.
  for (const browserUse of [{ enabled: false }, { mode: 'attach', endpoint: 'http://127.0.0.1:9222' }, { executablePath: '/opt/managed-chromium' }]) {
    await ensurePlaywrightBrowsers({ root: '/nonexistent-amadeus', config: { browserUse } });
  }
  await ensurePlaywrightBrowsers({ root: '/nonexistent-amadeus', config: { playwrightMcp: { enabled: false } } });
});
