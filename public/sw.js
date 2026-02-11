self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('connectai-store').then((cache) => cache.addAll([
      '/',
      '/index.html',
      '/manifest.json',
      '/favicon.svg'
    ]))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
