# Annotation Rendering and Editor PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Restore annotation references in the local deployment and support annotation creation from LaTeX Workshop PDF text selections inside code-server.

**Architecture:** First align the local container with the repository's complete runtime, which already fixes lookup of turn-opening annotation messages. Then bridge selection events from the nested PDF viewer to EditorTab and reuse Reader's existing annotation popup and store. Keep PDF provenance tied to the owning session/workbench and resolve absolute viewer file URIs against that session's workspace on the server.

**Tech Stack:** Node.js 24, DSH 0.2.1-alpha.1, React, code-server 4.104.2, LaTeX Workshop 10.9.0, PDF.js, Playwright, Docker.

---

## Evidence gathered on 2026-10-08

- Local container: `amadeus-desktop`, exposed at `127.0.0.1:3080`.
- Inspected the newest conversation, “南大计算方法第三次作业下载”, and loaded turn 40. The answer's `[注释 1]` is one complete text node. It has no `amadeus-assistant-annotations` wrapper and no annotation reference button. The failure occurs before DOM decoration.
- The container's Reader still searches only `snapshot.locations.getTurn(...)` for annotation source messages. The repository uses `findAnnotationSource(snapshot, assistant)`, which searches ordered user/steering nodes preceding the answer and resets context for a subsequent plain request.
- The container's installed `dsh`, `dsh-client-ui-chat`, and `dsh-client-ui-renderer` are all `0.2.0-rc.2`; the repository pins `0.2.1-alpha.1`. A browser-only Reader replacement is insufficient to validate the complete upgrade. No service restart or deployment was performed during diagnosis.
- `packages/editor/extension/extension.cjs` implements `selection` through `activeTextEditor.document.getText(current.selection)`. It cannot read the browser Selection of a PDF.js viewer.
- Reader listens to the outer document and the `amadeus:editor-selection` event. PDF viewer selection events do not bubble across nested iframe documents, and there is currently no PDF selection message bridge.
- LaTeX Workshop's `utils.parseURL().pdfFileUri` identifies the actual PDF. Its viewer URL encodes the URI using base64url of `encodeURIComponent`; do not infer the PDF filename from the active `.tex` editor.
- Existing checks passed: 12 reader/viewer-patch unit tests and `tests/annotation-browser.mjs`. These checks do not exercise the complete local deployment or nested code-server PDF selection.

## Task 1: Align the deployment and verify real references

**Files:**
- Inspect: `packages/reader/src/annotations.mjs`, `packages/reader/src/client.jsx`, `package-lock.json`, `Dockerfile`.
- Test: `tests/reader.test.mjs`, `tests/annotation-browser.mjs`.
- Extend: a live annotation browser regression under `tests/`, configured through a private configuration path rather than committed credentials.

- [x] Run the existing source-context regression and annotation browser checks:

```powershell
node --test tests/reader.test.mjs tests/latex-workshop-patch.test.mjs
node tests/annotation-browser.mjs
node scripts/build.mjs reader editor
```

Expected: the 12 tests pass; browser references, streaming updates, provenance, source highlighting, and plain-request reset pass; both plugins build.

- [x] Build the complete repository image and verify its installed DSH packages are `0.2.1-alpha.1`. Preserve the local deployment's configuration, workspace mount and named data volume. Before any container replacement, back up the data and explicitly account for migration from DSH `0.2.0-rc.2`. Deploy only when deployment is requested.
- [x] In the aligned deployment, open the existing newest conversation and load turn 40. Assert against the actual answer:

```javascript
const answer = page.locator('[data-chat-anchor-key="14:assistant-step40:1"]');
const reference = answer.getByRole('button', { name: '查看注释 1', exact: true });
await expect(reference).toBeVisible();
await reference.hover();
await expect(page.getByRole('tooltip')).toBeVisible();
```

- [x] Click the reference and verify its original file/page/quote are used. Check another historical annotated answer and a later plain request. If the aligned deployment still fails, capture the source node selected by the actual ChatSnapshot before changing the decorator.

## Task 2: Bridge nested PDF selections

**Files:**
- Create: `packages/editor/src/pdf-selection.mjs` for the browser bridge protocol and selection lifecycle.
- Modify: `packages/editor/src/client.jsx` to install the listener for the active retained workbench and integrate PDF selections with the existing selection pill.
- Modify: `scripts/patch-latex-workshop.mjs` to install a dedicated viewer bridge module into the version-checked extension.
- Modify: `packages/editor/src/index.mjs` and `packages/editor/src/workspace.mjs` to normalize a PDF file URI against the session workspace.
- Test: `tests/latex-workshop-patch.test.mjs`, `tests/editor-browser.mjs`, and a nested PDF browser regression.

