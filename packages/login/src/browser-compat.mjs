function installBrowserCrypto() {
  const crypto = globalThis.crypto;
  if (!crypto || typeof crypto.randomUUID === 'function' || typeof crypto.getRandomValues !== 'function') return;
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    writable: true,
    value() {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
  });
}

function installIosStandaloneEditableFix() {
  const media = typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : null;
  const standalone = navigator.standalone === true
    || (media !== null && ['standalone', 'fullscreen', 'minimal-ui'].some(mode => media(`(display-mode: ${mode})`).matches));
  if (!standalone) return;

  const selector = '[contenteditable=""],[contenteditable="true"]';
  const editableFor = target => (target && typeof target.closest === 'function' ? target.closest(selector) : null);

  const revive = el => {
    const previous = el.getAttribute('contenteditable');
    el.setAttribute('contenteditable', 'false');
    void el.offsetHeight;
    el.setAttribute('contenteditable', previous === null ? 'true' : previous);
  };

  document.addEventListener('touchstart', event => {
    const el = editableFor(event.target);
    if (!el) return;
    revive(el);
    setTimeout(() => { try { el.focus(); } catch (error) {} }, 0);
  }, true);

  document.addEventListener('touchend', event => {
    const el = editableFor(event.target);
    if (!el) return;
    setTimeout(() => {
      try {
        el.focus();
        const selection = window.getSelection();
        if (selection && (selection.rangeCount === 0 || !el.contains(selection.anchorNode))) {
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      } catch (error) {}
    }, 0);
  }, true);
}

function installDocumentScrollLock() {
  const EDITABLE = 'input,textarea,select,[contenteditable]';
  let tracking = false;
  let selfManaged = false;
  let startX = 0;
  let startY = 0;

  // A surface that declares `touch-action: none` (the panel resize handle does)
  // manages its own gesture with pointer events. Answering its touchmove with
  // preventDefault() makes iOS cancel that pointer sequence, so the handle stops
  // dragging. Leave those gestures alone.
  const managesOwnGesture = target => {
    for (let node = target; node && node.nodeType === 1; node = node.parentElement) {
      if (getComputedStyle(node).touchAction === 'none') return true;
    }
    return false;
  };

  document.addEventListener('touchstart', event => {
    tracking = event.touches.length === 1;
    selfManaged = tracking && managesOwnGesture(event.target);
    if (tracking) {
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    }
  }, { passive: true, capture: true });

  const release = () => { tracking = false; };
  document.addEventListener('touchend', release, { passive: true, capture: true });
  document.addEventListener('touchcancel', release, { passive: true, capture: true });

  const canScroll = (el, dx, dy) => {
    const style = getComputedStyle(el);
    const vertical = Math.abs(dy) >= Math.abs(dx);
    const overflow = vertical ? style.overflowY : style.overflowX;
    if (overflow !== 'auto' && overflow !== 'scroll' && overflow !== 'overlay') return false;
    const position = vertical ? el.scrollTop : el.scrollLeft;
    const size = vertical ? el.clientHeight : el.clientWidth;
    const extent = vertical ? el.scrollHeight : el.scrollWidth;
    if ((vertical ? dy : dx) < 0) return position + size < extent - 1;
    return position > 1;
  };

  document.addEventListener('touchmove', event => {
    if (!event.cancelable) return;
    if (event.touches.length > 1) return;
    if (!tracking) { event.preventDefault(); return; }
    if (selfManaged) return;
    const touch = event.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (dx === 0 && dy === 0) return;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) return;
    let node = event.target;
    while (node && node !== document.documentElement) {
      if (node.nodeType === 1) {
        if (node.closest && node.closest(EDITABLE)) return;
        if (canScroll(node, dx, dy)) return;
      }
      node = node.parentElement;
    }
    event.preventDefault();
  }, { passive: false, capture: true });

  // A Magic Keyboard trackpad delivers two-finger scrolling as `wheel`, not
  // touch, so the touchmove guard above never sees it. iPadOS then pans the
  // whole page for any trackpad scroll that no inner scroller consumes — every
  // panel slides at once. The document has no overflow to scroll (the CSS lock
  // makes it a non-scroller), yet the visual viewport still drifts, so the only
  // reliable fix is to swallow the wheel too. Deliberately let a wheel through:
  //
  //   - Cmd/Ctrl + wheel: the app's own pinch — Safari's trackpad pinch arrives
  //     as a ctrlKey wheel — and the reader's preview zoom. Never a page scroll.
  //   - the wheel lands on / inside an editable (so a focused textarea or input
  //     still scrolls its own content);
  //   - some ancestor scroll container can still move that way (a panel list, a
  //     reader document), so panels keep scrolling normally.
  //
  // Everything else is a drag on bare layout or an edge-of-panel overscroll, so
  // it is ignored and the page stays nailed to the viewport.
  // NOTE: wheel deltas are the opposite sign to finger displacement — a positive
  // deltaY scrolls *down* (content moves up), whereas canScroll() reads a positive
  // dy as "finger moved down, drag content up". Pass the negated deltas so the
  // direction test is the same for both. Getting this backwards is what made a
  // wheel from the top of a list get swallowed instead of scrolling it.
  const pathOf = event => {
    if (typeof event.composedPath === 'function') {
      const path = event.composedPath();
      if (path && path.length) return path;
    }
    const nodes = [];
    for (let node = event.target; node; node = node.parentElement) nodes.push(node);
    return nodes;
  };
  document.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey) return;
    if (!event.cancelable) return;
    const dx = event.deltaX;
    const dy = event.deltaY;
    if (dx === 0 && dy === 0) return;
    for (const node of pathOf(event)) {
      if (!node || node.nodeType !== 1) continue;
      if (node.closest && node.closest(EDITABLE)) return;
      if (canScroll(node, -dx, -dy)) return;
    }
    event.preventDefault();
  }, { passive: false, capture: true });

  // iPadOS ignores the wheel preventDefault above for trackpad scrolling: it
  // still moves the root scroller through a compositor-driven scroll with no
  // cancel path, so `scrollY` drifts and the whole pinned layout shifts. There
  // is nothing to scroll here — the body is pinned — so whenever the root moves,
  // put it straight back. Inner panels scroll inside themselves and their scroll
  // events never reach the window/document, so their scrolling is untouched.
  const pinRoot = () => {
    const root = document.scrollingElement || document.documentElement;
    const moved = (root && (root.scrollTop !== 0 || root.scrollLeft !== 0))
      || (typeof window !== 'undefined' && ((window.scrollY || 0) !== 0 || (window.scrollX || 0) !== 0));
    if (!moved) return;
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') { try { window.scrollTo(0, 0); } catch (error) {} }
    if (root) { root.scrollTop = 0; root.scrollLeft = 0; }
  };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('scroll', pinRoot, { passive: true });
  document.addEventListener('scroll', pinRoot, { passive: true });
}

