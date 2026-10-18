// Service worker : l'application fonctionne hors connexion (sauf l'analyse photo).

const CACHE = 'glucosuivi-v1';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/ui.js',
  'js/db.js',
  'js/calc.js',
  'js/foods.js',
  'js/ai.js',
  'js/charts.js',
  'js/entries.js',
  'js/hypo.js',
  'js/meal.js',
  'js/home.js',
  'js/journal.js',
  'js/stats.js',
  'js/report.js',
  'js/settings.js',
  'js/reminders.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fichiers de l'application : réseau d'abord (pour les mises à jour), cache si hors ligne.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
    );
    return;
  }

  // Module de l'IA (CDN) : cache d'abord.
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      const existing = list.find((c) => 'focus' in c);
      return existing ? existing.focus() : self.clients.openWindow('./#accueil');
    })
  );
});
