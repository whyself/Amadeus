# Official Browser Use Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Amadeus's generic Playwright MCP launch wiring with DSH's official per-Session browser-use provider, and document a small shared-sidebar design.

**Architecture:** Mount the official browser registry and Playwright provider at the exact DSH version already used by Amadeus. Resolve Chromium installation through the provider's own pinned runtime so browser preparation, Docker dependencies and runtime execution agree. Keep legacy enable/headless/timeout settings compatible while rejecting obsolete custom launch options with a migration message.

**Tech Stack:** Node 24, Cordis, DSH 0.2.1-alpha.1, official experimental Playwright MCP provider, node:test.

## Evidence and scope

On 2026-10-08 the upstream default branch is `master`, resolving to `5badb15009ae1756c3afe0ae0cef1faafc290ccc`, the same commit as the installed DSH version. Its Sidebar Browser is an iframe on Web and an Electron webview on Desktop; it has no model tools or browser-use resource bridge. The two official npm packages point to the DeepSeek repository. The provider pins `@playwright/mcp` to `0.0.80`, rather than Amadeus's former direct `0.0.82` dependency.

This change installs and enables the official provider. Sharing the sidebar instance is a design deliverable here; it is not implemented by this migration.

### Task 1: Dependencies and configuration

**Files:** `package.json`, `package-lock.json`, `scripts/runtime-patch.mjs`, `scripts/browser-use-config.mjs`, `tests/browser-use.test.mjs`.

- [x] Add production dependencies and remove the direct MCP devDependency:

```json
"@deepseek-ai/dsh-browser-use": "0.2.1-alpha.1",
"@deepseek-ai/dsh-experimental-browser-use-playwright-mcp": "0.2.1-alpha.1"
```

- [x] Add configuration resolution and mount these entries only when enabled:

```js
{ id: 'amadeus-browser-use', name: '@deepseek-ai/dsh-browser-use' }
{ id: 'amadeus-browser-use-playwright', name: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp', config: { mode: 'launch', headless: true } }
```

The actual patch resolves these official package exports to file URLs from Amadeus's installed dependencies. DSH's CLI installation inventory only covers its own dependency graph; bare new package names cannot be resolved from an external profile directory. This is direct loading of the unmodified official exports, with no dependency patch or replacement provider.

New `browserUse` takes precedence over legacy `playwrightMcp`. Legacy `enabled`, `headless`, `timeoutMs` and `browser: chromium` migrate; unsupported nonempty options produce a configuration error rather than silently changing execution. Use the upstream Config schema and endpoint validator before startup.

- [x] Verify defaults, disable, precedence, launch/attach validation, legacy migration and absence of the old generic MCP entry:

```js
assert.equal(inserts.some(row => row.id === 'amadeus-mcp-playwright'), false);
assert.equal(provider.config.mode, 'launch');
assert.equal(provider.config.headless, true);
```

Run `npm install`, then `node --test tests/browser-use.test.mjs`; expect all tests to pass and one consistent DSH version.

### Task 2: Browser installation and deployment

**Files:** `scripts/browser-bootstrap.mjs`, `scripts/setup-browsers.mjs`, `scripts/start.mjs`, `Dockerfile`, `amadeus.example.yml`, `amadeus.docker.example.yml`, `docs/guide-deployment.md`, `README.md`.

- [x] Resolve `@playwright/mcp/package.json` from the official provider's package path, then resolve `playwright/package.json` and `playwright-core` from that MCP location. Both startup checks and explicit setup use that executable revision.
- [x] Default startup skips installation when disabled, in attach mode, with an explicit executable, or when Chromium already exists. Remove the old output-directory and custom-MCP launch paths.
- [x] Add an explicit installer supporting `--deps-only` and `--with-deps`; invoke the resolved Playwright CLI with `install-deps chromium` or `install [--with-deps] chromium`, without a shell.
- [x] Use `npm run setup:browsers -- --deps-only` in Docker and the deployment guide. User installation uses `npm run setup:browsers`.
- [x] Document this configuration:

