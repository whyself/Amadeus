import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { injectBrowserCompatibility } from '../packages/login/src/browser-compat.mjs';
import { pwaManifest, pwaManifestSource, registerPwaRoutes, serviceWorkerSource } from '../packages/login/src/pwa.mjs';

test('homepage exposes an installable PWA manifest and registration script', () => {
  const html = injectBrowserCompatibility('<html><head><script>boot()</script></head></html>');
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest" crossorigin="use-credentials">/);
  assert.match(html, /mobile-web-app-capable" content="yes"/);
  assert.match(html, /serviceWorker\.register\('\/sw\.js'/);
  assert.ok(html.indexOf('/manifest.webmanifest') < html.indexOf('boot()'));
  assert.deepEqual(JSON.parse(pwaManifestSource), pwaManifest);
  assert.deepEqual(pwaManifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  assert.equal(pwaManifest.display, 'standalone');
});

test('service worker leaves private Amadeus routes on the network', () => {
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\('\/amadeus\/'\)/);
  assert.match(serviceWorkerSource, /request\.mode === 'navigate'/);
  assert.match(serviceWorkerSource, /STATIC_DESTINATIONS/);
  assert.match(serviceWorkerSource, /cache\.put\(request/);
});

test('rebuilt RC1 activation deletes old assets while preserving unrelated caches', async () => {
  const handlers = new Map(), deleted = [];
  const current = /const CACHE_NAME = "([^"]+)"/.exec(serviceWorkerSource)[1];
  let claimed = false, activation;
  runInNewContext(serviceWorkerSource, {
    self: { addEventListener: (type, handler) => handlers.set(type, handler), clients: { claim: () => { claimed = true; } } },
    caches: { keys: async () => ['amadeus-pwa-1.2.0-rc.1', current, 'other-app'], delete: async key => deleted.push(key) },
  });
  handlers.get('activate')({ waitUntil: promise => { activation = promise; } });
  await activation;
  assert.deepEqual(deleted, ['amadeus-pwa-1.2.0-rc.1']);
  assert.equal(claimed, true);
});

test('PWA routes serve the manifest, worker, and both icons', async () => {
  const routes = new Map();
  const dispose = registerPwaRoutes(route => {
    routes.set(route.path, route.handler);
    return () => routes.delete(route.path);
  });
  assert.deepEqual([...routes.keys()], ['/manifest.webmanifest', '/sw.js', '/icons/amadeus-icon-192.png', '/icons/amadeus-icon-512.png']);
  const responses = [];
  const response = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { responses.push({ status: this.status, headers: this.headers, body }); } };
  await routes.get('/manifest.webmanifest')({ method: 'GET' }, response);
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].headers['Content-Type'], 'application/manifest+json; charset=utf-8');
  await routes.get('/icons/amadeus-icon-192.png')({ method: 'GET' }, response);
  assert.equal(responses[1].status, 200);
  assert.equal(responses[1].headers['Content-Type'], 'image/png');
  assert.ok(Buffer.isBuffer(responses[1].body));
  dispose();
  assert.equal(routes.size, 0);
});
