// /src/AppRouter.jsx

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PlayerProvider }        from './contexts/PlayerContext';
import { EventProvider }         from './contexts/EventContext';

import LoginScreen         from './screens/LoginScreen';
import AdminApp            from './AdminApp';
import Dashboard           from './screens/Dashboard';
import Settings            from './screens/Settings';
import PlayerEventList     from './player/screens/PlayerEventList';
import PlayerLoginScreen   from './player/screens/PlayerLoginScreen';
import PlayerApp           from './player/PlayerApp';
import MainLayout          from './layouts/MainLayout';

// 🆕 추가: 탭 UI (회원 로그인 + 인증코드)
import LoginOrCode         from './player/screens/LoginOrCode';

function Protected({ children, roles }) {
  const { firebaseUser, appRole } = useAuth();
  if (!firebaseUser)                     return <Navigate to="/login?role=admin" replace />;
  if (roles && !roles.includes(appRole)) return <Navigate to="/login?role=admin" replace />;
  return children;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* 🆕 이벤트 상태를 전역에서 구독(설정/플레이어 공통) */}
        <EventProvider>
          <Routes>

            <Route path="/" element={<Navigate to="/login?role=admin" replace />} />
            <Route path="/login" element={<LoginScreen />} />

            {/* ───────── 참가자 전용(공개) ───────── */}
            <Route
              path="/player"
              element={
                <PlayerProvider>
                  <MainLayout />
                </PlayerProvider>
              }
            >
              <Route index element={<Navigate to="events" replace />} />
              <Route path="events" element={<PlayerEventList />} />
              <Route path="home/:eventId/*" element={<PlayerApp />} />

              {/* 🆕 여기서 /player/home/:eventId/login 은 '탭 UI'로 진입 */}
              <Route path="home/:eventId/login" element={<LoginOrCode />} />

              {/* (참고) 레거시 인증코드 전용 화면이 필요하면 아래 라인을 남기되, 경로를 다른 곳으로 두세요.
                  <Route path="home/:eventId/join" element={<PlayerLoginScreen />} /> */}
            </Route>

            {/* ───────── 보호 구역(운영자) ───────── */}
            <Route
              element={
                <Protected roles={['admin','player']}>
                  <MainLayout />
                </Protected>
              }
            >
              <Route
                element={
                  <Protected roles={['admin']}>
                    <Outlet />
                  </Protected>
                }
              >
                <Route path="/admin"           element={<Navigate to="/admin/home" replace />} />
                <Route path="/admin/home/*"    element={<AdminApp />} />
                <Route path="/admin/dashboard" element={<Dashboard />} />
                <Route path="/admin/settings"  element={<Settings />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/login?role=admin" replace />} />
          </Routes>
        </EventProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
