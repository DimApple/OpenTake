const assets = __ASSETS__;
const cacheName = 'opentake:' + self.registration.scope + ':' + __BUILD__;
const urls = new Set(assets.map(asset => new URL(asset, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)));
});
self.addEventListener('message', event => {
  if (event.data === 'activate') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  const navigation = request.mode === 'navigate';
  if (!navigation && !urls.has(request.url)) return;
  event.respondWith(caches.open(cacheName).then(async cache => {
    // Pair the shell and hashed assets from one build even while a newer worker waits.
    const key = navigation ? self.registration.scope : request.url;
    return (await cache.match(key, { ignoreVary: true })) ?? fetch(request);
  }));
});
