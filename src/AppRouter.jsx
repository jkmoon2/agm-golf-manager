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
          
          {/* 1) 관리자 로그인 */}
          <Route path="/login" element={<LoginScreen />} />

          {/* 2) 참가자 로그인(탭바 제외) */}
          <Route
            path="/player/login"
            element={
              <Protected roles={['player','admin']}>
                <ParticipantProvider>
                  <PlayerLoginScreen/>
                </ParticipantProvider>
              </Protected>
            }
          />

          {/* 3) 헤더+탭바 공통 레이아웃 */}
          <Route element={<Protected roles={['admin','player']}><MainLayout/></Protected>}>

            {/* ── 운영자 ── */}
            <Route path="/admin" element={<Navigate to="/admin/home" replace/>} />
            <Route path="/admin/home/*" element={<AdminApp/>} />
            <Route path="/admin/dashboard" element={<Dashboard/>} />
            <Route path="/admin/settings"  element={<Settings/>} />

            {/* ── 참가자 ── */}
            <Route path="/player" element={<Navigate to="/player/login" replace/>} />
            <Route path="/player/home/*" element={
              <ParticipantProvider>
                <PlayerApp/>
              </ParticipantProvider>
            }/>

          </Route>

          {/* 4) 그 외 전부 → /login */}
          <Route path="*" element={<Navigate to="/login" replace/>}/>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
