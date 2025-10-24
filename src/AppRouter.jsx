// /src/AppRouter.jsx

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PlayerProvider }        from './contexts/PlayerContext';
import { EventProvider }         from './contexts/EventContext';

import MainLayout          from './layouts/MainLayout';           // ✅ 레이아웃 복원
import LoginScreen         from './screens/LoginScreen';
import AdminApp            from './AdminApp';
import Dashboard           from './screens/Dashboard';
import Settings            from './screens/Settings';

import PlayerEventList     from './player/screens/PlayerEventList';
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
                  <MainLayout />   {/* ✅ 상/하단 메뉴가 있는 레이아웃 */}
                </PlayerProvider>
              }
            >
              {/* ✅ 첫 화면은 '참가자 전용 로그인(코드/이메일)' */}
              <Route index element={<LoginOrCode />} />

              {/* 대회 리스트(코드 입력 후 이동) */}
              <Route path="events" element={<PlayerEventList />} />

              {/* 로그인(코드/이메일) 화면 직접 접근 */}
              <Route path="login-or-code" element={<LoginOrCode />} />

              {/* 비정상 경로 보호 및 과거 경로 정정 */}
              <Route path="home/undefined/*"    element={<Navigate to="/player/login-or-code" replace />} />
              <Route path="home/:eventId/login" element={<RedirectPlayerHomeNoLogin />} />

              {/* 진입 후 앱(스텝 플로우) */}
              <Route path="home/*" element={<PlayerApp />} />
              <Route path="app/*"  element={<PlayerApp />} />
            </Route>

            {/* ❌ 루프 원인: /player/* → /player/login-or-code 와일드카드는 두지 않습니다. */}

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

            <Route path="*" element={<Navigate to="/login?role=admin" replace />} />
          </Routes>
        </EventProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
