'use strict';

const CACHE_NAME = 'surakshyapath-static-v4';
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/css/tokens.css',
  '/css/landing.css',
  '/css/workspace.css',
  '/css/offline.css',
  '/js/pwa.js',
  '/images/surakshya-path-logo.png'
];
const STATIC_URLS = new Set(PRECACHE_URLS);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(PRECACHE_URLS))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('surakshyapath-static-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        if (url.pathname === '/' || url.pathname === '/index.html') {
          return await cache.match('/') || await cache.match('/offline.html');
        }
        return await cache.match('/offline.html');
      }
    })());
    return;
  }

  if (!STATIC_URLS.has(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(url.pathname) || fetch(request);
  })());
});
