// src/player/screens/EventSelectScreen.jsx

import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';   // ← 추가
import { db } from '../../firebase';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './EventSelectScreen.module.css';

export default function EventSelectScreen() {
  const { setEventId, setParticipant, setAuthCode } = useContext(PlayerContext);
  const [availableEvents, setAvailableEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    const auth = getAuth();
    (async () => {
      try {
        // 1) 파이어스토어 읽기 전 익명 로그인
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
        // 2) 이벤트 목록 조회
        const snap = await getDocs(collection(db, 'events'));
        setAvailableEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSelect = id => {
    setEventId(id);
    setParticipant(null);
    setAuthCode('');
    nav(`/player/home/${id}/login`);
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
          <p className={styles.meta}>📅 {evt.startDate} ~ {evt.endDate}</p>
          <p className={styles.meta}>👥 참가자 {evt.participants?.length || 0}명</p>
        </div>
      ))}
    </div>
  );
}
