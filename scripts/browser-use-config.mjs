import { Config } from '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp';
import { validateBrowserMcpConfig } from '@deepseek-ai/dsh-experimental-browser-use-runtime/mcp';

export const BROWSER_USE_PROVIDER = '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp';

export function resolveBrowserUseConfig(config = {}) {
  let input = config.browserUse;
  if (input === undefined && config.playwrightMcp !== undefined) {
    const legacy = config.playwrightMcp;
    if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) throw new Error('playwrightMcp must be an object; migrate to browserUse.');
    if (legacy.enabled === false) return null;
    const supported = new Set(['enabled', 'headless', 'timeoutMs', 'browser', 'isolated']);
    const unsupported = Object.keys(legacy).filter(key => !supported.has(key));
    if (unsupported.length || (legacy.browser !== undefined && legacy.browser !== 'chromium') || legacy.isolated === false) {
      throw new Error(`Migrate playwrightMcp to browserUse: the official provider supports isolated Chromium launch or an explicit attach endpoint; obsolete options: ${unsupported.join(', ') || 'browser/isolated'}.`);
    }
    input = { enabled: legacy.enabled, mode: 'launch', headless: legacy.headless, toolCallTimeoutMs: legacy.timeoutMs };
  }
  input ??= {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('browserUse must be an object.');
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw new Error('browserUse.enabled must be a boolean.');
  if (input.enabled === false) return null;
  const mode = input.mode ?? 'launch';
  const allowed = new Set(['enabled', 'mode', 'toolCallTimeoutMs', ...(mode === 'attach' ? ['endpoint'] : ['headless', 'executablePath'])]);
  const unknown = Object.keys(input).filter(key => !allowed.has(key));
  if (unknown.length) throw new Error(`Unsupported browserUse options for ${mode}: ${unknown.join(', ')}.`);
  const { enabled, ...settings } = input;
  const resolved = Config({ ...settings, mode });
  validateBrowserMcpConfig(resolved);
  return resolved;
}
