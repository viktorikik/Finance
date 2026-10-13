// Service Worker для Планировщика финансов
// Стратегия: cache-first с обновлением в фоне

const CACHE_VERSION = 'finance-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest'
];

// Установка — кэшируем основные файлы
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      // Игнорируем ошибки отдельных файлов, чтобы установка не падала
      return Promise.all(
        ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] не закэшировано:', url, err))
        )
      );
    })
  );
  self.skipWaiting();
});

// Активация — чистим старые кэши
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — сначала кэш, потом сеть (с фоновым обновлением)
self.addEventListener('fetch', event => {
  // Игнорируем не-GET и запросы к другим origin
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request)
        .then(response => {
          // Обновляем кэш свежей версией
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Если сеть недоступна и это навигация — отдаём index
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return cached;
        });

      return cached || networkFetch;
    })
  );
});

// Пропускаем сообщения от клиента (для будущих фич — например, force update)
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
