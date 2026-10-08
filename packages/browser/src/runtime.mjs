import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const provider = require.resolve('@deepseek-ai/dsh-experimental-browser-use-playwright-mcp/package.json');
const providerRequire = createRequire(provider);
const mcp = providerRequire.resolve('@playwright/mcp/package.json');
const mcpRequire = createRequire(mcp);
export const chromium = mcpRequire('playwright-core').chromium;
export const mcpCli = path.join(path.dirname(mcp), 'cli.js');
