import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { BROWSER_USE_PROVIDER, resolveBrowserUseConfig } from './browser-use-config.mjs';

export const WEBSOCKET_HEARTBEAT_INTERVAL_MS = 15000;
const require = createRequire(import.meta.url);
const officialPlugin = name => pathToFileURL(require.resolve(name)).href;

export function createRuntimePatch({ root, home, config }) {
  const maxPreviewBytes = config.maxPreviewBytes ?? 256 * 1024 ** 2;
  if (!Number.isSafeInteger(maxPreviewBytes) || maxPreviewBytes < 1 || maxPreviewBytes >= Number.MAX_SAFE_INTEGER) {
    throw new Error('maxPreviewBytes must be a positive safe integer smaller than Number.MAX_SAFE_INTEGER (bytes).');
  }
  const plugin = name => path.join(root, 'packages', name, 'dist/index.mjs').replaceAll('\\', '/');
  const inserts = [
    { id: 'amadeus-webserver', name: plugin('login'), inject: ['webStartup'], config: { host: config.host || '0.0.0.0', port: config.port ?? 3080, username: config.username, password: config.password, sessionHours: config.sessionHours ?? 12, compression: 'gzip', compressionLevel: 1, compressionThresholdBytes: 1024 } },
    { id: 'amadeus-files', name: plugin('files'), config: { maxUploadBytes: config.maxUploadBytes ?? 1024 ** 3, workspace: path.resolve(config.workspace || root) } },
    { id: 'amadeus-reader', name: plugin('reader') },
    { id: 'amadeus-editor', name: plugin('editor'), config: { stateDir: path.join(home, 'editor'), upstream: config.editor?.upstream || 'http://127.0.0.1:8080', bridgeDir: config.editor?.bridgeDir || process.env.AMADEUS_EDITOR_BRIDGE_DIR || path.join(home, 'editor/bridge') } },
  ];
  const browserUse = resolveBrowserUseConfig(config);
  if (browserUse) inserts.push(
    // DSH's installation inventory excludes Amadeus's additional npm dependencies.
    // Import the official exports directly so an external DSH_HOME resolves them too.
    { id: 'amadeus-browser-use', name: officialPlugin('@deepseek-ai/dsh-browser-use') },
    ...(browserUse.mode === 'launch' && browserUse.headless !== false ? [{ id: 'amadeus-browser', name: plugin('browser'), config: { stateDir: path.join(home, 'browser'), ...browserUse } }] : [{ id: 'amadeus-browser-use-playwright', name: officialPlugin(BROWSER_USE_PROVIDER), config: browserUse }]),
  );

  return [
    { id: 'webserver', disabled: true },
    { id: 'ui-sidebar-browser', disabled: false },
    { id: 'workspace-files', name: '@deepseek-ai/dsh-api-workspace-files', config: { maxFileBytes: maxPreviewBytes } },
    { id: 'typert-gateway', name: '@deepseek-ai/dsh-api-gateway', config: { websocketHeartbeatIntervalMs: WEBSOCKET_HEARTBEAT_INTERVAL_MS } },
    { insert: inserts },
  ];
}
