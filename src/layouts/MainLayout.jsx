// src/layouts/MainLayout.jsx

import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { HomeIcon, UserGroupIcon, UserIcon, ChartBarIcon } from '@heroicons/react/outline'; 
import styles from './MainLayout.module.css';

export default function MainLayout() {
  return (
    <div className={styles.page}>
      <header>…</header>

      <main>
        <Outlet />
      </main>

      <footer className={styles.footerNav}>
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            isActive ? styles.navItemActive : styles.navItem
          }
        >
          <HomeIcon className={styles.icon} />
          <span>홈</span>
        </NavLink>

        <NavLink
          to="/admin"
          className={({ isActive }) =>
            isActive ? styles.navItemActive : styles.navItem
          }
        >
          <UserGroupIcon className={styles.icon} />
          <span>운영자</span>
        </NavLink>

        <NavLink
          to="/participant"
          className={({ isActive }) =>
            isActive ? styles.navItemActive : styles.navItem
          }
        >
          <UserIcon className={styles.icon} />
          <span>참가자</span>
        </NavLink>

        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            isActive ? styles.navItemActive : styles.navItem
          }
        >
          <ChartBarIcon className={styles.icon} />
          <span>대시보드</span>
        </NavLink>
      </footer>
    </div>
);
}
