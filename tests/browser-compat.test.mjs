import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext, createContext, runInContext } from 'node:vm';
import { randomFillSync } from 'node:crypto';
import { injectBrowserCompatibility, isWebKitBrowser } from '../packages/login/src/browser-compat.mjs';

const compatibilitySource = () => [...injectBrowserCompatibility('<head>').matchAll(/<script>([\s\S]*?)<\/script>/g)][1][1];
function browserContext({ safari = false, standalone = false, missing = true } = {}) {
  const handlers = new Map();
  const append = [];
  const viewport = { content: 'original', setAttribute(name, value) { this[name] = value; } };
  const document = {
    addEventListener(name, fn) { const list = handlers.get(name) || []; list.push(fn); handlers.set(name, list); },
    querySelector: () => viewport, createElement: () => ({}), head: { appendChild: el => append.push(el) },
    documentElement: {},
  };
  const window = { matchMedia: () => ({ matches: false }), addEventListener() {}, getSelection: () => null };
  const context = createContext({ Blob, document, window, navigator: {
    userAgent: safari ? 'Mozilla/5.0 (iPad) AppleWebKit/605.1.15 Safari/604.1' : 'Mozilla/5.0 AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
    maxTouchPoints: safari ? 5 : 0, standalone,
  }, getComputedStyle: el => el.style || {}, setTimeout: fn => fn() });
  if (missing) runInContext('delete Promise.withResolvers; delete Map.prototype.getOrInsert; delete Map.prototype.getOrInsertComputed; delete WeakMap.prototype.getOrInsert; delete WeakMap.prototype.getOrInsertComputed;', context);
  return { context, handlers, append, viewport, document, window };
}

