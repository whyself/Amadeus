import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { BROWSER_USE_PROVIDER, resolveBrowserUseConfig } from './browser-use-config.mjs';

// Resolve through the provider so npm hoisting cannot select the test runtime.
export function resolveBrowserRuntime(root) {
  const projectRequire = createRequire(path.join(root, 'package.json'));
  const providerPath = projectRequire.resolve(`${BROWSER_USE_PROVIDER}/package.json`);
  const providerRequire = createRequire(providerPath);
  const mcpPath = providerRequire.resolve('@playwright/mcp/package.json');
  const mcpRequire = createRequire(mcpPath);
  const playwrightPath = mcpRequire.resolve('playwright/package.json');
  const core = mcpRequire('playwright-core');
  return {
    cli: path.join(path.dirname(playwrightPath), 'cli.js'),
    executable: core.chromium.executablePath(),
    providerVersion: projectRequire(providerPath).version,
    mcpVersion: providerRequire(mcpPath).version,
  };
}

export async function installBrowserRuntime(root, { dependenciesOnly = false, withDependencies = false } = {}) {
  const runtime = resolveBrowserRuntime(root);
  const args = dependenciesOnly ? ['install-deps', 'chromium'] : ['install', ...(withDependencies ? ['--with-deps'] : []), 'chromium'];
  const child = spawn(process.execPath, [runtime.cli, ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`Browser runtime installation exited with code ${code}`)));
  });
}

export async function ensurePlaywrightBrowsers({ root, config }) {
  const browserUse = resolveBrowserUseConfig(config);
  if (!browserUse || browserUse.mode === 'attach' || browserUse.executablePath) return;
  const runtime = resolveBrowserRuntime(root);
  if (existsSync(runtime.executable)) return;
  console.log('[Amadeus] 正在准备 DSH 官方 browser use 插件所需的 Chromium...');
  // Fail before startup: the official provider cannot create Sessions without its runtime.
  await installBrowserRuntime(root);
}

