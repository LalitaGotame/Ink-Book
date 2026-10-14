// App shell cache: network first, cached copy when offline. Bookings themselves sync through Firebase.
const CACHE = "ink-book-v2";
const FILES = ["./", "index.html", "app.js", "firebase-config.js", "manifest.json", "icon-180.png", "icon-192.png", "icon-512.png",
  "vendor/firebase-app-compat.js", "vendor/firebase-auth-compat.js", "vendor/firebase-firestore-compat.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // never touch Firebase traffic
  e.respondWith(fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
