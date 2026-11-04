/* ==========================================================================
   Service Worker (PWA) — sw.js
   Обеспечивает офлайн-работу приложения через кэширование файлов.
   ========================================================================== */

// Версия кэша. Обновляем при каждом релизе (v6 -> v7)!
const CACHE_VERSION = 'finance-v7';

// Список файлов для предзагрузки в кэш при установке SW
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js'
];

// Событие установки: открываем кэш и добавляем файлы
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()) // Активируем SW сразу, не дожидаясь закрытия вкладок
  );
});

// Событие активации: удаляем старые кэши
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_VERSION) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim()) // Захватываем контроль над страницами
  );
});

// Событие fetch: отдаём из кэша, если есть. Иначе — из сети (и кэшируем)
self.addEventListener('fetch', e => {
  // Пропускаем не-GET запросы
  if (e.request.method !== 'GET') return;
  
  e.respondWith(
    caches.match(e.request).then(cached => {
      // Пытаемся загрузить из сети для обновления кэша в фоне
      const fetchPromise = fetch(e.request).then(networkRes => {
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          const clone = networkRes.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(e.request, clone));
        }
        return networkRes;
      }).catch(() => cached); // Если сеть упала, отдаём кэш
      
      // Отдаём кэш сразу, если он есть, иначе ждём сеть
      return cached || fetchPromise;
    })
  );
});
