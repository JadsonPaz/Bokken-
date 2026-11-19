const CACHE_NAME = '__CACHE_NAME__';
const PRECACHE_URLS = __PRECACHE_URLS__;
const APP_SHELL_PATH = '/index.html';
const API_PATH = /^\/api(?:\/|$)/;
const APP_SHELL_CACHE_PREFIX = 'bokken-app-shell-';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter(name => name.startsWith(APP_SHELL_CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || API_PATH.test(url.pathname)) return;
  if (request.headers.has('authorization')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(APP_SHELL_PATH)) ?? Response.error();
    }));
    return;
  }

  if (!PRECACHE_URLS.includes(`${url.pathname}`)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(url.pathname)) ?? fetch(request);
  })());
});
