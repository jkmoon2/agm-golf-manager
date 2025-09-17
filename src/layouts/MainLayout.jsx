// /src/layouts/MainLayout.jsx

import React from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  UserIcon,
  ChartBarIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import styles from './MainLayout.module.css';
import { useAuth } from '../contexts/AuthContext';
import { useApplyTheme } from '../themes/useTheme'; // ★ 추가: 테마 훅

// 참가자 STEP 제목 매핑
const PLAYER_STEP_TITLES = {
  1: 'STEP 1. 방 선택',
  2: 'STEP 2. 방배정표',
  3: 'STEP 3. 이벤트 입력',
  4: 'STEP 4. 점수 입력',
  5: 'STEP 5. 결과 확인',
  6: 'STEP 6. 이벤트 확인',
  7: 'STEP 7. #TEMP',
  8: 'STEP 8. #TEMP',
};

// 운영자 STEP 제목 매핑 (0~8)
const ADMIN_STEP_TITLES = {
  0: '대회 관리',
  1: '모드, 대회명',
  2: '방개수, 방이름',
  3: '업로드',
  4: '참가자 목록',
  5: '배정',
  6: '결과표',
  7: '포볼 방배정',
  8: '포볼 결과표',
};

export default function MainLayout() {
  const { pathname } = useLocation();

  // ★ 테마 스코프 자동 감지(플레이어/운영자)
  const scope = /^\/player\//.test(pathname) ? 'player' : 'admin';
  useApplyTheme(scope);

  // 참가자 STEP 경로: /player/home/:eventId/:step
  const playerMatch = pathname.match(/^\/player\/home\/[^/]+\/(\d+)/);
  const playerStep  = playerMatch ? Number(playerMatch[1]) : null;
  const isPlayerStep = playerStep !== null && PLAYER_STEP_TITLES.hasOwnProperty(playerStep);

  // 운영자 STEP 경로: /admin/home or /admin/home/:step
  const adminMatch = pathname.match(/^\/admin\/home(?:\/(\d+))?/);
  const adminStep  = adminMatch && adminMatch[1] != null ? Number(adminMatch[1]) : null;
  const isAdminStep = adminStep !== null && ADMIN_STEP_TITLES.hasOwnProperty(adminStep);

  // 이벤트 페이지 여부(둘 다 지원: /admin/events, /admin/home/events)
  const isEventsPage = /^\/admin(?:\/home)?\/events/.test(pathname);

  // 헤더 타이틀
  let header = 'AGM Golf Manager';
  if (isPlayerStep) {
    header = PLAYER_STEP_TITLES[playerStep];
  } else if (isAdminStep) {
    header = `STEP ${adminStep}. ${ADMIN_STEP_TITLES[adminStep]}`;
  }
  if (isEventsPage) header = '#EVENT · 이벤트 관리';

  // 탭바 활성화
  const isHomeActive    = pathname === '/admin' || pathname === '/admin/home' || isAdminStep || isEventsPage;
  const isPlayerActive  = pathname.startsWith('/player'); // 참가자 전체 영역 활성

  // 사용자 역할
  const { firebaseUser, appRole } = useAuth() || {};
  const isAdmin = !!firebaseUser && appRole === 'admin';

  // 참가자 탭 목적지는 항상 "대회 리스트"
  const participantTo = '/player/events';

  return (
    <div className={styles.app}>
      {/* 헤더: agm-surface로 은은한 입체감 */}
      <header className={`${styles.header} agm-surface`}>
        <h1 className={styles.title}>{header}</h1>
      </header>

      <main className={styles.content}>
        <Outlet />
      </main>

      {/* 하단 탭바: 기존 높이 그대로, 스타일만 bottom-nav로 주입 */}
      <footer className={`${styles.tabbar} bottom-nav`}>
        {/* 운영자 전용: 관리자일 때만 노출 */}
        {isAdmin && (
          <Link
            to="/admin/home"
            className={isHomeActive ? `${styles.navItemActive} item` : `${styles.navItem} item`}
            data-active={isHomeActive ? 'true' : undefined}   /* ★ 추가: 홈 탭 활성 표식 */
          >
            <HomeIcon className={styles.icon} />
            <span className={styles.label}>홈</span>
          </Link>
        )}

        {/* 참가자: 항상 노출, 무조건 대회 리스트로 이동 */}
        <NavLink
          to={participantTo}
          className={({ isActive }) =>
            (isActive || isPlayerActive)
              ? `${styles.navItemActive} item`
              : `${styles.navItem} item`
          }
          data-active={isPlayerActive ? 'true' : undefined}   /* ★ 추가: 참가자 전 경로 활성 */
        >
          <UserIcon className={styles.icon} />
          <span className={styles.label}>참가자</span>
        </NavLink>

        {/* 운영자 전용: 관리자일 때만 노출 */}
        {isAdmin && (
          <NavLink
            to="/admin/dashboard"
            className={({ isActive }) =>
              isActive ? `${styles.navItemActive} item` : `${styles.navItem} item`
            }
          >
            <ChartBarIcon className={styles.icon} />
            <span className={styles.label}>대시보드</span>
          </NavLink>
        )}

        {isAdmin && (
          <NavLink
            to="/admin/settings"
            className={({ isActive }) =>
              isActive ? `${styles.navItemActive} item` : `${styles.navItem} item`
            }
          >
            <Cog6ToothIcon className={styles.icon} />
            <span className={styles.label}>설정</span>
          </NavLink>
        )}
      </footer>
    </div>
  );
}
