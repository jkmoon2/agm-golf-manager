// src/AppRouter.jsx

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PlayerProvider }        from './contexts/PlayerContext';

import LoginScreen         from './screens/LoginScreen';
import AdminApp            from './AdminApp';
import Dashboard           from './screens/Dashboard';
import Settings            from './screens/Settings';
import EventSelectScreen   from './player/screens/EventSelectScreen';
import PlayerLoginScreen   from './player/screens/PlayerLoginScreen';
import PlayerApp           from './player/PlayerApp';
import MainLayout          from './layouts/MainLayout';

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

          {/* 1) 로그인 화면 */}
          <Route path="/login" element={<LoginScreen />} />

          {/* 2) 공통 레이아웃 (헤더+탭바) */}
          <Route element={
            <Protected roles={['admin','player']}>
              <MainLayout />
            </Protected>
          }>

            {/* ── 운영자 ── */}
            <Route path="/admin"           element={<Navigate to="/admin/home" replace />} />
            <Route path="/admin/home/*"    element={<AdminApp />} />
            <Route path="/admin/dashboard" element={<Dashboard />} />
            <Route path="/admin/settings"  element={<Settings />} />

            {/* ── 참가자 ── */}
            <Route path="/player/*" element={
              <Protected roles={['player','admin']}>
                <PlayerProvider>
                  <Outlet />
                </PlayerProvider>
              </Protected>
            }>
              {/* 대회 목록 */}
              <Route path="home"                    element={<EventSelectScreen />} />
              {/* 로그인 */}
              <Route path="home/:eventId/login"     element={<PlayerLoginScreen />} />
              {/* 8버튼 메뉴 + STEP */}
              <Route path="home/:eventId/*"         element={<PlayerApp />} />
              {/* 그 외 → 목록 */}
              <Route path="*" element={<Navigate to="home" replace />} />
            </Route>

          </Route>

          {/* 3) 나머지 모두 → 로그인 */}
          <Route path="*" element={<Navigate to="/login" replace />} />

        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
