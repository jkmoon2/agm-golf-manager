/* eslint-disable no-restricted-globals */

// src/serviceWorker.js

// 이 파일을 CRA에서 serviceWorkerRegistration 대신 사용하거나
// src/serviceWorkerRegistration.js를 직접 수정하셔도 동일하게 적용할 수 있습니다.

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    // [::1] IPv6 localhost
    window.location.hostname === '[::1]' ||
    // 127.0.0.0/8 IPv4 localhost
    window.location.hostname.match(
      /^127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/
    )
);

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
                // 이미 컨트롤러가 있으면(캐싱된 이전 버전이 있으면) 업데이트 된 것
                if (navigator.serviceWorker.controller) {
                  config && config.onUpdate && config.onUpdate(registration);
                } else {
                  config && config.onSuccess && config.onSuccess(registration);
                }
              }
            };
          };
        })
        .catch(error => {
          console.error("서비스워커 등록 실패:", error);
        });
    });
  }
}

// 페이지(클라이언트)에서 unregister()를 호출하면 아래가 실행됩니다.
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

// 서비스워커 내부로직 : skipWaiting 메시지를 받으면 즉시 대기 중인 워커를 활성화
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
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