- [x] Reproduce the missing trigger with a real LaTeX Workshop PDF viewer. Record the actual frame tree/origins and text-layer DOM, including selection on a page distant from page 1. Do not model the viewer as the outer Monaco document.
- [x] Add a failing browser regression that selects `.textLayer` spans in a nested iframe while the text-editor API reports an empty selection. Require an “添加到对话” pill and a payload containing the actual PDF path, quote and page bounds.
- [x] Install the viewer bridge only for LaTeX Workshop `10.9.0`. Use its existing `utils.parseURL()` API. Read the Selection range's ordered start/end nodes, restrict both ends to text layers of the same PDF viewer, and obtain page numbers from their PDF.js `.page[data-page-number]` ancestors. Listen to pointer completion, keyboard selection and debounced selectionchange; clear state when the selection collapses.
- [x] Send a serializable payload from the viewer to the outer host:

```javascript
{
  type: 'amadeus:pdf-selection',
  fileUri: 'file:///workspace/ComputationalMethods/paper.pdf',
  text: 'Selected PDF text',
  pageStart: 2,
  pageEnd: 3,
  pageCount: 10,
  rect: { left: 20, top: 40, right: 180, bottom: 70 }
}
```

- [x] Bind messages to a descendant of the active retained workbench. Validate the observed viewer origin and source window; do not accept arbitrary top-level page messages. Translate frame-local coordinates to the outer viewport only through frames that can be inspected, otherwise place the pill inside the known workbench bounds.
- [x] Normalize `fileUri` on the server with `fileURLToPath`, then resolve its real path against the owning session's real workspace root. Reject paths outside that root, missing files, non-PDF sources, malformed URIs and oversized quotes. Return a workspace-relative path; handle sessions rooted in a course subdirectory as well as `/workspace`.
- [x] Give a valid PDF selection priority over the text-editor poll so a stale Monaco selection cannot overwrite it. Suppress the accepted selection until a new selection is made. Clear the state on viewer navigation, tab invisibility, workbench replacement and disposal.
- [x] Reuse the existing Reader entry point after clicking the pill:

```javascript
window.dispatchEvent(new CustomEvent('amadeus:editor-selection', {
  detail: {
    sessionId,
    text,
    x,
    y,
    source: { kind: 'file', path, format: 'pdf', pageStart, pageEnd, pageCount }
  }
}));
```

The named values above must come from the validated workbench selection and normalized server response. Reader already opens the comment editor and stores the annotation; it must serialize the PDF page provenance and generate `[[path#page=N]]`.

## Task 3: Verification and review

**Files:**
- Update: `tests/annotation-browser.mjs`, `tests/editor-browser.mjs`, `tests/latex-workshop-patch.test.mjs`.
- Update: `README.md` and `CHANGELOG.md` after the behavior is implemented and verified.

- [x] Test forward/backward selection, cross-page selection, touch/keyboard completion, PDF refresh, switching to another editor tab, remount of retained iframes, and suppression after annotation acceptance.
- [x] Assert ordinary editor selections still work and preserve line numbers; PDF selections preserve page numbers and use the PDF path rather than its `.tex` source.
- [x] Test viewer-patch repeat installation and refusal of unsupported upstream versions. Validate all existing inputs before writing extension files.
- [x] Run the required regressions:

```powershell
npm test
npm run build
npm run test:annotations-browser
npm run test:editor-browser
```

- [x] Perform a live smoke against the aligned container: select PDF text in code-server, add a comment, verify the pending annotation and source link, and check the real historical turn 40 reference. Verify reference navigation opens and highlights the original PDF quote in the native preview.
- [x] Review lifecycle cleanup, message-to-workbench binding, workspace path validation, and source context for later plain messages. Record test results and the exact deployed versions before reporting either issue fixed.

## Implementation and verification — 2026-10-08

