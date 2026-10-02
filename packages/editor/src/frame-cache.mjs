// Keep live tab frames and a small cache of closed, clean workbenches. The cache
// is local to this page: simultaneous tabs/browsers keep independent bridges.
import { isWebKitBrowser } from '../../login/src/browser-compat.mjs';

const frames = new Map();
const MAX_RETAINED = 3;
let retentionOrder = 0;

function trimRetained() {
  const retained = [...frames.values()].filter(entry => entry.retained).sort((a, b) => a.order - b.order);
  for (const entry of retained.slice(0, Math.max(0, retained.length - MAX_RETAINED))) entry.dispose();
}

// A newly-created tab can reuse a CLOSED workbench in this session/browser.
// Active tabs are never claimed, so editing two files side by side stays isolated.
export function acquireWorkbenchInstance({ key, identity, instance }) {
  if (frames.has(key)) return frames.get(key).instance || instance;
  const entry = [...frames.values()].filter(item => item.retained && item.identity === identity).sort((a, b) => b.order - a.order)[0];
  if (!entry) return instance;
  frames.delete(entry.key);
  entry.key = key;
  entry.retained = false;
  entry.canRetain = false;
  entry.attachment = null;
  frames.set(key, entry);
  return entry.instance;
}

function guardWebKitOverscroll(frame) {
  if (!isWebKitBrowser()) return;
  try {
    const doc = frame.contentDocument, win = frame.contentWindow;
    if (!doc?.head || !win || doc.getElementById('amadeus-no-overscroll')) return;
    const style = doc.createElement('style');
    style.id = 'amadeus-no-overscroll';
    style.textContent = 'html,body{height:100%!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior:none!important;scrollbar-width:none!important}body{min-height:calc(100% + 1px)!important}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none}';
    doc.head.append(style);
    const pin = () => { if (win.scrollX || win.scrollY) win.scrollTo(0, 0); };
    win.addEventListener('scroll', pin, { passive: true });
  } catch { /* A cross-origin/error page cannot be styled; retain normal recovery. */ }
}

export function attachWorkbench({ key, identity, instance, url, placeholder, signal, visible = true, revision = 0, onLoad, onDispose }) {
  if (signal?.aborted) return () => {};
  let entry = frames.get(key);
  if (entry && (entry.url !== url || revision > entry.revision)) { entry.dispose(); entry = undefined; }
  if (!entry) {
    const frame = document.createElement('iframe');
    frame.className = 'amadeus-code-frame'; frame.title = '代码编辑器'; frame.src = url;
    frame.allow = 'clipboard-read; clipboard-write';
    Object.assign(frame.style, { position: 'fixed', display: 'none', zIndex: '10', border: '0' });
    document.body.append(frame);
    frame.addEventListener('load', () => { entry.loaded = true; guardWebKitOverscroll(frame); entry.onLoad?.(); }, { once: true });
    const dispose = () => {
      frame.remove();
      if (frames.get(entry.key) === entry) frames.delete(entry.key);
      entry.signal?.removeEventListener('abort', entry.release);
      entry.onLoad = null;
      entry.onDispose?.(); entry.onDispose = null;
    };
    entry = { key, identity, instance, frame, url, revision, loaded: false, onLoad, onDispose, dispose, retained: false };
    frames.set(key, entry);
  }
  const { frame } = entry;
  entry.identity = identity; entry.instance = instance;
  entry.onDispose = onDispose;
  if (entry.signal !== signal) {
    entry.signal?.removeEventListener('abort', entry.release);
    entry.signal = signal;
    entry.release = () => {
      if (!entry.canRetain) { entry.dispose(); return; }
      entry.retained = true; entry.order = ++retentionOrder;
      entry.attachment = null; entry.onLoad = null;
      frame.style.display = 'none';
      entry.onDispose?.(); entry.onDispose = null;
      trimRetained();
    };
    signal?.addEventListener('abort', entry.release, { once: true });
  }
  entry.retained = false;
  const attachment = Symbol('workbench attachment');
  entry.attachment = attachment;
  entry.onLoad = onLoad;
  if (entry.loaded) onLoad?.();
  const measure = () => {
    if (entry.attachment !== attachment || entry.retained || signal?.aborted) return;
    const rect = placeholder.getBoundingClientRect();
    const shown = visible && placeholder.isConnected && rect.width > 0 && rect.height > 0;
    const layer = placeholder.closest('[data-sidebar-right-float-host]') ? '60' : placeholder.closest('[data-sidebar-right-panel="fullscreen"]') ? '40' : '10';
    Object.assign(frame.style, { display: shown ? 'block' : 'none', zIndex: layer, left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  };
  let animation;
  const schedule = () => { if (animation === undefined) animation = requestAnimationFrame(() => { animation = undefined; measure(); }); };
  const observer = new ResizeObserver(schedule);
  observer.observe(placeholder);
  // Float dragging updates ancestor styles without resizing this placeholder.
  const positions = new MutationObserver(schedule);
  for (let parent = placeholder.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    positions.observe(parent, { attributes: true, attributeFilter: ['style', 'class', 'data-sidebar-right-panel', 'data-sidebar-right-float-host'] });
  }
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, true);
  window.addEventListener('transitionend', schedule, true);
  measure();
  return () => {
    observer.disconnect(); positions.disconnect();
    if (animation !== undefined) cancelAnimationFrame(animation);
    window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true);
    window.removeEventListener('transitionend', schedule, true);
    if (entry.attachment === attachment) { frame.style.display = 'none'; entry.onLoad = null; }
  };
}

export function retainWorkbench(key) { const entry = frames.get(key); if (entry) entry.canRetain = true; }
export function disposeWorkbench(key) { frames.get(key)?.dispose(); }
export function disposeWorkbenches() { for (const entry of [...frames.values()]) entry.dispose(); }
export function getWorkbenchFrame(key) { return frames.get(key)?.frame; }
