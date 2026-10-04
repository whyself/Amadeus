# Changelog

## 1.2.0-rc.1 — 2026-10-02 (prerelease; updated 2026-10-04)

### New Features

- Use the DSH native workspace file tree for browsing, natural sorting, directory expansion, automatic refresh, and preview navigation. Keep Amadeus upload, ZIP download, collision handling, confirmed deletion, and code-server actions. by [**@whyself**](https://github.com/whyself)
- Keep exact file, page, and Markdown heading links in annotations so agent-authored notes retain their sources. by [**@YJC18368291437-ai**](https://github.com/YJC18368291437-ai), [**@whyself**](https://github.com/whyself)
- Inherit native draft restoration with file, folder, and session references, plus unsent initial prompts for new sessions. by [**@imccyu**](https://github.com/imccyu)
- Inherit the native “Let Agent create a plugin” entry, preserving drafts until the request is sent. by [**@ZiyaZhang**](https://github.com/ZiyaZhang)
- Display YAML frontmatter as readable fields in native Markdown previews. by [**@turtle2099**](https://github.com/turtle2099)
- Support the native Web `--public-url` flag for the advertised browser/model address. Amadeus CLI forwards it; Amadeus routes and PWA assets currently require deployment at the origin root. by [**@oraluben**](https://github.com/oraluben)
- Include upstream experimental Claude Code Mods compatibility and optional Developer Tools support. Mods compatibility is exploratory; embedded DevTools currently uses English. by [**@tianyicui**](https://github.com/tianyicui), [**@imccyu**](https://github.com/imccyu)

### Bug Fixes

- Restore rendered, clickable annotation references in assistant replies. Resolve turn-opening user messages outside the turn index, preserve references during streaming, and load distant PDF pages and cross-page selections before locating and highlighting the quoted source. by [**@whyself**](https://github.com/whyself)
- Stop later plain requests from inheriting stale annotation references and use the reply’s session when opening its source. by [**@whyself**](https://github.com/whyself)
- Use native multiline goal and queued-message editing, including Shift+Enter, IME guards, and responsive sizing. The separate Amadeus chat-composer seed fix remains necessary. by [**@turtle2099**](https://github.com/turtle2099)
- Use the native fix for messages remaining queued after repeatedly stopping and resuming goal-driven tasks. by [**@turtle2099**](https://github.com/turtle2099)
- Use native output/diff expansion fixes for Bash, PowerShell, and file mutations. by [**@turtle2099**](https://github.com/turtle2099)
- Use native plugin style ownership and cleanup so toggling one plugin preserves styles belonging to others. by [**@turtle2099**](https://github.com/turtle2099)
- Use native bundle dependency mapping and development-directory reload fixes. Replacing an installed package version still requires a restart. by [**@imccyu**](https://github.com/imccyu)
- Keep Standard, Creator, and custom modes available when coding view is disabled; existing sessions retain their mode. by [**@ZiyaZhang**](https://github.com/ZiyaZhang)
- Remove the obsolete queue wrapper that read `state.queue` and caused composer rendering errors. by [**@whyself**](https://github.com/whyself)
- Improve Safari missing-API/PDF-worker compatibility and touch scrolling, page-zoom prevention, and standalone editing. by [**@YJC18368291437-ai**](https://github.com/YJC18368291437-ai), [**@whyself**](https://github.com/whyself)
- Preserve the editor workbench after closing clean tabs and restore its file-tree layout while protecting unsaved content. by [**@YJC18368291437-ai**](https://github.com/YJC18368291437-ai), [**@whyself**](https://github.com/whyself)
- Preserve POSIX filenames containing literal backslashes and bind deletion confirmation to the exact path and current version. by [**@whyself**](https://github.com/whyself)
- Restore light, dark, and system-following editor appearance controls with the DSH 0.2 icon API and preserve saved preferences. by [**@whyself**](https://github.com/whyself)

### Improvements

- Use native PDF/Office selection colors and remove obsolete custom PDF and file-tree styling. by [**@whyself**](https://github.com/whyself)
- Synchronize editor, activity bar, file sidebar, and status bar colors using Modern light/dark themes while preserving custom overrides. by [**@whyself**](https://github.com/whyself)
- Inherit compact Automation task details and clearer bundle version, code-source, and exact-version installation information. by [**@turtle2099**](https://github.com/turtle2099), [**@turtle1999**](https://github.com/turtle1999)
- Show tool command descriptions, file paths, and generation progress while calls are preparing. by [**@imccyu**](https://github.com/imccyu)
- Speed up large session listings while periodically allowing other work to run. by [**@turtle1999**](https://github.com/turtle1999)
- Clarify service deployment and connection options in the deployment guide. by [**@YJC18368291437-ai**](https://github.com/YJC18368291437-ai), [**@whyself**](https://github.com/whyself)

### Chores

- Pin DSH and WebServer to `0.2.1-alpha.1`, Cordis to `4.0.5-alpha.1`, and Schemastery to `3.18.5-alpha.1`. Keep Amadeus and all four plugin packages at `1.2.0-rc.1` and rebuild the lockfile and release archives. Rotate the PWA cache revision so existing RC1 installs fetch the updated assets. by [**@whyself**](https://github.com/whyself)
- Remove the Safari intrinsic-constructor dependency patch and its patch-specific tests; use and verify upstream cross-realm validation directly in Chromium and WebKit. by [**@whyself**](https://github.com/whyself)
- Use built-in Web Automation with reminders available in Standard, Creator, and PTC modes. Minimal mode and subagents do not receive reminder tools; retired experimental selections are cleaned up and existing tasks are retained. by [**@Chinesezjc**](https://github.com/Chinesezjc), [**@turtle1999**](https://github.com/turtle1999)
- Adopt native subpath metadata exports, removal of runtime invariant plugins, and separate composer `activity`/`usage` entries. Third-party extensions using the removed entry points must be updated. by [**@turtle1999**](https://github.com/turtle1999), [**@turtle2099**](https://github.com/turtle2099)
- Publish rebuilt Login, Files, Reader, and Editor archives with `SHA256SUMS`; validate Node tests, browser regressions, Docker startup, real code-server synchronization, XeLaTeX, LibreOffice, native PDF/Office previews, IME, and PWA behavior. by [**@whyself**](https://github.com/whyself)
- Upgrade by saving editor content, backing up configuration/workspace/data, fetching the refreshed RC1 tag with `git fetch --force origin tag v1.2.0-rc.1`, switching to it, and running `docker compose up -d --build`. Keep the existing Compose project and data volume, then refresh the browser. by [**@whyself**](https://github.com/whyself)

## 1.1.3 — 2026-09-26

### Bug Fixes

- Fix a save race on Android tablets and slow clients by acknowledging the disk version immediately after a successful save, preventing the editor’s own writes from being reported as external changes. by [**@whyself**](https://github.com/whyself)
- Preserve unsaved drafts when another process changes a file; reload only after explicit confirmation. by [**@whyself**](https://github.com/whyself)

### Chores

- Align all four plugins and the PWA cache at `1.1.3`; pass 65 Node tests, build/package/checksum checks, and Docker startup verification. by [**@whyself**](https://github.com/whyself)

## 1.1.2 — 2026-09-25

### New Features

- Add an installable PWA with a manifest, service worker, 192/512 icons, separate caches, and mobile metadata for desktop browsers and Android tablets. by [**@whyself**](https://github.com/whyself)
- Support PWA bootstrap and installation over Tailscale HTTPS. Serve manifest, worker, and icons before login while keeping business HTTP and WebSocket routes behind Basic Auth. by [**@whyself**](https://github.com/whyself)

### Bug Fixes

- Restore the conversation-collapse animation with the native 0.3-second grid transition and respect reduced-motion preferences. by [**@whyself**](https://github.com/whyself)

### Chores

- Use local port `3080` by default, align all four plugins at `1.1.2`, and verify 64 Node tests, builds, package checksums, Docker deployment, and HTTPS service-worker registration. by [**@whyself**](https://github.com/whyself)

## 1.1.1 — 2026-09-25

### New Features

- Enable the native isolated HTTP(S) browser in the right sidebar and inherit DSH terminal restoration, archived-session management, change review, and expanded Office/CSV/TSV previews. by [**@whyself**](https://github.com/whyself)

### Bug Fixes

- Refresh open editor documents even when the browser is unfocused or Windows/Docker mounts miss file events, using extension-owned lifecycle tracking, directory events, and per-file metadata checks. by [**@whyself**](https://github.com/whyself)
- Refresh only the changed code-server text model without switching tabs. Preserve dirty drafts, persist conflicts across reconnects, and retry failed reloads. by [**@whyself**](https://github.com/whyself)
- Prevent Ctrl+P inside the LaTeX Workshop PDF webview from bypassing the outer print guard. by [**@whyself**](https://github.com/whyself)

### Improvements

- Defer layout and painting for settled assistant messages outside the viewport with native `content-visibility`, while keeping streaming output immediate. by [**@whyself**](https://github.com/whyself)
- Replace Amadeus PDF controls with DSH native zoom, scale selection, and fit-width controls; remove duplicated frontend synchronization subscriptions. by [**@whyself**](https://github.com/whyself)

### Chores

- Upgrade DSH/WebServer through `0.1.7-rc.1` to `0.1.7-rc.2` and align Login, Files, Reader, and Editor at `1.1.1`. by [**@whyself**](https://github.com/whyself)
- Pass 60 Node tests, builds, packaging, Docker startup, and real code-server regressions for host writes, atomic replacement, multiple documents, and dirty-draft protection. by [**@whyself**](https://github.com/whyself)

## 1.1.0 — 2026-09-24

### New Features

- Open files in the native DSH preview by default and offer explicit code-server edit actions from the file list and sidebar start page. by [**@whyself**](https://github.com/whyself)
- Use one comment editor and blue confirmation flow for conversation, document, and code selections; let assistant annotation references navigate to the source. by [**@whyself**](https://github.com/whyself)
- Add separate editor appearance settings, code-font shortcuts, live English labels, and an animated conversation-collapse action. by [**@whyself**](https://github.com/whyself)

### Bug Fixes

- Stabilize code-server startup, file switching, and restored workspace state so the first opened file does not overwrite the previous view; retain clear annotation markers in dark mode. by [**@whyself**](https://github.com/whyself)

### Improvements

- Organize file classification and sidebar components, rewrite Docker Compose deployment guidance, and retain native connection/recovery indicators. by [**@whyself**](https://github.com/whyself)

### Chores

- Release four `1.1.0` plugin packages with DSH `0.1.6-alpha.2`, code-server `4.104.2`, and LaTeX Workshop `10.9.0`; verify Node, browser, Docker, and real editor workflows. by [**@whyself**](https://github.com/whyself)

## 1.1.0-alpha.2 — 2026-09-23 (prerelease)

### New Features

- Add the `dsh-amadeus-editor` plugin with authenticated same-origin code-server HTTP/WebSocket proxying, persistent per-workbench VS Code workspaces, and a private file/selection/save-state bridge. by [**@whyself**](https://github.com/whyself)
- Move editing, saves, undo/redo, and Markdown preview to code-server; attach editor selections to existing DSH annotation conversations. by [**@whyself**](https://github.com/whyself)
- Add Docker Compose with TeX Live, XeLaTeX, latexmk, Biber, Chinese fonts, and LaTeX Workshop for native server-side compilation. by [**@whyself**](https://github.com/whyself)
- Add connection latency display and a configurable native file-preview read limit. by [**@whyself**](https://github.com/whyself)

### Bug Fixes

- Retain editor iframes, drafts, and workspace identity across DSH tab changes, floating/fullscreen layouts, and cold-start restoration. by [**@whyself**](https://github.com/whyself)
- Forward code-server and extension dynamic-port WebSockets and keep Chinese PDF fonts under the authenticated proxy path. by [**@whyself**](https://github.com/whyself)
- Improve Chinese IME composition and native PDF zoom/page controls. by [**@whyself**](https://github.com/whyself)

### Improvements

- Use code-server and LaTeX Workshop native buttons, shortcuts, and TeX context menus; remove the duplicated action bar. by [**@whyself**](https://github.com/whyself)

### Chores

- Remove the custom CodeMirror editor, draft/merge manager, Markdown renderer/print components, SwiftLaTeX assets, and old source/artifact/texlive routes. by [**@whyself**](https://github.com/whyself)
- Remove `maxTextBytes`, `kpsewhich`, and `texliveUpstream`; add `editor.upstream` and `editor.bridgeDir`. Save old unsaved browser drafts before migration because VS Code cannot import them. by [**@whyself**](https://github.com/whyself)
- Align the workspace and four plugins at `1.1.0-alpha.2`, pin DSH `0.1.6-alpha.2`, and pass 50 Node tests, lifecycle regressions, packaging, Compose checks, and real Docker Markdown/Chinese TeX/PDF/Biber workflows. by [**@whyself**](https://github.com/whyself)

## 1.1.0-alpha.1 — 2026-09-22 (prerelease)

### New Features

- Integrate native DSH PDF/Office text layers with annotation page provenance and reference navigation. by [**@whyself**](https://github.com/whyself)
- Write generated LaTeX PDFs into the workspace and preview them through the same native sidebar route as uploaded documents; add bounded atomic artifact uploads. by [**@whyself**](https://github.com/whyself)
- Improve PDF/Office selection visibility with a blue text-layer selection color. by [**@whyself**](https://github.com/whyself)

### Bug Fixes

- Adapt active-session capture, sidebar split handling, and the branded conversation headline to DSH `0.1.6-alpha.2` APIs. by [**@whyself**](https://github.com/whyself)

### Improvements

- Use native sidebar file previews and terminals; delegate Office conversion to DSH’s LibreOffice-based converter with Excel support. by [**@whyself**](https://github.com/whyself)

### Chores

- Remove the custom `open_sidebar` tool/SSE channel, terminal plugin, ONLYOFFICE pipeline, cached/page reader routes, and obsolete conversion settings. by [**@whyself**](https://github.com/whyself)
- Remove the generated-PDF viewer, custom zoom/page/pinch components, and reader-owned PDF.js worker/font/WASM assets; retain SwiftLaTeX and KaTeX for this historical version. by [**@whyself**](https://github.com/whyself)
- Release workspace/Reader `1.1.0-alpha.1`, Files `1.0.3`, and Login `1.0.1` on DSH `0.1.6-alpha.2`. by [**@whyself**](https://github.com/whyself)

## 1.0.3 — 2026-09-21

### Bug Fixes

- Fix repeated Markdown compilation/adjacent preview causing document recreation loops, browser stalls, and growing memory use. by [**@whyself**](https://github.com/whyself)
- Reclaim document records only after both owners and subscribers are gone, defer cleanup to a microtask, recheck object identity, and preserve dirty/saving documents. by [**@whyself**](https://github.com/whyself)
- Notify a snapshot of listeners so resubscription cannot extend the same notification loop. by [**@whyself**](https://github.com/whyself)
- Reuse an existing split pane and open previews after its update to prevent duplicate previews. by [**@whyself**](https://github.com/whyself)

### Chores

- Add lifecycle and subscription regressions; verify 77 tests with one unconfigured ONLYOFFICE integration test skipped, build/package checks, and repeated-preview browser checks. by [**@whyself**](https://github.com/whyself)
- Set workspace/Reader to `1.0.3`, retain Files `1.0.2` and Login/Terminal `1.0.1`, and build release assets from clean tagged source. by [**@whyself**](https://github.com/whyself)

## 1.0.2 — 2026-09-20

### New Features

- Integrate Playwright MCP for agent browser navigation, form actions, screenshots, and DOM inspection, with automatic Chromium runtime setup. by [**@whyself**](https://github.com/whyself)
- Add the `open_sidebar` tool and an SSE delivery channel so the agent can open generated resources and focus sidebar tabs. by [**@whyself**](https://github.com/whyself)

### Improvements

- Stop idle Playwright browsers after 10 minutes using `--idle-timeout 600000`; restart them on subsequent use. by [**@whyself**](https://github.com/whyself)

### Chores

- Adapt the integration to Cordis 4 sandbox dependency injection and pass 74 automated tests. by [**@whyself**](https://github.com/whyself)

## 1.0.1 — 2026-09-19

### Bug Fixes

- Increase the DSH WebSocket heartbeat interval from 2 to 15 seconds and declare disconnection after approximately 30 seconds without replies, reducing false disconnects on slow or unstable connections. by [**@whyself**](https://github.com/whyself)

### Improvements

- Retain automatic reconnection and visible connection status while preserving directory/text polling behavior. by [**@whyself**](https://github.com/whyself)

## 1.0.0 — 2026-09-18

### New Features

- Add paginated PDF, Word, and PowerPoint reading with selectable text, zoom, page navigation, mobile gestures, and Range requests. by [**@whyself**](https://github.com/whyself)
- Convert Office documents to cached reading PDFs through ONLYOFFICE Document Builder. by [**@whyself**](https://github.com/whyself)
- Add safe Markdown rendering, KaTeX formulas, same-tab/adjacent previews, and print export. by [**@whyself**](https://github.com/whyself)
- Compile LaTeX in the browser with SwiftLaTeX XeTeX/dvipdfmx, Chinese text, `ctexart`, TikZ, PDF text layers, and downloads. by [**@whyself**](https://github.com/whyself)
- Add CodeMirror 6 editing, syntax highlighting, wrapping, font-size controls, undo/redo, and save shortcuts. by [**@whyself**](https://github.com/whyself)
- Track unsaved changes, confirm closes, refresh external file changes, and support atomic versioned saves, automatic merges, and three-way conflict editing. by [**@whyself**](https://github.com/whyself)
- Add file/conversation annotations, sent annotation summaries, assistant reference links, hover details, and source highlighting. by [**@whyself**](https://github.com/whyself)
- Add workspace uploads, downloads, ZIP archives, deletion, and polling; provide persistent WebSocket terminals with restored sessions. by [**@whyself**](https://github.com/whyself)
- Add Amadeus branding, logo, theme, and the “El Psy Kongroo” home page. by [**@whyself**](https://github.com/whyself)

### Chores

- Establish Basic Auth, HTTPS/nginx and systemd templates, workspace boundaries, symlink-escape protection, transfer/preview limits, and the single-user permission model. by [**@whyself**](https://github.com/whyself)
- Establish Node.js 24 builds, four standalone DSH plugin archives, and the test baseline. by [**@whyself**](https://github.com/whyself)
- Breaking change: unify project namespaces, routes, plugin IDs, DOM extension points, and cache keys under `amadeus`; use `amadeus.local.yml`, `AMADEUS_CONFIG`, `.amadeus/dsh-home`, the `amadeus` profile, and `amadeus.service`. by [**@whyself**](https://github.com/whyself)
