// src/index.js
// [ADD] 개발모드에서 service worker 등록을 막아 콘솔 경고 제거(MIME/WS 에러 완화)
// [ADD] controllerchange 바인딩도 'serviceWorker in navigator' + production 일 때만

import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRouter from './AppRouter';
import { EventProvider } from './contexts/EventContext';
import './index.css';

// 위에서 만든 serviceWorker.js 불러오기
import * as serviceWorker from './serviceWorker';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <EventProvider>
      <AppRouter />
    </EventProvider>
  </React.StrictMode>
);


// 서비스워커 등록
// ------------------------------------------------------------
// ⚠️ 라이브 운영 안정성 우선(실시간 동기화/방배정/점수 반영)
// Service Worker(오프라인 캐시/PWA)는 "구버전 번들 캐시"로 인해
// 예측 불가능한 동기화/표시 문제를 만들 수 있어서, 현재는 비활성화합니다.
// ------------------------------------------------------------
serviceWorker.unregister();

// 과거에 이미 등록된 SW가 남아있을 수 있어 1회 더 강제 해제
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}
