/* Service worker: deixa o app e os preços disponíveis offline.
 * Estratégia: tenta a internet primeiro (assim preços novos chegam sozinhos);
 * se estiver offline ou lento (>4s), usa a cópia guardada no aparelho. */
const CACHE = 'presto-v3';
const ARQUIVOS = [
  './', './app/', './manifest.webmanifest',
  './assets/app.css', './assets/app.js', './assets/calc.js',
  './assets/presto.jpg', './assets/reps/vidal.jpg', './assets/icon-192.png', './assets/icon-512.png',
  './data/precos.json', './data/politica.json', './data/codigos_antigos.json', './data/representantes.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ARQUIVOS.map(a => c.add(a).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function redeOuCache(req) {
  return new Promise(resolve => {
    let feito = false;
    const usarCache = () => caches.match(req, { ignoreSearch: true }).then(r => { if (!feito && r) { feito = true; resolve(r); } });
    const timer = setTimeout(usarCache, 4000);
    fetch(req).then(res => {
      clearTimeout(timer);
      if (res && res.ok && !res.redirected) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      if (!feito) { feito = true; resolve(res); }
    }).catch(() => { clearTimeout(timer); usarCache().then(() => { if (!feito) resolve(Response.error()); }); });
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(redeOuCache(req));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    // fontes: usa a guardada e atualiza em segundo plano
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
      const rede = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || rede;
    })));
  }
});
