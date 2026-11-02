// ============================================================================
// 地鐵極速導航 v2.1 Service Worker
// 1. 自動清除舊版 v1.3 Cache-First 快取 (metro-app-cache-v1.3)，解決舊畫面卡死問題
// 2. 採用 Network-First (網路優先，離線時自動退回快取) 策略，確保永遠看到最新版本
// 3. 預先快取香港 (hk)、深圳 (sz)、台北 (twp) 完整路網 JSON 供地底無網路環境使用
// ============================================================================

const CACHE_NAME = 'metro-pwa-v2.1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/cities/hk/metro_station.json',
  '/cities/hk/metro_transfer.json',
  '/cities/sz/metro_station.json',
  '/cities/sz/metro_transfer.json',
  '/cities/twp/metro_station.json',
  '/cities/twp/metro_transfer.json',
];

self.addEventListener('install', (event) => {
  // 立即接管，不等待舊版 Service Worker 關閉
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
      // 1. 徹底刪除舊版 metro-app-cache-v1.3 及所有舊快取
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('🗑️ 清除舊版快取:', name);
            return caches.delete(name);
          }
          return Promise.resolve();
        }),
      );

      // 2. 立即控制所有開啟中的頁面
      await self.clients.claim();

      // 3. 自動重新載入所有受舊版快取卡住的分頁，讓新介面立即呈現
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        try {
          await client.navigate(client.url);
        } catch {
          // 忽略跨域或無法導航的 client
        }
      }
    })(),
  );
});

// Network-First 策略：有網路時優先抓最新版並更新快取；離線時秒回傳快取
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || networkResponse.type === 'cors')
        ) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          const fallbackIndex = await caches.match('/index.html');
          if (fallbackIndex) return fallbackIndex;
        }
        throw new Error('Offline and resource not cached');
      }),
  );
});
