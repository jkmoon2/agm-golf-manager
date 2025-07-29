// src/player/screens/PlayerLoginScreen.jsx

import React, { useState, useContext } from 'react';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { doc, getDoc }               from 'firebase/firestore';
import { db }                         from '../../firebase';
import { PlayerContext }             from '../../contexts/PlayerContext';
import styles                         from './PlayerLoginScreen.module.css';

export default function PlayerLoginScreen() {
  const [inputCode, setInputCode] = useState('');
  const { setEventId, setAuthCode, setParticipant } = useContext(PlayerContext);

  const handleSubmit = async e => {
    e.preventDefault();
    const auth = getAuth();
    if (!auth.currentUser) {
      try { await signInAnonymously(auth); }
      catch (err) { alert('익명 로그인 실패: ' + err.message); return; }
    }
    // URLSearchParams 혹은 useParams() 로 이벤트 ID 받아오기
    const routeEventId = new URLSearchParams(window.location.search).get('eventId') || '';

    const evtSnap = await getDoc(doc(db, 'events', routeEventId));
    if (!evtSnap.exists()) {
      alert('존재하지 않는 대회 ID입니다.');
      return;
    }
    const data = evtSnap.data();
    const part = data.participants?.find(p => p.authCode === inputCode.trim());
    if (!part) {
      alert('인증 코드가 일치하지 않습니다.');
      return;
    }
    setEventId(routeEventId);
    setAuthCode(inputCode.trim());
    setParticipant(part);
    window.location.href = '/player/home';
  };

  return (
    <div className={styles.page}>
      {/* 1) 상단 헤더 */}
      <header className={styles.header}>
        <h1 className={styles.title}>AGM Golf Manager</h1>
      </header>

      {/* 2) 로그인 카드 */}
      <div className={styles.container}>
        <div className={styles.card}>
          <h2 className={styles.heading}>참가자</h2>
          <form onSubmit={handleSubmit} className={styles.form}>
            <input
              type="text"
              className={styles.input}
              value={inputCode}
              onChange={e => setInputCode(e.target.value)}
              placeholder="인증 코드를 입력하세요"
              required
            />
            <button type="submit" className={styles.button}>
              입장하기
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