- Implemented the nested PDF selection bridge, workspace-confined PDF URI normalization, PDF provenance, reselection, stale-result invalidation, and retained-webview visibility cleanup. Real code-server webviews use inherited `visibility:hidden`; the regression checks that condition.
- Real deployment exposed two additional faults: plugin builds included a private `react-dom`, and chat shadow registrations omitted native `inject`/`select`/`store` bindings. Fixed both. Historical turn 40 in the newest conversation now renders its annotation button, tooltip and original document navigation.
- Added the user's follow-up requirement: prevent serialized annotation instructions/JSON from flashing during submission. A version-checked startup patch projects the native user bubble, pending queue preview and admitted queue preview before their first render; the original model request and queue edit payload remain intact.
- Full suite: 83 tests, 82 passed, one Windows platform skip. Build, annotation browser regression and editor browser regression passed. Native bubble and QueueDock browser tests observe DOM mutations from the first render and verify no envelope text appears.
- Live smoke passed against the final container: actual historical reference, tooltip, source navigation, installed display hook, LaTeX Workshop nested PDF text selection, comment popup, and stored PDF path/page. `tests/annotation-live.mjs` provides a reusable smoke using a private configuration path and explicit conversation/file arguments; it sends no model request and writes no document.
- Updated `amadeus-desktop` to image `amadeus:annotation-pdf-20261008`, with DSH `0.2.1-alpha.1`, code-server `4.104.2` and LaTeX Workshop `10.9.0`. Preserved the mounted private configuration, existing workspace and named data volume, including the other agent's UTF-8 fix. The Desktop Compose file now uses the same image tag.
- Docker Hub could not be reached. Built from the local latest RC1 image after verifying its installed DSH version and exact package-lock SHA256 matched this repository; rebuilt all Amadeus plugins and patched both editor/viewer integrations.
- Original container retained stopped as `amadeus-desktop-before-annotation-20261008`. Configuration/data snapshots are under `test-results/annotation-upgrade-backup-20261008*`. Existing unrelated `diagnostics/` files and the other agent's Dockerfile change were preserved.

## Rendering audit and citation appearance follow-up — 2026-10-08

- The user's screenshot exposed raw `<u>` markup in attachment paths. Added a small mdast formatting vocabulary for attribute-free `u`, `sub`, `sup` and `br`, preserving code, unsupported HTML and incomplete streaming tags as literal text.
- DSH supplies primitives through its prebuilt frontend entry; patching the library source alone would not affect the app. The version-checked patch covers the actual minified renderer, derives its function names, and writes a hashed asset URL into the entry HTML to invalidate cached/PWA copies. Repeat application was verified against the deployment image.
- Citation references now have transparent backgrounds, zero borders and separate light/dark blue palettes (`#2563eb` and `#8ab4f8`), with independent hover colors and visible keyboard focus.
- Native frontend browser checks cover underline, nested Markdown emphasis, subscript, superscript, line breaks, math, tables, literal code and unsupported HTML, streaming updates, tooltips/navigation, and both citation palettes. Independent review found no important remaining issues.
- Full suite: 87 tests, 86 passed, one platform skip. Build, annotation browser and native Markdown browser checks passed.
- Live audit of the loaded newest conversation: attachment path rendered as an actual underline element; no remaining literal supported-formatting tags outside code; zero KaTeX errors and 40 rendered tables. Both live citation palettes were checked, and the original theme was restored.
- Updated `amadeus-desktop` to `amadeus:rendering-20261008`; preserved the existing configuration/workspace/data volume. Backup: `test-results/rendering-upgrade-backup-20261008`, with the previous container retained stopped as `amadeus-desktop-before-rendering-20261008`.

## Popover and annotation-only transition follow-up — 2026-10-08

- Moved reference, sent-summary and pending-summary detail panels to a body portal. The panel is measured before first paint, follows the anchor while open, and limits its size to the visual viewport. Keyboard navigation enters the pending panel's controls without closing it, returns to the trigger, and closes on Escape.
- User clarified the visible transition: a normal message bubble appeared during submission before becoming an annotation chip. The native pending/steering bubble now calls the same `SentAnnotations` renderer as the durable message, preserving preview attachments and echo flags. Annotation-only content has no message bubble from its first observed DOM update.
- Submission also closes any selection popup and clears the old selection; stale selection events cannot reopen the comment input until a fresh selection gesture.
- Native citation buttons now render through React context in the actual frontend/parser. Native Markdown roots carry an ownership marker so the fallback decorator cannot mutate their text or buttons. This fixes reconciliation errors when marked-up text changes structure and preserves literal HTML/code and explicit links.
- Regression coverage includes transformed containing blocks, ancestor motion without resize, reduced visual viewport size, keyboard panel controls, empty-request submission, stale-selection lifecycle, and subsequent Markdown updates containing annotation markers in literal HTML.
- Shared repository verification: 89 tests, 88 passed, one platform skip; browser regressions and build passed. Independent review found no remaining important issues. Live verification passed for the real reference/tooltip/body portal with a 6px anchor gap, source navigation and the existing LaTeX Workshop PDF selection/comment/provenance flow.
- Deployed `amadeus:annotation-ui-20261008` by selectively applying Reader/UI and chat/Markdown patch files to the current image. A separate agent's official-browser migration changed repository dependencies and legacy configuration compatibility; those deployment changes were kept separate from this fix. Data/config backup: `test-results/annotation-ui-upgrade-backup-20261008`.

