// src/AppRouter.jsx

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth }      from './contexts/AuthContext';
import { PlayerProvider }             from './contexts/PlayerContext';

import LoginScreen        from './screens/LoginScreen';
import AdminApp           from './AdminApp';
import Dashboard          from './screens/Dashboard';
import Settings           from './screens/Settings';
import PlayerLoginScreen  from './player/screens/PlayerLoginScreen';
import PlayerApp          from './player/PlayerApp';
import MainLayout         from './layouts/MainLayout';

function Protected({ children, roles }) {
  const { firebaseUser, appRole } = useAuth();
  if (!firebaseUser)                     return <Navigate to="/login" replace />;
  if (roles && !roles.includes(appRole)) return <Navigate to="/login" replace />;
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
            {/* → 참가자 탭 눌렀을 때 진입하는 첫 화면: 로그인 */}
            <Route
              path="/player/login"
              element={
                <Protected roles={['player','admin']}>
                  <PlayerProvider>
                    <PlayerLoginScreen />
                  </PlayerProvider>
                </Protected>
              }
            />
            {/* → 인증 후 8버튼 메뉴로 이동 */}
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
