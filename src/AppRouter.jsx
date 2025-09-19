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
import MainLayout          from './layouts/MainLayout';

// ── [추가] 플레이어: 로그인/인증코드 탭 UI
import LoginOrCode         from './player/screens/LoginOrCode';
// ── [추가] 운영자: 회원 전용 이벤트 토글 화면
import EventMembersOnlyToggle from './admin/screens/EventMembersOnlyToggle';
// ── [추가] 운영자: 회원 목록(다운로드/삭제)
import MembersList from './admin/screens/MembersList';
// ── [추가] 운영자: 여러 이벤트 일괄 토글 (신규)
import EventMembersBulkToggle from './admin/screens/EventMembersBulkToggle';

function Protected({ children, roles }) {
  const { firebaseUser, appRole } = useAuth();
  if (!firebaseUser)                     return <Navigate to="/login?role=admin" replace />;
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
              <Route index element={<Navigate to="events" replace />} />
              <Route path="events" element={<PlayerEventList />} />
              <Route path="home/:eventId/*" element={<PlayerApp />} />

              {/* [추가] 탭형 로그인/인증코드 UI */}
              <Route path="home/:eventId/login" element={<LoginOrCode />} />

              {/* (레거시 유지) 인증코드 전용 */}
              <Route path="home/:eventId/join" element={<PlayerLoginScreen />} />
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

                {/* [유지] 이벤트별 토글 라우트가 이미 사용 중이면 살려둠 */}
                <Route path="/admin/events/:eventId/members-only" element={<EventMembersOnlyToggle />} />

                {/* [추가] 설정 하위 메뉴 라우트 */}
                <Route path="/admin/settings/members-only" element={<EventMembersOnlyToggle />} />
                <Route path="/admin/settings/members"      element={<MembersList />} />
                {/* [추가] 여러 이벤트 일괄 토글 */}
                <Route path="/admin/settings/members-bulk" element={<EventMembersBulkToggle />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/login?role=admin" replace />} />
          </Routes>
        </EventProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
