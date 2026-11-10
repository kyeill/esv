// Just enough service worker to make the app installable and open offline.
// The page and plan.json are fetched fresh when there is a connection; the
// cached copy is the fallback when there is not. Check marks live in the page's
// localStorage and the Google Sheet, so requests to script.google.com (and the
// esv.org links) pass straight through.
const CACHE = "reading-plan-v15";
const SHELL = ["./", "./plan.json", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-180.png"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, {cache: "reload"})))).catch(() => {}));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.host !== location.host || e.request.method !== "GET") return;
  const fresh = e.request.mode === "navigate" || u.pathname.endsWith("/plan.json");
  if (fresh) {
    const key = e.request.mode === "navigate" ? "./" : "./plan.json";
    // Fetch by URL, not by e.request: a page-load request can't be re-issued
    // with new options, so fetch(e.request, {...}) fails and every load would
    // fall back to the copy cached at install.
    e.respondWith(fetch(u.href, {cache: "no-store"})
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key, copy)); return r; })
      .catch(() => caches.match(key)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
