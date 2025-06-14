// src/layouts/MainLayout.jsx

import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { HomeIcon, UserGroupIcon, UserIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import styles from './MainLayout.module.css';

export default function MainLayout() {
  return (
    <div className={styles.app}>
      {/* ─── 상단 헤더 ─── */}
      <header className={styles.header}>
        <h1 className={styles.title}>Golf Manager</h1>
      </header>

      {/* ─── 중간 콘텐츠 영역 ─── */}
      <main className={styles.content}>
        <Outlet />
      </main>

      {/* ─── 하단 탭바 ─── */}
      <footer className={styles.tabbar}>
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            isActive ? styles.navItemActive : styles.navItem
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
