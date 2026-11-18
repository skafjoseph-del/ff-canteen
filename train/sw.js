/* Reef service worker. Scope is this folder only, so the rest of the site is untouched. */
var CACHE = "reef-v2";
var ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./logic.js",
  "./manifest.json",
  "./favicon-32.png",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      var required = ASSETS.filter(function (url) { return url !== "./"; });
      return cache.addAll(required).then(function () {
        return cache.add("./").catch(function () { return null; });
      });
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key !== CACHE;
      }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(function () {
          return null;
        });
        if (cached) return cached;
        return network.then(function (res) {
          if (res) return res;
          if (req.mode === "navigate") return cache.match("./index.html");
          return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        });
      });
    })
  );
});
