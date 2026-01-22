/* eslint-disable no-restricted-globals */

// src/serviceWorker.js

// 페이지 로드 시 서비스 워커 등록
export function register(config) {
  if ("serviceWorker" in navigator) {
    const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

    // ✅ load 이벤트가 이미 지난 경우(캐시/복원 등)도 등록이 되도록 보강
    const doRegister = () => {
      // ✅ Netlify SPA 리다이렉트로 service-worker.js가 index.html(text/html)로 떨어지면
      //    등록 시 "unsupported MIME type(text/html)" 에러가 발생하고, 오래된 SW 캐시가 남아
      //    최신 코드/Firestore 스키마와 어긋나 동기화/배정이 꼬일 수 있음.
      //    => 먼저 swUrl이 'JS 파일'이 맞는지 검사 후, 아니면 기존 SW를 해제(unregister)하고 등록을 건너뜀.
      fetch(swUrl, { method: "HEAD", cache: "no-store" })
        .then((res) => {
          const ct = (res.headers.get("content-type") || "").toLowerCase();
          const isJs =
            ct.includes("javascript") || ct.includes("ecmascript") || ct.includes("x-javascript");

          if (!res.ok || !isJs) {
            console.warn(
              "[SW] service-worker.js가 없거나 MIME이 JS가 아닙니다. 서비스워커를 등록하지 않고 기존 워커를 해제합니다.",
              { swUrl, status: res.status, contentType: ct }
            );
            unregister();
            return null;
          }
          return navigator.serviceWorker.register(swUrl);
        })
        .then((registration) => {
          if (!registration) return;

          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker == null) return;

            installingWorker.onstatechange = () => {
              if (installingWorker.state === "installed") {
                if (navigator.serviceWorker.controller) {
                  // 새로운 컨텐츠가 준비됨. 새로고침 전까지 이전 컨텐츠 사용
                  if (config && config.onUpdate) {
                    config.onUpdate(registration);
                  }
                } else {
                  // 모든 컨텐츠가 캐시됨. 오프라인에서도 사용 가능
                  if (config && config.onSuccess) {
                    config.onSuccess(registration);
                  }
                }
              }
            };
          };
        })
        .catch((error) => {
          console.error("서비스워커 등록 실패:", error);
        });
    };

    if (document.readyState === "complete") {
      doRegister();
    } else {
      window.addEventListener("load", doRegister);
    }
  }
}

// 서비스 워커 업데이트 시 즉시 적용
const __isServiceWorkerGlobal =
  typeof self !== "undefined" && typeof self.addEventListener === "function" && !("document" in self);

if (__isServiceWorkerGlobal) {
  self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") {
      self.skipWaiting();
    }
  });

  // 서비스 워커 설치 시 캐시 업데이트 및 활성화
  self.addEventListener("install", () => {
    self.skipWaiting();
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
  });
}

// 서비스 워커 등록 해제
export function unregister() {
  if ("serviceWorker" in navigator) {
    // ✅ getRegistrations 지원 브라우저에서는 전체 등록을 모두 해제
    if (navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
    } else {
      navigator.serviceWorker.ready
        .then((registration) => {
          registration.unregister();
        })
        .catch((error) => {
          console.error(error.message);
        });
    }

    // ✅ 캐시도 삭제(가능한 경우)해서 "옛날 번들"이 계속 뜨는 문제를 차단
    if (typeof caches !== "undefined" && caches.keys) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {});
    }
  }
}
