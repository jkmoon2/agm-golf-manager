// src/AppRouter.jsx

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth }            from './contexts/AuthContext';
import { ParticipantProvider }              from './contexts/ParticipantContext';

import LoginScreen          from './screens/LoginScreen';
import AdminApp             from './AdminApp';
import Dashboard            from './screens/Dashboard';
import Settings             from './screens/Settings';
import PlayerLoginScreen    from './player/screens/PlayerLoginScreen';
import PlayerApp            from './player/PlayerApp';
import MainLayout           from './layouts/MainLayout';

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

          {/* 1) 공통 로그인 화면 (헤더·탭바 없음) */}
          <Route path="/login" element={<LoginScreen />} />

          {/* 2) 참가자 전용 로그인 (탭바·헤더 제외) */}
          <Route
            path="/player/login"
            element={
              <Protected roles={['player','admin']}>
                <ParticipantProvider>
                  <PlayerLoginScreen />
                </ParticipantProvider>
              </Protected>
            }
          />

          {/* 3) MainLayout 적용 구역 (헤더+탭바 활성화) */}
          <Route element={<Protected roles={['admin','player']}><MainLayout/></Protected>}>
            
            {/* ── 관리자 섹션 ── */}
            <Route path="/admin" element={<Navigate to="/admin/home" replace />} />
            <Route path="/admin/home/*" element={<AdminApp />} />
            <Route path="/admin/dashboard" element={<Dashboard />} />
            <Route path="/admin/settings"  element={<Settings />} />

            {/* ── 참가자 섹션 ── */}
            <Route path="/player" element={<Navigate to="/player/login" replace />} />
            <Route path="/player/home/*" element={
              <ParticipantProvider>
                <PlayerApp />
              </ParticipantProvider>
            }/>

          </Route>

          {/* 4) 기타는 로그인으로 */}
          <Route path="*" element={<Navigate to="/login" replace />} />

        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
