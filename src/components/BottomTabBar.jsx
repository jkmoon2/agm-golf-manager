// src/components/BottomTabBar.jsx

import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, User, BarChart2, Settings } from 'lucide-react';
import styles from './BottomTabBar.module.css';
import { useAuth } from '../contexts/AuthContext';

/** ─────────────────────────────────────────────────────────────
 * GuardedNavLink
 * - 관리자('admin')가 아니면 클릭 시 로그인 화면으로 유도
 * - 관리자면 원래 목적지로 통과
 * - 기존 NavLink API(className 함수, end 등) 그대로 전달
 * ───────────────────────────────────────────────────────────── */
function GuardedNavLink({ to, onClick, ...rest }) {
  const nav = useNavigate();
  const { firebaseUser, appRole } = useAuth() || {};
  const isAdmin = !!firebaseUser && appRole === 'admin';

  const target =
    typeof to === 'string'
      ? to
      : (to && typeof to === 'object' && (to.pathname || `${to}`)) || '/admin';

  const handleClick = (e) => {
    if (onClick) onClick(e);
    if (e.defaultPrevented) return;

    if (!isAdmin) {
      e.preventDefault();
      const redirect = encodeURIComponent(target);
      nav(`/login?role=admin&redirect=${redirect}`);
    }
  };

  return (
    <NavLink
      to={isAdmin ? target : '/login?role=admin'}
      onClick={handleClick}
      {...rest}
    />
  );
}

export default function BottomTabBar() {
  const { pathname } = useLocation();
  const { firebaseUser, appRole } = useAuth() || {};
  const isAdmin = !!firebaseUser && appRole === 'admin';

  // ✅ 참가자 탭 목적지는 항상 "대회 리스트"로 고정
  const participantTo = '/player/events';

  return (
    <nav className={styles.tabBar}>
      {/* ── 운영자 전용 탭: 관리자일 때만 노출 ── */}
      {isAdmin && (
        <GuardedNavLink
          to="/admin/home"
          className={({ isActive }) =>
            pathname.startsWith('/admin/home') ? styles.active : ''
          }
          end
        >
          <Home size={24} />
          <span>홈</span>
        </GuardedNavLink>
      )}

      {/* ✅ 참가자: 항상 노출, 무조건 대회 리스트로 이동 */}
      <NavLink
        to={participantTo}
        className={({ isActive }) =>
          (isActive || pathname.startsWith('/player')) ? styles.active : ''
        }
        end
      >
        <User size={24} />
        <span>참가자</span>
      </NavLink>

      {/* ── 운영자 전용 탭: 관리자일 때만 노출 ── */}
      {isAdmin && (
        <GuardedNavLink
          to="/admin/dashboard"
          className={({ isActive }) => (isActive ? styles.active : '')}
          end
        >
          <BarChart2 size={24} />
          <span>대시보드</span>
        </GuardedNavLink>
      )}

      {isAdmin && (
        <GuardedNavLink
          to="/admin/settings"
          className={({ isActive }) => (isActive ? styles.active : '')}
          end
        >
          <Settings size={24} />
          <span>설정</span>
        </GuardedNavLink>
      )}
    </nav>
  );
}
