// Service Worker — Controle de Compras da Família
// Guarda em cache só o "esqueleto" do app (HTML/CSS/JS/ícones).
// Chamadas para o Apps Script e para o Gemini NUNCA passam pelo cache:
// elas só acontecem quando o usuário pede uma ação (nova nota, marcar
// falta, atualizar dashboards) e sempre buscam dado fresco na rede.

const CACHE_NAME = 'compras-familia-v1';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(
        nomes.filter(function (n) { return n !== CACHE_NAME; })
             .map(function (n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  const url = event.request.url;

  // Nunca intercepta chamadas de API (Apps Script ou Gemini) — sempre direto na rede
  const isApiCall = url.includes('script.google.com') || url.includes('generativelanguage.googleapis.com');
  if (isApiCall) {
    return; // deixa o navegador tratar normalmente, sem cache
  }

  // Para os arquivos do próprio app: cache primeiro, com atualização em segundo plano
  event.respondWith(
    caches.match(event.request).then(function (respostaCache) {
      const buscaRede = fetch(event.request).then(function (respostaRede) {
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, respostaRede.clone());
        });
        return respostaRede;
      }).catch(function () {
        return respostaCache;
      });
      return respostaCache || buscaRede;
    })
  );
});
