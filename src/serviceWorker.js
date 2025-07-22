/* eslint-disable no-restricted-globals */

// 서비스 워커 install 단계: 바로 활성화
self.addEventListener('install', event => {
  self.skipWaiting();
});

// 서비스 워커 activate 단계: 클라이언트 장악
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