## Stable source navigation and PDF selection proximity — 2026-10-08

- User clarified that the PDF annotation action existed but was placed at the lower-right workbench corner. Reproduced direct opening of the existing A1 PDF and actual mouse dragging: selected text at x1042/y325, action at x1330/y954. The bridge now converts the visible selection-focus coordinates through iframe borders/scales and clamps to viewer bounds; the real action now appears at x1168/y343 beside the text.
- Viewer capture listeners handle PDF.js event propagation, and visible focus/client rects prevent backward cross-page selections from positioning controls at an offscreen range boundary. The live regression now supports direct PDF opening and mouse selection, not only opening a compiled PDF from a TeX command and programmatic selection.
- Reproduced conversation reference navigation with about50 smooth-scroll events/reversals and a final highlighted quote outside the viewport (y=-139). Native ChatViewport now accepts an explicit quote navigation request, cancels competing navigation/following, centers the range in the reading area, and saves a nullable-turn semantic source anchor.
- Native position preservation handles subsequent layout changes; scoped overflow-anchor suppression prevents browser/native compensation from competing. The marker is removed with native stopPreserving on new navigation/reader intent. The real quote screen position remained y465/465/465.25 across compensation updates, with no stale tooltip left open.
- Installer upgrades replace the owned navigation prelude, including older unmarked callbacks, instead of creating duplicate callbacks; idempotency/old-patch upgrade regressions passed.
- Shared suite:90 tests,89 passed,one platform skip. Editor/annotation/Markdown browser regressions and real direct-PDF mouse selection/comment/source-page validation passed. Deployed Reader/Editor/viewer/patch fixes selectively as `amadeus:annotation-navigation-20261008`, preserving the separate browser-use migration and private configuration. Backups under `test-results/annotation-navigation*-backup-20261008`.

## Smooth navigation and outside dismissal follow-up — 2026-10-08

- Restored visible smooth navigation using animation frames through the native viewport writer. Each landing preserves the source row's semantic anchor; targets follow layout movement and exclude the composer. Reduced-motion preferences retain immediate navigation. New navigation, viewport detachment, and reader intent cancel the animation.
- Reader intent cancels the callback before the native paging-null guard, so wheel, touch and PageDown also interrupt before the first animation frame. Regression checks execute the actual patched native handler; live validation intercepted an actual reference jump, delivered wheel intent before its first frame, and verified zero subsequent animation writes.
- Clicking outer-page blank space or a nested editor/PDF iframe closes the comment input and suppresses stale selection reopening. Input typing remains focused. A new selection gesture clears suppression after cancellation, so dragging over a new passage while the old input is open works immediately. Deferred iframe-blur cleanup checks that its popup host is still connected.
- Unit suite: 94 tests, 93 passed, one Windows platform skip. Annotation and actual Markdown browser regressions passed. Tests cover progressive animation, layout movement, retained final position, cancellation, replacement, reduced motion, outer/iframe dismissal, fresh selection, direct reselection, typing and Escape.
- Real historical turn 14 navigation progressed through multiple visible positions to the quoted `N(A)={0}，` at y465.25; its final screen position remained stable after layout compensation. `tests/annotation-navigation-live.mjs` records this behavior and checks immediate native interruption without sending model requests or writing documents.
- `tests/annotation-live.mjs` passed against the final image with direct A1 PDF mouse selection, nearby action, comment typing, clicking PDF blank space to dismiss, fresh mouse selection, and stored PDF path/page provenance. Independent review found no remaining important issues.
- Final deployment: `amadeus-desktop` runs `amadeus:annotation-motion-final-20261008`, with the existing configuration, workspace and named data volume preserved. Desktop Compose uses the same tag. Configuration/data backup: `test-results/annotation-motion-final-backup-20261008`; previous container retained stopped as `amadeus-desktop-before-motion-final-20261008`. The separate official-browser migration was not included. Version-checked startup patches were validated twice on the image.
