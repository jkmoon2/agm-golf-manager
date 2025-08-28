// src/player/screens/PlayerResults.jsx

import React, { useContext } from 'react';
import { PlayerContext } from '../../contexts/PlayerContext';
import StickyNavBar from '../components/StickyNavBar';
import styles from './PlayerRoomSelect.module.css';

export default function PlayerResults() {
  const { eventId } = useContext(PlayerContext);

  return (
    <div className={styles.container} style={{ paddingBottom: 160 }}>
      {/* 기존 본문 UI가 있다면 여기에 그대로 렌더 */}
      <div className={styles.notice} style={{ marginTop: 12 }}>
        결과 화면입니다. (기존 구현이 있다면 그대로 렌더)
      </div>

      <StickyNavBar
        left={{ label: '← 이전', to: `/player/home/${eventId}/4`, variant: 'gray' }}
        right={{ label: '다음 →', to: `/player/home/${eventId}/6`, variant: 'blue' }}
      />
    </div>
  );
}
