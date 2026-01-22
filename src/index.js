// src/index.js
// [ADD] 개발모드에서 service worker 등록을 막아 콘솔 경고 제거(MIME/WS 에러 완화)
// [ADD] controllerchange 바인딩도 'serviceWorker in navigator' + production 일 때만

import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import AppRouter from "./AppRouter";
import reportWebVitals from "./reportWebVitals";
import { EventProvider } from "./contexts/EventContext";
import * as serviceWorker from "./serviceWorker";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <EventProvider>
        <AppRouter />
    </EventProvider>
  </React.StrictMode>
);

// 👉 서비스워커 활성화는 production에서만
// 개발환경에서는 강제 unregister로 캐시/동기화 꼬임 방지
if ("serviceWorker" in navigator) {
  if (process.env.NODE_ENV === "production") {
    // [ADD] 이전에 잘못 등록된 service_worker.js(언더스코어) 잔재가 있으면 제거(캐시/동기화 꼬임 방지)
    navigator.serviceWorker.getRegistrations?.().then((regs) => {
      regs.forEach((r) => {
        const url =
          r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || "";
        if (url.includes("service_worker.js")) {
          r.unregister();
        }
      });
    });

    serviceWorker.register({
      onUpdate: (registration) => {
        // 새 버전 즉시 적용
        if (registration && registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      },
    });

    // 새 서비스워커 활성화 후 새로고침
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  } else {
    // 개발환경: 서비스워커 제거
    serviceWorker.unregister();
  }
}

reportWebVitals();
