// src/player/screens/PlayerLoginScreen.jsx

import React, { useState } from 'react';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { doc, getDoc }               from 'firebase/firestore';
import { db }                         from '../../firebase';
import { useParticipant }             from '../../contexts/ParticipantContext';
import { useNavigate, useParams }     from 'react-router-dom';
import styles                         from './PlayerLoginScreen.module.css';

export default function PlayerLoginScreen() {
  const [code, setCode] = useState('');
  const { setEventId, setAuthCode, setParticipant } = useParticipant();
  const nav = useNavigate();
  const { eventId } = useParams();

  const handleSubmit = async e => {
    e.preventDefault();
    const auth = getAuth();
    if (!auth.currentUser) {
      try { await signInAnonymously(auth); }
      catch (err) { return alert('로그인 실패: '+err.message); }
    }
    const snap = await getDoc(doc(db, 'events', eventId));
    if (!snap.exists()) return alert('존재하지 않는 이벤트');
    const part = snap.data().participants.find(p => p.authCode === code);
    if (!part) return alert('인증 코드가 일치하지 않습니다.');
    setEventId(eventId);
    setAuthCode(code);
    setParticipant(part);
    nav('/player/home');
  };

  return (
    <div className={styles.fullscreen}>
      <div className={styles.card}>
        <h2 className={styles.title}>참가자 입장</h2>
        <p className={styles.subtitle}>대회 ID: {eventId}</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="text"
            className={styles.input}
            placeholder="인증 코드를 입력하세요"
            value={code}
            onChange={e => setCode(e.target.value)}
            required
          />
          <button type="submit" className={styles.submit}>입장하기</button>
        </form>
      </div>
    </div>
  );
}
