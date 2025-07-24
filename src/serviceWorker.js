/* eslint-disable no-restricted-globals */

// src/serviceWorker.js

// 페이지 로드 시 서비스 워커 등록
export function register(config) {
  if ('serviceWorker' in navigator) {
    const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register(swUrl)
        .then(registration => {
          // 업데이트 발견 시
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (!installingWorker) return;
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                // 이미 컨트롤러가 있으면(이전 버전이 캐싱돼 있으면) 업데이트된 것
                if (navigator.serviceWorker.controller) {
                  config?.onUpdate?.(registration);
                } else {
                  config?.onSuccess?.(registration);
                }
              }
            };
          };
        })
        .catch(error => {
          console.error('서비스워커 등록 실패:', error);
        });
    });
  }
}

// 서비스워커 해제 (개발·테스트용)
export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then(registration => {
        registration.unregister();
      })
      .catch(error => {
        console.error(error.message);
      });
  }
}

// PWA 내부: 대기 중인 워커에 SKIP_WAITING 메시지를 받으면 즉시 활성화
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 설치되면 바로 활성화
self.addEventListener('install', event => {
  self.skipWaiting();
});

// 활성화되면 클라이언트 장악
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
