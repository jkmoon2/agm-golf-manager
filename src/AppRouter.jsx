// /src/AppRouter.jsx

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
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
                  <MainLayout />
                </PlayerProvider>
              }
            >
              {/* 리스트(기본) */}
              <Route index element={<PlayerEventList />} />
              {/* 리스트 별칭: /player/events */}
              <Route path="events" element={<PlayerEventList />} />

              {/* 참가자 공용 로그인(이메일/코드) */}
              <Route path="login-or-code" element={<LoginOrCode />} />
              {/* 특정 이벤트 로그인(코드 전용) */}
              <Route path="login/:eventId" element={<PlayerLoginScreen />} />

              {/* 플레이어 앱(기존) */}
              <Route path="app/*" element={<PlayerApp />} />
            </Route>

            {/* 🔁 플레이어 전용 캐치올: 잘못된 /player/* 는 참가자 로그인으로 */}
            <Route path="/player/*" element={<Navigate to="/player/login-or-code" replace />} />

            {/* ───────── 운영자 영역 ───────── */}
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
