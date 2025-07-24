// src/index.js

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

// 서비스워커 등록 → 업데이트 시 자동 skipWaiting → reload
serviceWorker.register({
  onUpdate: registration => {
    // 대기 중인 워커에게 SKIP_WAITING 명령
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }
});

// 워커가 활성화되어 컨트롤러가 교체되면 페이지를 강제 새로고침
navigator.serviceWorker.addEventListener('controllerchange', () => {
  window.location.reload();
});
