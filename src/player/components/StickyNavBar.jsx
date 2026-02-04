// src/player/components/StickyNavBar.jsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../screens/PlayerRoomSelect.module.css';

/**
 * 공용 하단 고정바
 * - 좌/우 여백을 STEP1과 맞추기 위해 sideGap을 24로 상향(필요시 조정)
 * - 버튼 모양은 PlayerRoomSelect.module.css 의 .btn/.btnBlue/.btnGray 재사용
 */
export default function StickyNavBar({ left, right, sideGap = 16 }) {
  const navigate = useNavigate();

  const barStyle = {
    position: 'fixed',
    left: sideGap,
    right: sideGap,
    // 탭바 높이(기본 64px)는 CSS 변수(--app-tab-h)로 관리
    bottom: 'calc(env(safe-area-inset-bottom) + var(--app-tab-h, 64px))',
    zIndex: 20,
    background: '#fff',
    padding: '12px 0',
    borderTop: '1px solid #eee',
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
  };

  const btnClass = (variant) =>
    `${styles.btn} ${variant === 'gray' ? styles.btnGray : styles.btnBlue}`;

  const handle = (cfg) => () => {
    if (!cfg) return;
    if (cfg.onClick) return cfg.onClick();
    if (cfg.to) return navigate(cfg.to);
  };

  return (
    <div style={barStyle}>
      {left && (
        <button
          className={btnClass(left.variant || 'gray')}
          style={{ flex: 1 }}
          onClick={handle(left)}
          disabled={left.disabled}
        >
          {left.label}
        </button>
      )}
      {right && (
        <button
          className={btnClass(right.variant || 'blue')}
          style={{ flex: 1 }}
          onClick={handle(right)}
          disabled={right.disabled}
        >
          {right.label}
        </button>
      )}
    </div>
  );
}
