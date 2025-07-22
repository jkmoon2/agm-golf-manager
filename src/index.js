// src/index.js

import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRouter from './AppRouter';
import { EventProvider } from './contexts/EventContext';
import './index.css';

// 서비스 워커 등록을 위한 모듈 불러오기
import * as serviceWorkerRegistration from './serviceWorker';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <EventProvider>
      <AppRouter />
    </EventProvider>
  </React.StrictMode>
);

// PWA: 새 버전을 즉시 활성화하고 클라이언트를 업데이트합니다.
serviceWorkerRegistration.register({
  onUpdate: registration => {
    // 필요하면 사용자에게 새 버전이 준비됐음을 알리고
    // registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    console.log('New service worker version available');
  }
});
