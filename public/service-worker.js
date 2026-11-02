// ============================================================================
// 地鐵極速導航 v2.2 Service Worker
// 1. 自動清除舊版快取，解決舊畫面卡死問題
// 2. 針對同源靜態資源採用 Network-First + ignoreSearch 快取匹配
// 3. 外部 API (如 OpenStreetMap Overpass) 直接放行不攔截，避免行動網路 CORS 問題
// ============================================================================

const CACHE_NAME = 'metro-pwa-v2.2';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './cities/hk/metro_station.json',
  './cities/hk/metro_transfer.json',
  './cities/sz/metro_station.json',
  './cities/sz/metro_transfer.json',
  './cities/twp/metro_station.json',
  './cities/twp/metro_transfer.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('預快取部分資源略過:', err);
      });
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
          return Promise.resolve();
        }),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // 外部網域 API (例如 Overpass 公開資料庫) 直接由瀏覽器連線，不經 Service Worker 攔截
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(async (networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });
          return networkResponse;
        }
        const cached = await caches.match(event.request, {
          ignoreSearch: true,
        });
        return cached || networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request, {
          ignoreSearch: true,
        });
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          const fallbackIndex = await caches.match('./index.html', {
            ignoreSearch: true,
          });
          if (fallbackIndex) return fallbackIndex;
        }
        throw new Error('Offline and resource not cached');
      }),
  );
});
