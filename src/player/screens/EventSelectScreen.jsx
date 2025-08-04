// src/player/screens/EventSelectScreen.jsx

import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './EventSelectScreen.module.css';

export default function EventSelectScreen() {
  const {
    availableEvents,
    eventId: currentEventId,
    participant,
    setEventId    // ← 수정: setEventId 사용
  } = useContext(PlayerContext);

  const nav = useNavigate();

  const handleSelect = id => {
    if (id === currentEventId && participant) {
      // 이미 인증된 대회면 바로 8버튼 메뉴로 이동
      nav(`/player/home/${id}`);
    } else {
      // 처음 선택하거나 새로운 대회면, ID 설정 후 중첩된 로그인 경로로
      setEventId(id);
      nav(`/player/home/${id}/login`);    // ← 수정: 로그인 URL 변경
    }
  };

  return (
    <div className={styles.container}>
      {availableEvents.map(evt => (
        <div
          key={evt.id}
          className={styles.card}
          onClick={() => handleSelect(evt.id)}
        >
          <h3 className={styles.title}>{evt.title}</h3>
          <p className={styles.meta}>
            📅 {evt.startDate} ~ {evt.endDate}
          </p>
          <p className={styles.meta}>
            👥 참가자 {evt.participants?.length || 0}명
          </p>
        </div>
      ))}
      {availableEvents.length === 0 && (
        <p className={styles.empty}>운영 중인 대회가 없습니다.</p>
      )}
    </div>
  );
}