test('HTTP UUID fallback runs before dsh bootstrap and produces CSPRNG UUID v4 values', () => {
  const html = injectBrowserCompatibility('<html><head><script>boot()</script></head></html>');
  const source = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  assert.ok(html.indexOf('getRandomValues') < html.indexOf('boot()'));
  let calls = 0;
  const crypto = { getRandomValues(bytes) { calls++; return randomFillSync(bytes); } };
  runInNewContext(source, { crypto });
  const ids = Array.from({ length: 100 }, () => crypto.randomUUID());
  assert.equal(new Set(ids).size, 100); assert.equal(calls, 100);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('HTTPS native UUID implementation is preserved', () => {
  const native = () => 'native';
  const crypto = { randomUUID: native };
  const source = /<script>([\s\S]*?)<\/script>/.exec(injectBrowserCompatibility('<head>'))[1];
  runInNewContext(source, { crypto });
  assert.equal(crypto.randomUUID, native);
});

test('engine detection excludes desktop Chrome while including all iOS WebKit browsers', () => {
  assert.equal(isWebKitBrowser({ userAgent: 'AppleWebKit Safari' }), true);
  assert.equal(isWebKitBrowser({ userAgent: 'AppleWebKit Chrome Safari' }), false);
  assert.equal(isWebKitBrowser({ userAgent: 'iPhone AppleWebKit CriOS Safari' }), true);
  assert.equal(isWebKitBrowser({ userAgent: 'Macintosh AppleWebKit Chrome Safari', maxTouchPoints: 5 }), true);
  assert.equal(isWebKitBrowser({ userAgent: 'Android AppleWebKit Chrome' }), false);
});

test('desktop Chrome preserves native APIs, Blob, viewport and event handling', () => {
  const { context, handlers, append, viewport } = browserContext({ missing: false });
  runInContext('Map.prototype.getOrInsert ||= function nativeInsert() {}; Map.prototype.getOrInsertComputed ||= function nativeComputed() {}; Promise.withResolvers ||= function nativePromise() {}; globalThis.originalInsert = Map.prototype.getOrInsert; globalThis.originalPromise = Promise.withResolvers;', context);
  runInContext(compatibilitySource(), context);
  assert.equal(runInContext('originalInsert === Map.prototype.getOrInsert && originalPromise === Promise.withResolvers', context), true);
  assert.equal(context.Blob, Blob);
  assert.equal(viewport.content, 'original');
  assert.equal(handlers.size, 0);
  assert.equal(append.length, 0);
});

test('fallback APIs support undefined values, subclass promises, computed callbacks and intrinsic receivers', async () => {
  const { context } = browserContext();
  runInContext(compatibilitySource(), context);
  assert.equal(runInContext(`(() => {
    const map = new Map([['present', undefined]]); let calls = 0;
    if (map.getOrInsert('present', 4) !== undefined || map.getOrInsertComputed('present', () => ++calls) !== undefined || calls !== 0) return false;
    map.getOrInsertComputed(-0, key => { if (Object.is(key, -0)) throw Error('negative zero'); return 3; });
    map.has = () => false; map.get = () => 'wrong'; map.set = () => { throw Error('overridden'); };
    if (map.getOrInsert(0, 10) !== 3) return false;
    for (const invoke of [() => Map.prototype.getOrInsert.call({}, 1, 2), () => map.getOrInsertComputed(0, null), () => new WeakMap().getOrInsertComputed(1, () => ++calls)]) {
      try { invoke(); return false; } catch (e) { if (!(e instanceof TypeError)) return false; }
    }
    class CustomPromise extends Promise {};
    const { promise, resolve } = CustomPromise.withResolvers(); resolve(42);
    return promise instanceof CustomPromise && calls === 0 && !Object.getOwnPropertyDescriptor(Map.prototype, 'getOrInsert').enumerable;
  })()`, context), true);
  assert.equal(await runInContext('(() => { const capability = Promise.withResolvers(); capability.resolve(42); return capability.promise; })()', context), 42);
});

test('Safari wraps only the embedded PDF worker when native upsert is missing', async () => {
  const { context } = browserContext({ safari: true });
  runInContext(compatibilitySource(), context);
  assert.notEqual(context.Blob, Blob);
  const normal = new context.Blob(['plain'], { type: 'text/plain' });
  assert.equal(await normal.text(), 'plain');
  const unrelated = new context.Blob(['postMessage(1)'], { type: 'text/javascript' });
  assert.equal(await unrelated.text(), 'postMessage(1)');
  const pdf = new context.Blob(['/* pdfjs WorkerMessageHandler */', '\nself.postMessage({type:"ready"});\n'], { type: 'text/javascript' });
  const source = await pdf.text();
  assert.ok(source.startsWith('(function installPromiseWithResolvers'));
  assert.match(source, /function installMapGetOrInsert/);
  assert.ok(pdf instanceof context.Blob && pdf instanceof Blob);
  assert.throws(() => context.Blob([]), TypeError);
  class ChildBlob extends context.Blob {}
  assert.ok(new ChildBlob(['test']) instanceof ChildBlob);
  const worker = createContext();
  runInContext('delete Promise.withResolvers; delete Map.prototype.getOrInsert; delete Map.prototype.getOrInsertComputed;', worker);
  runInContext(source.slice(0, source.indexOf('/* pdfjs')), worker);
  assert.equal(runInContext('new Map().getOrInsertComputed("x", () => 42)', worker), 42);
  const native = browserContext({ safari: true, missing: false });
  runInContext('Map.prototype.getOrInsert ||= () => {}; Map.prototype.getOrInsertComputed ||= () => {};', native.context);
  runInContext(compatibilitySource(), native.context);
  assert.equal(native.context.Blob, Blob);
});

test('Safari guards overscroll but lets scrollable panels, selection, editables and app gestures through', () => {
  const { context, handlers, append, viewport, window } = browserContext({ safari: true });
  runInContext(compatibilitySource(), context);
  assert.match(viewport.content, /user-scalable=no/);
  assert.match(append[0].textContent, /overscroll-behavior: none/);
  const node = { nodeType: 1, style: { overflowY: 'auto' }, scrollTop: 0, clientHeight: 100, scrollHeight: 500, closest: () => null };
  let prevented = 0;
  const event = { target: node, touches: [{ clientX: 0, clientY: 0 }], cancelable: true, preventDefault: () => prevented++ };
  handlers.get('touchstart')[0](event);
  handlers.get('touchmove')[0]({ ...event, touches: [{ clientX: 0, clientY: -50 }] });
  assert.equal(prevented, 0);
  handlers.get('touchmove')[0]({ ...event, touches: [{ clientX: 0, clientY: 50 }] });
  assert.equal(prevented, 1);
  node.closest = () => node;
  handlers.get('touchmove')[0]({ ...event, touches: [{ clientX: 0, clientY: 50 }] });
  assert.equal(prevented, 1);
  node.closest = () => null;
  window.getSelection = () => ({ rangeCount: 1, isCollapsed: false });
  handlers.get('touchmove')[0]({ ...event, touches: [{ clientX: 0, clientY: 50 }] });
  assert.equal(prevented, 1);
  window.getSelection = () => null;
  node.style.touchAction = 'none';
  handlers.get('touchstart')[0](event);
  handlers.get('touchmove')[0]({ ...event, touches: [{ clientX: 0, clientY: 50 }] });
  assert.equal(prevented, 1);
  handlers.get('gesturestart')[0](event);
  assert.equal(prevented, 2);
  handlers.get('wheel')[0]({ ...event, ctrlKey: true, deltaY: 100, deltaX: 0 });
  assert.equal(prevented, 2);
  handlers.get('wheel')[0]({ ...event, deltaY: 100, deltaX: 0 });
  assert.equal(prevented, 2);
  handlers.get('wheel')[0]({ ...event, deltaY: -100, deltaX: 0 });
  assert.equal(prevented, 3);
});

test('standalone editable fix restores attributes and a missing caret without changing the PWA mode', () => {
  const { context, handlers, document, window } = browserContext({ safari: true, standalone: true });
  let focused = 0, added = 0;
  const attrs = [];
  const editable = { getAttribute: () => 'true', setAttribute: (_, value) => attrs.push(value), focus: () => focused++, contains: () => false };
  const target = { closest: () => editable };
  window.getSelection = () => ({ rangeCount: 0, removeAllRanges() {}, addRange: () => added++ });
  document.createRange = () => ({ selectNodeContents() {}, collapse() {} });
  runInContext(compatibilitySource(), context);
  handlers.get('touchstart')[0]({ target });
  handlers.get('touchend')[0]({ target });
  assert.deepEqual(attrs, ['false', 'true']);
  assert.equal(focused, 2);
  assert.equal(added, 1);
});

test('compatibility injection retains asset URLs and has no reload or global long-chat override', () => {
  const html = injectBrowserCompatibility('<head><meta name="viewport" content="original"><script src="/assets/index-Q6zc2uHV.js"></script></head>');
  assert.match(html, /src="\/assets\/index-Q6zc2uHV\.js"/);
  assert.match(html, /meta name="viewport" content="original"/);
  assert.doesNotMatch(html, /amadeus\/version|location\.replace|content-visibility/);
});
