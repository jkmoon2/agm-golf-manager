// src/index.js
// [ADD] 개발모드에서 service worker 등록을 막아 콘솔 경고 제거(MIME/WS 에러 완화)
// [ADD] controllerchange 바인딩도 'serviceWorker in navigator' + production 일 때만

import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRouter from './AppRouter';
import './index.css';

// 위에서 만든 serviceWorker.js 불러오기
import * as serviceWorker from './serviceWorker';

const root = ReactDOM.createRoot(document.getElementById('root'));

// ------------------------------------------------------------
// ✅ iOS(Safari/PWA) 뷰포트 높이 안정화
// - iOS에서 100vh가 주소창/상태바 변화에 따라 튀면서
//   상단 헤더가 시계 영역과 겹치거나, 하단 탭/버튼 위치가 흔들리는 문제가 있음.
// - window.innerHeight 기반으로 CSS 변수(--app-height)를 주입해
//   레이아웃이 "항상 현재 화면 높이"를 기준으로 잡히게 함.
// ------------------------------------------------------------
function setAppHeightVar() {
  try {
    const h = window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${h}px`);
  } catch {}
}

setAppHeightVar();
window.addEventListener('resize', setAppHeightVar);
window.addEventListener('orientationchange', setAppHeightVar);
root.render(
  <React.StrictMode>
    {/* ✅ EventProvider는 AppRouter 내부(<BrowserRouter> 안)에서 1회만 감싸도록 유지 */}
    <AppRouter />
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
