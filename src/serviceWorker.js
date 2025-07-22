// src/serviceWorker.js

// 설치 단계에서 기존 서비스워커를 바로 활성화
self.addEventListener('install', event => {
  self.skipWaiting();
});

// 활성화 단계에서 클라이언트 페이지를 바로 새 SW에 연결
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});