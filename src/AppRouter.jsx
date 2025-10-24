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
import LoginOrCode         from './player/screens/LoginOrCode';
import EventMembersOnlyToggle from './admin/screens/EventMembersOnlyToggle';
import MembersList            from './admin/screens/MembersList';
import EventMembersBulkToggle from './admin/screens/EventMembersBulkToggle';
import PreMembers             from './admin/screens/PreMembers';

function Protected({ roles, children }) {
  const { firebaseUser, appRole } = useAuth();
  if (!firebaseUser) return <Navigate to="/login?role=admin" replace />;
  if (roles && !roles.includes(appRole)) return <Navigate to="/login?role=admin" replace />;
  return children;
}

// '/player/home/:eventId/login' 으로 오면 '/player/home/:eventId'로 돌려보내는 리디렉트
function RedirectPlayerHomeNoLogin() {
  const params = new URLSearchParams(window.location.search);
  const p = window.location.pathname.split('/');
  const eventId = p[3] || params.get('eventId') || '';
  return <Navigate to={`/player/home/${eventId}`} replace />;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <EventProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login?role=admin" replace />} />
            <Route path="/login" element={<LoginScreen />} />

            {/* ───────── 참가자 영역 ───────── */}
            <Route
              path="/player"
              element={
                <PlayerProvider>
                  <Outlet />
                </PlayerProvider>
              }
            >
              {/* 참가자 초기 진입(리스트) */}
              <Route index element={<PlayerEventList />} />
              <Route path="events" element={<PlayerEventList />} />

              {/* 로그인/코드 입력 */}
              <Route path="login-or-code" element={<LoginOrCode />} />
              <Route path="login/:eventId" element={<PlayerLoginScreen />} />

              {/* 잘못된 'undefined' 진입 보호 */}
              <Route path="home/undefined/*" element={<Navigate to="/player/login-or-code" replace />} />

              {/* 과거 경로 정정 */}
              <Route path="home/:eventId/login" element={<RedirectPlayerHomeNoLogin />} />

              {/* 진입 후 앱 */}
              <Route path="home/*" element={<PlayerApp />} />
              <Route path="app/*"  element={<PlayerApp />} />
            </Route>

            {/* ❌ (삭제) 루프의 원인: /player/* → /player/login-or-code 자기-리다이렉트 */}
            {/* <Route path="/player/*" element={<Navigate to="/player/login-or-code" replace />} /> */}

            {/* ───────── 운영자 영역 ───────── */}
            <Route
              element={
                <Protected roles={['admin','player']}>
                  <Outlet />
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
                <Route path="/admin/settings/members-only" element={<EventMembersOnlyToggle />} />
                <Route path="/admin/settings/members"      element={<MembersList />} />
                <Route path="/admin/settings/members-bulk" element={<EventMembersBulkToggle />} />
                <Route path="/admin/settings/pre-members"  element={<PreMembers />} />
              </Route>
            </Route>

            {/* 마지막 캐치올: 그 외는 운영자 로그인 */}
            <Route path="*" element={<Navigate to="/login?role=admin" replace />} />
          </Routes>
        </EventProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
