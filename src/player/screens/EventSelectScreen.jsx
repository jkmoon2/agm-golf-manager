// src/player/screens/EventSelectScreen.jsx

import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './EventSelectScreen.module.css';

export default function EventSelectScreen() {
  const {
    eventId: currentEventId,
    participant,
    setEventId,
    setParticipant,
    setAuthCode
  } = useContext(PlayerContext);

  const [availableEvents, setAvailableEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  // 1) Firestore에서 대회 리스트 불러오기
  useEffect(() => {
    (async () => {
      try {
        const snapshot = await getDocs(collection(db, 'events'));
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAvailableEvents(list);
      } catch (err) {
        console.error('대회 목록 로드 실패:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSelect = id => {
    // 2) 컨텍스트에 eventId 설정하고 이전 인증 초기화
    setEventId(id);
    setParticipant(null);
    setAuthCode('');
    // 3) localStorage 인증 기록 확인
    const key = `auth_${id}`;
    const isAuth = localStorage.getItem(key) === 'true';
    if (isAuth) {
      // 이미 인증된 대회면 바로 8버튼 메뉴로
      nav(`/player/home/${id}`);
    } else {
      // 처음 인증 필요 시 로그인 화면으로
      nav(`/player/home/${id}/login`);
    }
  };

  if (loading) {
    return <p className={styles.loading}>대회 목록을 불러오는 중...</p>;
  }

  return (
    <div className={styles.container}>
      {availableEvents.length === 0 && (
        <p className={styles.empty}>운영 중인 대회가 없습니다.</p>
      )}
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
    </div>
  );
}
