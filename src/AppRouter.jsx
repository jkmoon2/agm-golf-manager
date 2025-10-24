// /src/AppRouter.jsx

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PlayerProvider }        from './contexts/PlayerContext';
import { EventProvider }         from './contexts/EventContext';

import MainLayout          from './layouts/MainLayout';           // ✅ 플레이어 레이아웃 복원
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

// '/player/home/:eventId/login' → '/player/home/:eventId' 로 정정
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
                  <MainLayout />   {/* ✅ 레이아웃 복원: 헤더/하단 탭 다시 보이게 */}
                </PlayerProvider>
              }
            >
              {/* ✅ 기본 진입은 참가자 로그인(코드/이메일) 화면 */}
              <Route index element={<LoginOrCode />} />

              {/* 이벤트 리스트(로그인 화면의 '대회 선택하기'에서 이동) */}
              <Route path="events" element={<PlayerEventList />} />

              {/* 로그인(이벤트 지정 방식 유지) */}
              <Route path="login-or-code" element={<LoginOrCode />} />
              <Route path="login/:eventId" element={<PlayerLoginScreen />} />

              {/* 잘못된 'undefined' 진입 보호 */}
              <Route path="home/undefined/*" element={<Navigate to="/player/login-or-code" replace />} />

              {/* 과거 경로 정정 */}
              <Route path="home/:eventId/login" element={<RedirectPlayerHomeNoLogin />} />

              {/* 진입 후 앱(스텝 플로우) */}
              <Route path="home/*" element={<PlayerApp />} />
              <Route path="app/*"  element={<PlayerApp />} />
            </Route>

            {/* ❌ 주의: 아래와 같은 와일드카드 리다이렉트는 루프의 원인이라 추가하지 않습니다.
                <Route path="/player/*" element={<Navigate to="/player/login-or-code" replace />} /> */}

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

            {/* 마지막 캐치올 */}
            <Route path="*" element={<Navigate to="/login?role=admin" replace />} />
          </Routes>
        </EventProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
