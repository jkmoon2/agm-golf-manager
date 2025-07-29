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

  // STEP 페이지 인지
  const stepMatch = pathname.match(/^\/admin\/home\/(\d+)(?:\/.*)?$/);
  const stepNum   = stepMatch ? Number(stepMatch[1]) : null;
  const isStep    = stepNum !== null && STEP_TITLES.hasOwnProperty(stepNum);

  // 헤더에 뿌릴 문자열
  const header = isStep
    ? `STEP ${stepNum}. ${STEP_TITLES[stepNum]}`
    : 'AGM Golf Manager';

  // 홈 아이콘 활성화 여부
  const isHomeActive = pathname === '/admin/home' || isStep;

  // **플레이어 로그인** 경로인지 체크해서 메인센터 클래스 토글
  const isPlayerLogin = pathname === '/player/login';

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>{header}</h1>
      </header>

      {/* 로그인일 때만 centeredContent 추가 */}
      <main
        className={
          styles.content +
          (isPlayerLogin ? ` ${styles.centeredContent}` : '')
        }
      >
        <Outlet />
      </main>

      <footer className={styles.tabbar}>
        <Link to="/admin/home" className={isHomeActive ? styles.navItemActive : styles.navItem}>
          <HomeIcon className={styles.icon} />
          <span className={styles.label}>홈</span>
        </Link>

        <NavLink
          to="/player/home"
          className={({ isActive }) =>
            isActive ? styles.navItemActive : styles.navItem
          }
        >
          <UserIcon className={styles.icon} />
          <span className={styles.label}>참가자</span>
        </NavLink>

        <NavLink
          to="/admin/home/dashboard"
          end
          className={({ isActive }) =>
            isActive ? styles.navItemActive : styles.navItem
          }
        >
          <ChartBarIcon className={styles.icon} />
          <span className={styles.label}>대시보드</span>
        </NavLink>

        <NavLink
          to="/admin/home/settings"
          end
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
