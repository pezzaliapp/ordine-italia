/* Service worker: l'app funziona anche offline. Cambia VERSION a ogni rilascio. */
const VERSION = 'oi-v1.1.0';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/store.js', 'js/listino.js', 'js/pdf.js', 'js/app.js',
  'lib/jspdf.umd.min.js', 'lib/jspdf.plugin.autotable.min.js', 'lib/xlsx.full.min.js',
  'fonts/barlow-latin-400-normal.woff2', 'fonts/barlow-latin-500-normal.woff2', 'fonts/barlow-latin-600-normal.woff2',
  'fonts/barlow-semi-condensed-latin-500-normal.woff2', 'fonts/barlow-semi-condensed-latin-600-normal.woff2', 'fonts/barlow-semi-condensed-latin-700-normal.woff2',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // pagina: prima la rete (per ricevere gli aggiornamenti), poi la cache
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put('index.html', cp)); return r; })
        .catch(() => caches.match('index.html'))
    );
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
});