```yaml
browserUse:
  enabled: true
  mode: launch
  headless: true
```

Document `mode: attach` with `endpoint`, the official tool namespace, and the upstream lifetime/idle behavior. Do not claim automatic sidebar sharing.

### Task 3: Verification and shared-browser design

**Files:** `tests/browser-use.test.mjs`, `tests/browser-use-live.mjs`, this document.

- [x] Run `npm test`, `npm run build`, and inspect official provider runtime resolution. Run a live, model-free integration against a local controlled page to establish Session ownership, real tool discovery and browser isolation. If Linux sandbox flags differ from the old integration, verify the pinned runtime's launch defaults before asserting Docker compatibility.
- [x] Record results and the design below. Preserve unrelated local changes; no commit or release is part of this request.

## Verification results

- Windows unit suite and four-plugin build pass; the Windows-only filesystem fixture is skipped as before.
- `npm run test:browser-use-live` passes launch and attach using installed Edge on Windows. Launch gives two Sessions independent current pages. Attach excludes a second Session, and Session disposal retains the external browser and its page.
- The same live test passes inside a disposable Linux Docker container using new source and dependencies mounted into an existing Amadeus image. The new bootstrap installed the official provider's Chromium revision `1243` into the container. This is a runtime compatibility check, not a fresh production image build.
- The official MCP `--browser chromium` resolves to `chrome-for-testing`; its pinned runtime disables Chromium sandbox by default for this channel on Linux. No custom sandbox shim is needed.
- Review caught the installation-inventory issue described in Task 1. A regression test now uses DSH's actual PluginPackages/Loader with an external profile base and imports both generated file URLs. Actual `scripts/start.mjs` also reached the settled `dsh web:` announcement and served the expected authentication challenge with browser use enabled.
- No model API, user browser data, production service or existing private configuration was used. Test state lives under ignored `test-results/`.

## Shared sidebar: smallest viable next change

ZCode at `29628c9acdb81b703bbd4080c207a0e7ce5e276e` uses a stable Electron `<webview>` guest for visible browser tabs. Its main process attaches `webContents.debugger` to that exact guest; both user and agent operate the same page. Relevant files are `packages/ui/src/browser-use/UnifiedBrowserView.tsx`, `packages/ui/src/browser-use/BrowserViewportSurface.tsx`, and `packages/desktop/src/main/browserView/browserGuestManager.ts`.

For Amadeus Web, target the existing sidebar browser surface with a remote-page adapter: server Chromium target -> CDP screencast -> authenticated WebSocket -> canvas; user input travels back to the same target. Reuse sidebar tab identities and browser toolbar. Do not load a second copy of the target URL in an iframe.

The official launch provider exposes no public browser/page handle or debugging endpoint. Thus adding a canvas alone cannot connect to its browser. A minimal proof can use an Amadeus-owned Chromium and the official provider's supported `mode: attach`, with the viewer connected to the same endpoint and page. Stock attach admits one active Session and does not dynamically transfer ownership when switching chats. For independent browser instances per chat, the smallest sustainable upstream extension is a Session-owned endpoint/page discovery hook in the official launch provider; avoid editing compiled dependency internals or starting multiple global providers.

Initial UI: address/back/forward/reload, live picture, and one control-state button (AI / user). User takeover blocks new AI browser calls and waits for in-flight work; resuming AI requires a fresh page snapshot. Session and exact target IDs bind all viewing and input operations. Keep CDP on the server's loopback interface and transport only authenticated, scoped picture/input messages through Amadeus.

## Sources

- [DSH sidebar](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/client/ui-sidebar-browser/README.zh.md)
- [DSH browser use](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/subsystems/browser-use.zh.md)
- [Official Playwright provider](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/experimental/browser-use-playwright-mcp/src/index.ts)
- [ZCode unified view](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/packages/ui/src/browser-use/UnifiedBrowserView.tsx)
- [ZCode guest manager](https://github.com/zai-org/ZCode/blob/29628c9acdb81b703bbd4080c207a0e7ce5e276e/packages/desktop/src/main/browserView/browserGuestManager.ts)
