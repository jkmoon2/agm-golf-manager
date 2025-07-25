// src/player/layouts/ParticipantLayout.jsx

import React from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import styles from './ParticipantLayout.module.css';

export default function ParticipantLayout() {
  const loc = useLocation().pathname;
  const isActive = (path) => loc.startsWith(path) ? styles.active : '';

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <Outlet />
      </div>
      <nav className={styles.tabbar}>
        <Link to="/admin/home" className={styles.tab + ' ' + isActive('/admin')}>
          홈
        </Link>
        <Link to="/player/home" className={styles.tab + ' ' + isActive('/player')}>
          참가자
        </Link>
        <Link to="/admin/dashboard" className={styles.tab + ' ' + isActive('/admin/dashboard')}>
          대시보드
        </Link>
        <Link to="/admin/settings" className={styles.tab + ' ' + isActive('/admin/settings')}>
          설정
        </Link>
      </nav>
    </div>
);
}
