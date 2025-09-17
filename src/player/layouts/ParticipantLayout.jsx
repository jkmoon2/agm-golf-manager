// /src/player/layouts/ParticipantLayout.jsx

import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Home, Users, BarChart2, Settings } from 'lucide-react';
import styles from './ParticipantLayout.module.css';
import { useApplyTheme } from '../../themes/useTheme'; // ★ 추가

export default function ParticipantLayout() {
  useApplyTheme('player'); // ★ 플레이어 화면에만 테마 적용

  const { pathname } = useLocation();
  const isPlayerActive = pathname.startsWith('/player'); // /player 전역 활성

  return (
    <div className={styles.page}>
      {/* ── 상단 헤더 ── */}
      <header className={`${styles.header} agm-surface`}>{/* ★ agm-surface */}
        AGM Golf Manager
      </header>

      {/* ── 본문 ── */}
      <main className={styles.content}>
        <Outlet />
      </main>

      {/* ── 하단 탭바 (운영자와 동일) ── */}
      <nav className={`${styles.tabbar} bottom-nav`}>{/* ★ bottom-nav */}
        <NavLink
          to="/admin/home"
          className={({isActive})=> isActive ? `${styles.tabActive} item` : `${styles.tab} item`}
          data-active={pathname.startsWith('/admin') ? 'true' : undefined}
        >
          <Home className={styles.icon}/>
          <span className={styles.label}>홈</span>
        </NavLink>

        <NavLink
          to="/player/home"
          className={({isActive})=> (isActive || isPlayerActive) ? `${styles.tabActive} item` : `${styles.tab} item`}
          data-active={isPlayerActive ? 'true' : undefined}         /* ★ 참가자 전 경로 활성 */
        >
          <Users className={styles.icon}/>
          <span className={styles.label}>참가자</span>
        </NavLink>

        <NavLink
          to="/admin/dashboard"
          className={({isActive})=> isActive ? `${styles.tabActive} item` : `${styles.tab} item`}
        >
          <BarChart2 className={styles.icon}/>
          <span className={styles.label}>대시보드</span>
        </NavLink>

        <NavLink
          to="/admin/settings"
          className={({isActive})=> isActive ? `${styles.tabActive} item` : `${styles.tab} item`}
        >
          <Settings className={styles.icon}/>
          <span className={styles.label}>설정</span>
        </NavLink>
      </nav>
    </div>
  );
}
