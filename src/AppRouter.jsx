// src/AppRouter.jsx

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

import LoginScreen from './screens/LoginScreen';
import AdminApp    from './AdminApp';
import PlayerApp   from './PlayerApp';

function Protected({ children, roles }) {
  const { firebaseUser, appRole } = useAuth();

  // 로그인되지 않았으면 로그인 페이지로
  if (!firebaseUser) {
    return <Navigate to="/login" replace />;
  }
  // 역할이 맞지 않으면 로그인 페이지로
  if (roles && !roles.includes(appRole)) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* 1) 로그인 페이지 */}
          <Route path="/login" element={<LoginScreen />} />

          {/* 2) 관리자 영역: /admin → /admin/home 리다이렉트 */}
          <Route
            path="/admin"
            element={
              <Protected roles={[ 'admin' ]}>
                <Navigate to="/admin/home" replace />
              </Protected>
            }
          />

          {/* 3) 관리자 앱: /admin/home 하위 라우팅 */}
          <Route
            path="/admin/home/*"
            element={
              <Protected roles={[ 'admin' ]}>
                <AdminApp />
              </Protected>
            }
          />

          {/* 4) 참가자 영역 (/player/*) */}
          <Route
            path="/player/*"
            element={
              <Protected roles={[ 'player', 'admin' ]}>
                <PlayerApp />
              </Protected>
            }
          />

          {/* 5) 그 외 → 로그인 */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}