// Safari ignores `user-scalable=no` for ordinary pages, and its native pinch
// arrives as gesture events before any touch handler runs. Swallow those three
// so the page zoom stays off. Touch events are untouched, so the reader's own
// pinch zoom keeps working.
function blockNativePageZoom() {
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, event => event.preventDefault(), { passive: false });
  }
}

const VIEWPORT_LOCK_CSS = `
html, body { height: 100% !important; overflow: hidden !important; overscroll-behavior: none !important; touch-action: pan-x pan-y !important; -webkit-text-size-adjust: 100%; }
#root { height: 100% !important; }
`;
// Feature checks keep native implementations intact on modern browsers.
function installPromiseWithResolvers() {
  if (typeof Promise.withResolvers === 'function') return;
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true, writable: true,
    value: function withResolvers() {
      let resolve, reject;
      const promise = new this((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    },
  });
}

function installMapGetOrInsert() {
  for (const Ctor of [Map, WeakMap]) {
    const { has, get, set } = Ctor.prototype;
    const validateKey = key => {
      if (Ctor === WeakMap) set.call(new WeakMap(), key, undefined);
      return key === 0 ? 0 : key;
    };
    const define = (name, value) => {
      if (typeof Ctor.prototype[name] !== 'function') {
        Object.defineProperty(Ctor.prototype, name, { configurable: true, writable: true, value });
      }
    };
    define('getOrInsert', function getOrInsert(key, defaultValue) {
      if (has.call(this, key)) return get.call(this, key);
      set.call(this, key, defaultValue);
      return defaultValue;
    });
    define('getOrInsertComputed', function getOrInsertComputed(key, callbackfn) {
      has.call(this, key); // Validate the receiver before calling user code.
      if (typeof callbackfn !== 'function') throw new TypeError('callbackfn must be callable');
      key = validateKey(key);
      if (has.call(this, key)) return get.call(this, key);
      const value = callbackfn(key);
      set.call(this, key, value);
      return value;
    });
  }
}

