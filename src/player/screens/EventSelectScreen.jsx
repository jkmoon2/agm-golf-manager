// src/player/screens/EventSelectScreen.jsx

import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './EventSelectScreen.module.css';

export default function EventSelectScreen() {
  const [events, setEvents] = useState([]);
  const { setEventId } = useContext(PlayerContext);
  const nav = useNavigate();

  useEffect(() => {
    // Firestore에서 이벤트 목록 가져오기
    (async () => {
      const snap = await getDocs(collection(db, 'events'));
      setEvents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    })();
  }, []);

  const handleSelect = id => {
    setEventId(id);
    nav(`/player/login?eventId=${id}`);
  };

  return (
    <div className={styles.container}>
      {events.map(evt => (
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
      {events.length === 0 && <p className={styles.empty}>운영 중인 대회가 없습니다.</p>}
    </div>
  );
}
