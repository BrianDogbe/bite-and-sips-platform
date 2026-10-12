/* Bite & Sips rider service worker.
 * Purpose: make the rider portal installable and show a friendly offline page.
 * It deliberately does NOT cache API responses — order data must always come from the server. */
const CACHE = 'bs-rider-v1';
const OFFLINE_HTML = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title><body style="font-family:system-ui;padding:24px;background:#f3f5f2;color:#15201b">
<h1 style="color:#35251f">You're offline</h1><p>Your deliveries will load again when you have signal. Your last actions may not have been sent — check them once you're back online.</p>
<button onclick="location.reload()" style="min-height:48px;padding:0 18px;border-radius:10px;border:0;background:#35251f;color:#fffdf8;font-weight:700">Try again</button></body></html>`;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.put('/__offline', new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html' } }))));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return; // never intercept API calls
  e.respondWith(fetch(req).catch(() => caches.match('/__offline')));
});
