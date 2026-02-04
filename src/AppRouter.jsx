// /src/AppRouter.jsx

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PlayerProvider }        from './contexts/PlayerContext';
import { EventProvider }         from './contexts/EventContext';

import MainLayout          from './layouts/MainLayout';
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

// '/player/home/:eventId/login' → '/player/home/:eventId'
function RedirectPlayerHomeNoLogin() {
  const { eventId } = useParams();
  return <Navigate to={`/player/home/${eventId || ''}`} replace />;
}

// ─────────────────────────────────────────────────────────────
// PWA(아이폰 홈화면 추가)에서 시작 경로가 항상 '/'로 고정되는 문제 대응
// - 마지막으로 사용했던 경로를 저장해두고, PWA로 실행 시 '/' 또는 '/login'이면 그 경로로 자동 이동
// - 참가자 전용 아이콘을 만들고 싶으면 Safari에서 '/pwa-player.html' 접속 후 홈화면에 추가하면 됨.
// ─────────────────────────────────────────────────────────────
function isStandalonePWA() {
  try {
    return (
      (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      // iOS Safari
      (typeof window !== 'undefined' && window.navigator && window.navigator.standalone === true)
    );
  } catch (e) {
    return false;
  }
}

function PwaRouteRememberer() {
  const location = useLocation();

  useEffect(() => {
    try {
      const full = `${location.pathname}${location.search || ''}${location.hash || ''}`;
      localStorage.setItem('agm.lastRoute', full);
      if (location.pathname.startsWith('/player')) {
        localStorage.setItem('agm.lastMode', 'player');
      } else if (location.pathname.startsWith('/admin') || location.pathname.startsWith('/login')) {
        localStorage.setItem('agm.lastMode', 'admin');
      }
    } catch (e) {
      // ignore
    }
  }, [location.pathname, location.search, location.hash]);

  return null;
}

function PwaStartRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isStandalonePWA()) return;
    // PWA는 start_url 때문에 '/' 또는 '/login'으로 뜨는 경우가 많음 → lastRoute로 되돌림
    if (location.pathname !== '/' && location.pathname !== '/login') return;

    // ✅ (대안B) iOS 홈화면에서 같은 도메인(origin)을 공유하면
    // "마지막에 사용했던 경로(lastRoute)"가 운영자/참가자 사이에서 서로 덮어써지는 경우가 있어
    // 참가자 아이콘인데도 운영자 로그인(/login)부터 뜨는 현상이 발생할 수 있음.
    //
    // 해결: pwa-player.html / pwa-admin.html에서 installMode를 한 번 저장해두고
    // PWA로 시작할 때 '/' 또는 '/login'이면 installMode 기준으로 "최초 진입"을 우선 결정한다.
    // (레이아웃/CSS에는 영향 없음)
    let installMode = null;
    try {
      installMode = localStorage.getItem('agm.installMode');
    } catch (e) {
      installMode = null;
    }

    if (installMode === 'player') {
      // 참가자 전용 기기/아이콘: 운영자 로그인으로 뜨면 즉시 참가자 로그인으로 복귀
      navigate('/player/login-or-code', { replace: true });
      return;
    }

    if (installMode === 'admin') {
      // 운영자 전용 기기/아이콘: '/' 또는 '/login'으로 시작해도 운영자 로그인으로 고정
      // (LoginScreen이 role 파라미터를 쓰는 경우가 있어도, 기존 구조를 건드리지 않기 위해 /login만 사용)
      if (location.pathname !== '/login') {
        navigate('/login', { replace: true });
      }
      return;
    }

    let last = null;
    try {
      last = localStorage.getItem('agm.lastRoute');
    } catch (e) {
      last = null;
    }

    if (last && last !== location.pathname) {
      navigate(last, { replace: true });
    }
  }, [location.pathname, navigate]);

  return null;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <EventProvider>
          <PwaRouteRememberer />
          <PwaStartRedirect />
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
              {/* 첫 화면은 참가자 로그인(코드/이메일) */}
              <Route index element={<LoginOrCode />} />

              {/* 코드 입력 후 이동하는 리스트 */}
              <Route path="events" element={<PlayerEventList />} />

              {/* 로그인 화면 직접 접근 */}
              <Route path="login-or-code" element={<LoginOrCode />} />

              {/* 비정상/레거시 경로 보호 */}
              <Route path="home/undefined/*"    element={<Navigate to="/player/login-or-code" replace />} />
              <Route path="home/:eventId/login" element={<RedirectPlayerHomeNoLogin />} />

              {/* ✅ 핵심 수정: 이벤트 ID가 반드시 포함되도록 경로 복원 */}
              <Route path="home/:eventId/*" element={<PlayerApp />} />
              <Route path="app/:eventId/*"  element={<PlayerApp />} />

              {/* ✅ 실수로 '/player/home/*'로 들어오면 로그인 화면으로 돌려보내는 안전망 */}
              <Route path="home/*" element={<Navigate to="/player/login-or-code" replace />} />
              <Route path="app/*"  element={<Navigate to="/player/login-or-code" replace />} />
            </Route>

            {/* 운영자 영역 */}
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
