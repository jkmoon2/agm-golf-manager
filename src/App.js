// /src/App.js

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import LoginScreen       from './screens/LoginScreen';
import MainLayout        from './layouts/MainLayout';
import RequireAuth       from './components/RequireAuth';
import RequireAdmin      from './components/RequireAdmin';

import HomeScreen        from './screens/HomeScreen';
import StepFlow          from './flows/StepFlow';
import AdminMode         from './screens/AdminMode';
import ParticipantMode   from './screens/ParticipantMode';
import Dashboard         from './screens/Dashboard';
import Settings          from './screens/Settings';

// (삭제) import PreMembersList    from './admin/screens/PreMembersList';
// ▼ 새 preMembers 페이지(팝업 + ‘신규만 가져오기’)
import PreMembers        from './admin/screens/PreMembers';

export default function App() {

// ✅ iOS Safari/PWA에서 100vh 초기 계산이 흔들리며(상단/하단이 튀는 현상) 레이아웃이 달라지는 문제를 방지하기 위해
//    실제 화면 높이(window.innerHeight / visualViewport)를 CSS 변수(--vh)에 반영합니다.
//    *기존 레이아웃 값은 유지*하고, vh 계산만 안정화합니다.
useEffect(() => {
  const setVhVar = () => {
    const h = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
    const vh = h * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  };

  // 최초 1회
  setVhVar();

  // 리사이즈/회전/주소창 변화 대응 (iOS는 visualViewport 이벤트가 더 정확)
  let rafId = null;
  const schedule = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(setVhVar);
  };

  window.addEventListener('resize', schedule);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', schedule);
    window.visualViewport.addEventListener('scroll', schedule);
  }

  return () => {
    window.removeEventListener('resize', schedule);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', schedule);
      window.visualViewport.removeEventListener('scroll', schedule);
    }
    if (rafId) cancelAnimationFrame(rafId);
  };
}, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* 로그인 */}
        <Route path="/login" element={<LoginScreen />} />

        {/* 인증 후 메인 레이아웃 */}
        <Route element={<RequireAuth><MainLayout/></RequireAuth>}>
          {/* 홈(index) & 흐름 */}
          <Route index element={<HomeScreen />} />
          <Route path="step/*" element={<StepFlow />} />

          {/* 기존 경로들 유지 */}
          <Route path="admin"       element={<AdminMode />} />
          <Route path="participant" element={<ParticipantMode />} />
          <Route path="dashboard"   element={<Dashboard />} />

          {/* 설정 화면: 일반/어드민 경로 모두 허용(기존 유지) */}
          <Route path="settings"        element={<Settings />} />
          <Route path="admin/settings"  element={<Settings />} />

          {/* ✅ pre-members: 운영자 전용 (일반/관리자 경로 모두 등록) */}
          <Route
            path="settings/pre-members"
            element={
              <RequireAdmin>
                <PreMembers />
              </RequireAdmin>
            }
          />
          <Route
            path="admin/settings/pre-members"
            element={
              <RequireAdmin>
                <PreMembers />
              </RequireAdmin>
            }
          />
        </Route>

        {/* 나머지는 홈으로 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
