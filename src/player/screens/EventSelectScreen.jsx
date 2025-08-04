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
    setEventId,    // ← 수정
    setParticipant, // ← 수정: 이전 인증 정보 초기화
    setAuthCode     // ← 수정: 인증 코드 초기화
  } = useContext(PlayerContext);

  const nav = useNavigate();

  const handleSelect = id => {
    // 모든 대회마다 최초 한 번만 로그인 후, 이후 다시 인증 없이 진입
    const key = `auth_${id}`;
    const isAuthenticated = localStorage.getItem(key) === 'true';
    setEventId(id);
    if (isAuthenticated) {
      nav(`/player/home/${id}`);
    } else {
      setParticipant(null);  // 이전 인증 데이터 초기화
      setAuthCode('');       // 이전 인증 코드 초기화
      nav(`/player/home/${id}/login`);
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
