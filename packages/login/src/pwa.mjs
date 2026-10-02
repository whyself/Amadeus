import { readFile } from 'node:fs/promises';

export const PWA_VERSION = '1.2.0-rc.1';
const CACHE_NAME = `amadeus-pwa-${PWA_VERSION}`;
const iconFiles = Object.freeze({
  192: new URL('../assets/amadeus-icon-192.png', import.meta.url),
  512: new URL('../assets/amadeus-icon-512.png', import.meta.url),
});
const iconCache = new Map();

export const pwaManifest = Object.freeze({
  id: '/',
  name: 'Amadeus Workspace',
  short_name: 'Amadeus',
  description: 'A focused workspace for conversations, files, and code.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'any',
  background_color: '#f7f8fb',
  theme_color: '#4078cf',
  lang: 'zh-CN',
  icons: [
    { src: '/icons/amadeus-icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/amadeus-icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
});

export const pwaManifestSource = JSON.stringify(pwaManifest);

export const serviceWorkerSource = `
const CACHE_NAME = ${JSON.stringify(CACHE_NAME)};
const STATIC_DESTINATIONS = new Set(['script', 'style', 'image', 'font']);

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('amadeus-pwa-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js' || url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/amadeus/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok && response.type === 'basic') caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('/'))),
    );
    return;
  }

  if (!STATIC_DESTINATIONS.has(request.destination)) return;
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response.ok && response.type === 'basic') caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
`.trimStart();

function send(res, status, headers, body) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}

function methodNotAllowed(res) {
  send(res, 405, { Allow: 'GET', 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }, 'Method not allowed');
}

async function icon(size) {
  if (!iconCache.has(size)) iconCache.set(size, readFile(iconFiles[size]));
  return iconCache.get(size);
}

export function registerPwaRoutes(register) {
  const disposers = [
    register({ kind: 'exact', path: '/manifest.webmanifest', handler: (req, res) => {
      if (req.method !== 'GET') return methodNotAllowed(res);
      send(res, 200, { 'Cache-Control': 'no-cache', 'Content-Type': 'application/manifest+json; charset=utf-8' }, pwaManifestSource);
    } }),
    register({ kind: 'exact', path: '/sw.js', handler: (req, res) => {
      if (req.method !== 'GET') return methodNotAllowed(res);
      send(res, 200, { 'Cache-Control': 'no-cache', 'Content-Type': 'application/javascript; charset=utf-8', 'Service-Worker-Allowed': '/' }, serviceWorkerSource);
    } }),
    ...Object.keys(iconFiles).map(size => register({ kind: 'exact', path: `/icons/amadeus-icon-${size}.png`, handler: async (req, res) => {
      if (req.method !== 'GET') return methodNotAllowed(res);
      send(res, 200, { 'Cache-Control': 'private, max-age=31536000, immutable', 'Content-Type': 'image/png' }, await icon(size));
    } })),
  ];
  return () => disposers.reverse().forEach(dispose => dispose());
}
