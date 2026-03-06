// /src/components/RequireAuth.jsx

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';  // 프로젝트의 기존 훅 경로 그대로 사용

export default function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth() || {};
  const location = useLocation();

  if (!isAuthenticated) {
    // 로그인 후 돌아올 수 있도록 state.from 유지
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}
