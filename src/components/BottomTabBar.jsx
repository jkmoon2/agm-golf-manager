// src/components/BottomTabBar.jsx

import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, User, BarChart2, Settings } from 'lucide-react';
import styles from './BottomTabBar.module.css';

export default function BottomTabBar() {
  const { pathname } = useLocation();
  return (
    <nav className={styles.tabBar}>
      <NavLink
        to="/admin/home"
        className={({ isActive }) =>
          pathname.startsWith('/admin/home') ? styles.active : ''
        }
        end
      >
        <Home size={24} />
        <span>홈</span>
      </NavLink>

      <NavLink
        to="/admin/participants"
        className={({ isActive }) => (isActive ? styles.active : '')}
        end
      >
        <User size={24} />
        <span>참가자</span>
      </NavLink>

      <NavLink
        to="/admin/dashboard"
        className={({ isActive }) => (isActive ? styles.active : '')}
        end
      >
        <BarChart2 size={24} />
        <span>대시보드</span>
      </NavLink>

      <NavLink
        to="/admin/settings"
        className={({ isActive }) => (isActive ? styles.active : '')}
        end
      >
        <Settings size={24} />
        <span>설정</span>
      </NavLink>
    </nav>
  );
}
