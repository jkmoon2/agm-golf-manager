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

const STEP_TITLES = {
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

  // "/admin/home/0" ~ "/admin/home/8" 경로를 모두 잡아냅니다
  const stepMatch = pathname.match(/^\/admin\/home\/(\d+)(?:\/.*)?$/);
  const stepNum   = stepMatch ? Number(stepMatch[1]) : null;
  const isStep    = stepNum !== null && STEP_TITLES.hasOwnProperty(stepNum);

  // 헤더: STEP 페이지면 "STEP X. 제목", 아니면 앱 메인 타이틀
  const header = isStep
    ? `STEP ${stepNum}. ${STEP_TITLES[stepNum]}`
    : 'AGM Golf Manager';

  // 홈 아이콘 활성: '/admin/home' 및 STEP0~STEP8 모두 파란색 유지
  const isHomeActive = pathname === '/admin/home' || isStep;

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>{header}</h1>
      </header>

      <main className={styles.content}>
        <Outlet />
      </main>

      <footer className={styles.tabbar}>
        {/* ── 홈 ── */}
        <Link
          to="/admin/home"
          className={isHomeActive ? styles.navItemActive : styles.navItem}
        >
          <HomeIcon className={styles.icon} />
          <span className={styles.label}>홈</span>
        </Link>

        {/* ── 참가자 ── */}
        <NavLink
          to="/player/home"
          className={({ isActive }) =>
            // 기존 isActive 에 더해, /player 로 시작하는 모든 경로를 활성으로 간주
            ( isActive || pathname.startsWith('/player') )
              ? styles.navItemActive
              : styles.navItem
          }
        >
          <UserIcon className={styles.icon} />
          <span className={styles.label}>참가자</span>
        </NavLink>

        {/* ── 대시보드 ── */}
        <NavLink
          to="/admin/dashboard"
          className={({ isActive }) =>
            isActive ? styles.navItemActive : styles.navItem
          }
        >
          <ChartBarIcon className={styles.icon} />
          <span className={styles.label}>대시보드</span>
        </NavLink>

        {/* ── 설정 ── */}
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
