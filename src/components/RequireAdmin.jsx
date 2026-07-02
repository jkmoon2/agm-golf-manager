// /src/components/RequireAdmin.jsx

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { isRulesAdminUser } from '../utils/adminAuth';

export default function RequireAdmin({ children }) {
  const location = useLocation();
  const user = getAuth().currentUser;

  // 로그인 가드는 RequireAuth가 처리하므로 여기선 "관리자 여부"만 체크
  const isAdmin = isRulesAdminUser(user);

  if (!isAdmin) {
    // 참가자/비관리자는 접근 불가 → 홈으로 돌려보냄
    return <Navigate to="/" replace state={{ from: location, reason: 'not-admin' }} />;
  }
  return children;
}
