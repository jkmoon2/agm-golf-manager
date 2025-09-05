// /src/components/AdminOnlyLink.jsx

import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// 사용법 예시:
// <AdminOnlyLink to="/admin/dashboard" className="tab">대시보드</AdminOnlyLink>
export default function AdminOnlyLink({ to, children, onClick, ...rest }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { firebaseUser, appRole } = useAuth();  // appRole: 'admin' | 'player' 등
  const isAdmin = !!firebaseUser && appRole === 'admin';

  // 문자열/객체 to 모두 지원
  const target =
    typeof to === 'string'
      ? to
      : (to && typeof to === 'object' && to.pathname) || '/admin';

  const handleClick = (e) => {
    if (onClick) onClick(e);
    if (e.defaultPrevented) return;

    if (!isAdmin) {
      e.preventDefault();
      // 현재 위치를 기억해서, 로그인 성공 후 돌아가고 싶다면 redirect 사용
      const redirect = encodeURIComponent(target);
      nav(`/login?role=admin&redirect=${redirect}`);
    }
  };

  return (
    <Link to={isAdmin ? target : '/login?role=admin'} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
