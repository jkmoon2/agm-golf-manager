// **src/components/BottomTabBar.jsx**

import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Settings2, User, LayoutDashboard } from 'lucide-react';
import styles from './BottomTabBar.module.css';

const navItems = [
  { label: '홈',       icon: Home,            to: '/' },
  { label: '운영자',   icon: Settings2,       to: '/admin' },
  { label: '참가자',   icon: User,            to: '/participant' },
  { label: '대시보드', icon: LayoutDashboard, to: '/dashboard' },
];

export default function BottomTabBar() {
  return (
    <nav className={styles.navbar}>
      {navItems.map(({ label, icon: Icon, to }) => (
        <NavLink
          key={label}
          to={to}
          className={({ isActive }) =>
            `${styles.item} ${isActive ? styles.active : ''}`
          }
        >
          <Icon size={28} />
          <span className={styles.label}>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}