// src/layouts/MainLayout.jsx

import React from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  UserIcon,
  ChartBarIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import styles from './MainLayout.module.css';

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

  // 참가자 STEP 경로: /player/home/:eventId/:step
  const playerMatch = pathname.match(/^\/player\/home\/[^/]+\/(\d+)/);
  const playerStep  = playerMatch ? Number(playerMatch[1]) : null;
  const isPlayerStep = playerStep !== null && PLAYER_STEP_TITLES.hasOwnProperty(playerStep);

  // 운영자 STEP 경로: /admin/home or /admin/home/:step
  const adminMatch = pathname.match(/^\/admin\/home(?:\/(\d+))?/);
  const adminStep  = adminMatch && adminMatch[1] != null ? Number(adminMatch[1]) : null;
  const isAdminStep = adminStep !== null && ADMIN_STEP_TITLES.hasOwnProperty(adminStep);

  // 헤더: STEP 화면이면 STEP 타이틀, 아니면 기본
  let header = 'AGM Golf Manager';
  if (isPlayerStep) {
    header = PLAYER_STEP_TITLES[playerStep];
  } else if (isAdminStep) {
    header = `STEP ${adminStep}. ${ADMIN_STEP_TITLES[adminStep]}`;
  }

  // 탭바 활성화 로직
  const isHomeActive    = pathname === '/admin/home' || isAdminStep;
  const isPlayerActive  = pathname.startsWith('/player');

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>{header}</h1>
      </header>

      <main className={styles.content}>
        <Outlet />
      </main>

      <footer className={styles.tabbar}>
        {/* 홈 */}
        <Link
          to="/admin/home"
          className={isHomeActive ? styles.navItemActive : styles.navItem}
        >
          <HomeIcon className={styles.icon} />
          <span className={styles.label}>홈</span>
        </Link>

        {/* 참가자 */}
        <NavLink
          to="/player/home"
          className={({ isActive }) =>
            (isActive || isPlayerActive)
              ? styles.navItemActive
              : styles.navItem
          }
        >
          <UserIcon className={styles.icon} />
          <span className={styles.label}>참가자</span>
        </NavLink>

        {/* 대시보드 */}
        <NavLink
          to="/admin/dashboard"
          className={({ isActive }) =>
            isActive ? styles.navItemActive : styles.navItem
          }
        >
          <ChartBarIcon className={styles.icon} />
          <span className={styles.label}>대시보드</span>
        </NavLink>

        {/* 설정 */}
        <NavLink
          to="/admin/settings"
          className={({ isActive }) =>
            isActive ? styles.navItemActive : styles.navItem
          }
        >
          <Cog6ToothIcon className={styles.icon} />
          <span className={styles.label}>설정</span>
        </NavLink>
      </footer>
    </div>
  );
}
