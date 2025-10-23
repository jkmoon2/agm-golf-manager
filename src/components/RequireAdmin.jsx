// /src/components/RequireAdmin.jsx

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getAuth } from 'firebase/auth';

// 프로젝트 규칙과 동일하게 운영자 이메일 고정(규칙에 맞춰 필요시 수정)
const ADMIN_EMAIL = 'a@a.com';

export default function RequireAdmin({ children }) {
  const location = useLocation();
  const user = getAuth().currentUser;

  // 로그인 가드는 RequireAuth가 처리하므로 여기선 "관리자 여부"만 체크
  const isAdmin = !!user && user.email === ADMIN_EMAIL;

  if (!isAdmin) {
    // 참가자/비관리자는 접근 불가 → 홈으로 돌려보냄
    return <Navigate to="/" replace state={{ from: location, reason: 'not-admin' }} />;
  }
  return children;
}
