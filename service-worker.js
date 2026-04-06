const CACHE_NAME = 'metro-app-cache-v1';

// 這裡列出「必須」在第一次打開時就下載到手機裡的檔案
const urlsToCache = [
  './index.html',
  './script.js',
  './manifest.json',
  // 你預設會載入的地區資料 (例如香港)
  './cities/hk/metro_station.json',
  './cities/hk/metro_transfer.json',
  // 如果有其他地區，也可以一併寫進來
  './cities/sz/metro_station.json',
  './cities/sz/metro_transfer.json',
  './cities/twp/metro_station.json',
  './cities/twp/metro_transfer.json',
  // Leaflet 地圖套件的核心檔案
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// 1. 安裝 Service Worker 並快取檔案
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 PWA 快取已建立');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. 攔截網路請求：如果手機沒網路，就從快取拿資料！
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果快取裡有這個檔案，直接秒回傳 (完全離線)
        if (response) {
            return response;
        }
        // 如果快取沒有，才真的連上網路去抓
        return fetch(event.request).then(
          function(networkResponse) {
            // 抓到新檔案後，順便存進快取，下次就能離線用了 (動態快取)
            if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            let responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(function(cache) {
                cache.put(event.request, responseToCache);
              });
            return networkResponse;
          }
        );
      })
  );
});

// 3. 更新快取機制 (當你升級 App 時，自動清除舊快取)
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});