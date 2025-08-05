// src/player/screens/EventSelectScreen.jsx

import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
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
      if (!auth.currentUser) {
        try { await signInAnonymously(auth); }
        catch (e) { console.error('익명 로그인 실패', e); }
      }
      try {
        const snap = await getDocs(collection(db, 'events'));
        setAvailableEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('이벤트 목록 조회 실패', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSelect = id => {
    // 대회 컨텍스트 복원 또는 초기화
    setEventId(id);
    const savedPart = JSON.parse(sessionStorage.getItem(`participant_${id}`) || 'null');
    setParticipant(savedPart);
    setAuthCode(sessionStorage.getItem(`authcode_${id}`) || '');

    // 인증 여부 검사
    const isAuth = sessionStorage.getItem(`auth_${id}`) === 'true';
    nav(isAuth ? `/player/home/${id}` : `/player/home/${id}/login`);
  };

  if (loading) return <p className={styles.loading}>대회 목록을 불러오는 중...</p>;

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
