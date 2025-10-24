// /src/AppRouter.jsx

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
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

/** [ADD] 혹시 남아있는 '/player/home/:eventId/login' 진입을
 *  모두 '/player/home/:eventId' 로 돌려보내는 안전 리디렉터 */
function RedirectPlayerHomeNoLogin() {
  const { eventId } = useParams();
  return <Navigate to={`/player/home/${eventId || ''}`} replace />;
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
              {/* 참가자 공용 로그인(이메일/코드) */}
              <Route path="login-or-code" element={<LoginOrCode />} />
              {/* 특정 이벤트 로그인(코드 전용 화면) */}
              <Route path="login/:eventId" element={<PlayerLoginScreen />} />

              {/* [ADD] '/player/home/:eventId/login' 으로 오면 '/player/home/:eventId'로 즉시 리디렉션 */}
              <Route path="home/:eventId/login" element={<RedirectPlayerHomeNoLogin />} />
              {/* [ADD] 혹시 'undefined'가 섞인 경우 로그인(코드)로 유도 */}
              <Route path="home/undefined/*" element={<Navigate to="/player/login-or-code" replace />} />

              {/* 플레이어 홈(스텝 플로우) */}
              <Route path="home/*" element={<PlayerApp />} />
              {/* 기존: 앱 네임스페이스 */}
              <Route path="app/*" element={<PlayerApp />} />
            </Route>

            {/* /player/events 로 들어오면 '항상' 참가자 로그인 먼저 */}
            <Route path="/player/events" element={<Navigate to="/player/login-or-code" replace />} />
            {/* /player/* 잘못된 경로도 참가자 로그인으로 보냄(운영자 로그인으로 튀는 일 방지) */}
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
