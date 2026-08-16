/**
 * PlayLearn Shop — service worker
 * ---------------------------------------------------------------
 * This exists mainly to satisfy the PWA installability requirement
 * (Chrome/Android won't offer "Install app" without a registered
 * service worker that has a fetch handler). It does light caching of
 * static shell assets so repeat visits load a bit faster and the
 * icons/manifest are available offline — it does NOT cache Firebase
 * data, checkout, or anything dynamic, so purchases/login always hit
 * the network fresh.
 * ---------------------------------------------------------------
 */

const CACHE_NAME = "playlearn-shell-v1";
const SHELL_ASSETS = [
  "style.css",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for navigations (HTML), cache-first for the static shell
// assets above. Everything else (Firebase, Razorpay, fonts, CDNs) just
// passes straight through to the network, untouched.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // don't touch cross-origin (Firebase, Razorpay, fonts CDN)

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
    );
    return;
  }

  if (SHELL_ASSETS.some((asset) => url.pathname.endsWith(asset))) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
  }
});
