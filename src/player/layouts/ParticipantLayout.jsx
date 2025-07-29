// src/player/layouts/ParticipantLayout.jsx

import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Home, Users, BarChart2, Settings } from 'lucide-react';
import styles from './ParticipantLayout.module.css';

export default function ParticipantLayout() {
  return (
    <div className={styles.page}>
      {/* ── 상단 헤더 ── */}
      <header className={styles.header}>
        AGM Golf Manager
      </header>

      {/* ── 본문 ── */}
      <main className={styles.content}>
        <Outlet />
      </main>

      {/* ── 하단 탭바 (운영자와 동일) ── */}
      <nav className={styles.tabbar}>
        <NavLink to="/admin/home" className={({isActive})=> isActive ? styles.tabActive : styles.tab}>
          <Home className={styles.icon}/>
          <span className={styles.label}>홈</span>
        </NavLink>
        <NavLink to="/player/home" className={({isActive})=> isActive ? styles.tabActive : styles.tab}>
          <Users className={styles.icon}/>
          <span className={styles.label}>참가자</span>
        </NavLink>
        <NavLink to="/admin/dashboard" className={({isActive})=> isActive ? styles.tabActive : styles.tab}>
          <BarChart2 className={styles.icon}/>
          <span className={styles.label}>대시보드</span>
        </NavLink>
        <NavLink to="/admin/settings" className={({isActive})=> isActive ? styles.tabActive : styles.tab}>
          <Settings className={styles.icon}/>
          <span className={styles.label}>설정</span>
        </NavLink>
      </nav>
    </div>
  );
}
