// src/layouts/MainLayout.jsx

import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  UserGroupIcon,
  UserIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';
import styles from './MainLayout.module.css';

// Step별 제목 매핑
const STEP_TITLES = {
  1: '모드, 대회',
  2: '방',
  3: '업로드',
  4: '리스트',
  5: '배정',
  6: '결과표',
  7: '포볼 배정',
  8: '포볼 결과표',
};

export default function MainLayout() {
  const { pathname } = useLocation();
  const match = pathname.match(/^\/step\/(\d+)/);
  const stepNum = match ? Number(match[1]) : null;

  // 헤더에 표시할 텍스트: step일 땐 STEPn. 제목, 아니면 기본 문구
  const headerText = stepNum
    ? `STEP${stepNum}. ${STEP_TITLES[stepNum]}`
    : 'AGM Golf Manager';

  return (
    <div className={styles.app}>
      {/* ─── 최상단 헤더 (항상 고정) ─── */}
      <header className={styles.header}>
        <h1 className={styles.title}>{headerText}</h1>
      </header>

      {/* ─── 본문 (상단·하단 제외한 영역을 꽉 채움) ─── */}
      <main className={styles.content}>
        <Outlet />
      </main>

      {/* ─── 하단 탭바 ─── */}
      <footer className={styles.tabbar}>
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            isActive || stepNum !== null
              ? styles.navItemActive
              : styles.navItem
          }
        >
          <HomeIcon className={styles.icon} />
          <span className={styles.label}>홈</span>
        </NavLink>
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            isActive ? styles.navItemActive : styles.navItem
          }
        >
          <UserGroupIcon className={styles.icon} />
          <span className={styles.label}>운영자</span>
        </NavLink>
        <NavLink
          to="/participant"
          className={({ isActive }) =>
            isActive ? styles.navItemActive : styles.navItem
          }
        >
          <UserIcon className={styles.icon} />
          <span className={styles.label}>참가자</span>
        </NavLink>
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            isActive ? styles.navItemActive : styles.navItem
          }
        >
          <ChartBarIcon className={styles.icon} />
          <span className={styles.label}>대시보드</span>
        </NavLink>
      </footer>
    </div>
  );
}
