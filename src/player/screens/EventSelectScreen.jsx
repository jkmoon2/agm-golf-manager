//src/player/screens/EventSelectScreen.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import styles from './EventSelectScreen.module.css';

export default function EventSelectScreen() {
  const [events, setEvents] = useState([]);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, 'events'));
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    })();
  }, []);

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>참가할 대회를 선택하세요</h2>
      <div className={styles.grid}>
        {events.map(evt => (
          <button
            key={evt.id}
            className={styles.card}
            onClick={() => nav(`/player/login?eventId=${evt.id}`)}
          >
            <div className={styles.title}>{evt.title || evt.id}</div>
            <div className={styles.meta}>{evt.date || ''}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
