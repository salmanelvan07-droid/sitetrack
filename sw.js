/* MXM SiteTrack service worker — uygulama dosyalarını ve haritayı cihazda saklar */
var SURUM = 'mxm-sitetrack-1.0.0-88af124a';
var KABUK = ['./', 'index.html', 'app.js', 'app.css', 'config.js', 'qrcode.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
var BUYUK = ['maplibre-gl.js', 'maplibre-gl.css', 'map.json', 'meta.json', 'ocean.jpg'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SURUM).then(function (c) { return c.addAll(KABUK.concat(BUYUK)); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('mxm-sitetrack-') === 0 && k !== SURUM; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function agOnce(req) {
  return new Promise(function (res, rej) {
    var bitti = false;
    var t = setTimeout(function () { caches.match(req, { ignoreSearch: true }).then(function (r) { if (r && !bitti) { bitti = true; res(r); } }); }, 4000);
    fetch(req).then(function (r) {
      clearTimeout(t);
      if (r && r.ok) { var k = r.clone(); caches.open(SURUM).then(function (c) { c.put(req, k); }); }
      if (!bitti) { bitti = true; res(r); }
    }, function (err) {
      clearTimeout(t);
      caches.match(req, { ignoreSearch: true }).then(function (r) { if (!bitti) { bitti = true; r ? res(r) : rej(err); } });
    });
  });
}
function onbellekOnce(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (r) {
    return r || fetch(req).then(function (n) { if (n && (n.ok || n.type === 'opaque')) { var k = n.clone(); caches.open(SURUM).then(function (c) { c.put(req, k); }); } return n; });
  });
}
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var u = new URL(req.url);
  if (u.origin === location.origin) {
    var ad = u.pathname.split('/').pop();
    e.respondWith(BUYUK.indexOf(ad) >= 0 ? onbellekOnce(req) : agOnce(req));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) {
    e.respondWith(onbellekOnce(req));
  }
});
