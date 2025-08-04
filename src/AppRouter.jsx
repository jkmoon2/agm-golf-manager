// src/AppRouter.jsx

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PlayerProvider }        from './contexts/PlayerContext';

import LoginScreen         from './screens/LoginScreen';
import AdminApp            from './AdminApp';
import Dashboard           from './screens/Dashboard';
import Settings            from './screens/Settings';
import EventSelectScreen   from './player/screens/EventSelectScreen';       // ── 신규
import PlayerLoginScreen   from './player/screens/PlayerLoginScreen';
import PlayerApp           from './player/PlayerApp';
import MainLayout          from './layouts/MainLayout';

function Protected({ children, roles }) {
  const { firebaseUser, appRole } = useAuth();
  if (!firebaseUser)                        return <Navigate to="/login" replace />;
  if (roles && !roles.includes(appRole))    return <Navigate to="/login" replace />;
  return children;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>

          {/* 1) 관리자 로그인 (탭바 없음) */}
          <Route path="/login" element={<LoginScreen />} />

          {/* 2) 공통 레이아웃: 헤더 + 탭바 */}
          <Route
            element={
              <Protected roles={['admin','player']}>
                <MainLayout />
              </Protected>
            }
          >
            {/** ── 운영자 영역 ── **/}
            <Route path="/admin"                    element={<Navigate to="/admin/home" replace />} />
            <Route path="/admin/home/*"             element={<AdminApp />} />
            <Route path="/admin/dashboard"          element={<Dashboard />} />
            <Route path="/admin/settings"           element={<Settings />} />

            {/** ── 참가자 영역 ── **/}
            {/* 2-a) 탭바에서 “참가자” 누르면 대회 목록 화면 */}
            <Route
              path="/player/home"
              element={
                <Protected roles={['player','admin']}>
                  <PlayerProvider>
                    <EventSelectScreen />
                  </PlayerProvider>
                </Protected>
              }
            />
            {/* 2-b) 대회 클릭 후 인증코드 로그인 */}
            <Route
              path="/player/home/:eventId/login"            // ← 수정: 중첩된 로그인 경로로 변경
              element={
                <Protected roles={['player','admin']}>
                  <PlayerProvider>
                    <PlayerLoginScreen />
                  </PlayerProvider>
                </Protected>
              }
            />
            {/* 2-c) 인증 후 8버튼 메뉴 진입 */}
            <Route
              path="/player/home/*"
              element={
                <Protected roles={['player','admin']}>
                  <PlayerProvider>
                    <PlayerApp />
                  </PlayerProvider>
                </Protected>
              }
            />
          </Route>

          {/* 3) 그 외 → 로그인 */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}