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
// (삭제) import PreMembersList      from './admin/screens/PreMembersList';
import PlayerEventList     from './player/screens/PlayerEventList';
import PlayerLoginScreen   from './player/screens/PlayerLoginScreen';
import PlayerApp           from './player/PlayerApp';
import MainLayout          from './layouts/MainLayout';

import LoginOrCode         from './player/screens/LoginOrCode';
import EventMembersOnlyToggle from './admin/screens/EventMembersOnlyToggle';
import MembersList            from './admin/screens/MembersList';
import EventMembersBulkToggle from './admin/screens/EventMembersBulkToggle';
// ▼ 새 preMembers 페이지(팝업 + ‘신규만 가져오기’)
import PreMembers          from './admin/screens/PreMembers';

function Protected({ roles, children }) {
  const { firebaseUser, appRole } = useAuth();
  if (!firebaseUser) return <Navigate to="/login?role=admin" replace />;
  if (roles && !roles.includes(appRole)) return <Navigate to="/login?role=admin" replace />;
  return children;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <EventProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login?role=admin" replace />} />
            <Route path="/login" element={<LoginScreen />} />

            {/* ─────────────── 참가자 영역(공개) ─────────────── */}
            <Route
              path="/player"
              element={
                <PlayerProvider>
                  <MainLayout />
                </PlayerProvider>
              }
            >
              <Route index element={<PlayerEventList />} />
              <Route path="login" element={<PlayerLoginScreen />} />
              <Route path="app/*" element={<PlayerApp />} />
              <Route path="login-or-code" element={<LoginOrCode />} />
            </Route>

            {/* ─────────────── 운영자 영역(보호) ─────────────── */}
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

                {/* 기존 메뉴들 유지 */}
                <Route path="/admin/settings/members-only" element={<EventMembersOnlyToggle />} />
                <Route path="/admin/settings/members"      element={<MembersList />} />
                <Route path="/admin/settings/members-bulk" element={<EventMembersBulkToggle />} />

                {/* ✅ pre-members는 새 페이지로 통일 */}
                <Route path="/admin/settings/pre-members"  element={<PreMembers />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/login?role=admin" replace />} />
          </Routes>
        </EventProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
