// src/screens/PlayerHome.jsx

import React, { useContext, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PlayerContext } from '../contexts/PlayerContext';
import styles from './PlayerHome.module.css';

export default function PlayerHome() {
  const { eventId, participant } = useContext(PlayerContext);
  const [eventData, setEventData] = useState(null);

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, 'events', eventId));
      if (snap.exists()) setEventData(snap.data());
    }
    if (eventId) load();
  }, [eventId]);

  if (!eventId) return <div>먼저 참가자 입장을 해주세요.</div>;
  if (!eventData) return <div>불러오는 중...</div>;

  return (
    <div className={styles.container}>
      <h2>{eventData.title}</h2>
      <div>방 개수: {eventData.roomCount}</div>
      <div>내 방 번호: {participant.room}</div>
      <div>파트너: {participant.partner}</div>
    </div>
  );
}