// Only DSH's embedded PDF worker needs the second realm's Map fallbacks.
// Proxy construction preserves no-new errors, instanceof and subclass behavior;
// downloads, uploads, other JS blobs and non-Array iterables stay native.
function installPdfWorkerBlobFallback(polyfillSource) {
  if (typeof Blob !== 'function' || typeof Proxy !== 'function') return;
  const NativeBlob = Blob;
  globalThis.Blob = new Proxy(NativeBlob, {
    construct(target, args, newTarget) {
      const [parts, options] = args;
      if (Array.isArray(parts) && parts.length === 2 && parts.every(part => typeof part === 'string')
        && options && options.type === 'text/javascript'
        && parts[0].includes('WorkerMessageHandler') && parts[0].includes('pdfjs')
        && parts[1].startsWith('\nself.postMessage({type:')) {
        args = [[polyfillSource + '\n', ...parts], options];
      }
      return Reflect.construct(target, args, newTarget);
    },
  });
}

export function isWebKitBrowser(navigatorLike = globalThis.navigator) {
  const ua = navigatorLike?.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigatorLike.maxTouchPoints > 1);
  return /AppleWebKit/.test(ua) && (ios || !/Chrome|Chromium|Edg|OPR|Android/.test(ua));
}

function installWebkitCompatibility(polyfillSource, css) {
  if (!isWebKitBrowser()) return;
  const needsWorkerFallback = typeof Map.prototype.getOrInsert !== 'function'
    || typeof Map.prototype.getOrInsertComputed !== 'function';
  if (needsWorkerFallback) installPdfWorkerBlobFallback(polyfillSource);
  installIosStandaloneEditableFix();
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) viewport.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  else {
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
    document.head.appendChild(meta);
  }
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  blockNativePageZoom();
  installDocumentScrollLock();
}

// Run UUID first for HTTP bootstrap, then install only missing APIs. WebKit
// interaction workarounds coexist with the existing installable PWA.
export function injectBrowserCompatibility(html) {
  const workerSource = `(${installPromiseWithResolvers.toString()})();(${installMapGetOrInsert.toString()})();`;
  const webkitSource = [isWebKitBrowser, installIosStandaloneEditableFix, installDocumentScrollLock, blockNativePageZoom,
    installPdfWorkerBlobFallback, installWebkitCompatibility].map(fn => fn.toString()).join('\n');
  return html.replace(/<head\b[^>]*>/i, head => `${head}<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials"><meta name="theme-color" content="#4078cf"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Amadeus"><script>(${installBrowserCrypto.toString()})();</script><script>${webkitSource}\ninstallWebkitCompatibility(${JSON.stringify(workerSource)}, ${JSON.stringify(VIEWPORT_LOCK_CSS)});${workerSource}</script><script>if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}), { once: true });</script>`);
}
