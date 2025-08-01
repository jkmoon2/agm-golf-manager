// src/player/screens/PlayerLoginScreen.jsx

import React, { useState, useContext, useEffect } from 'react';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { doc, getDoc }                from 'firebase/firestore';
import { db }                          from '../../firebase';
import { PlayerContext }              from '../../contexts/PlayerContext';
import styles                          from './PlayerLoginScreen.module.css';
import { useNavigate, useLocation }    from 'react-router-dom';

export default function PlayerLoginScreen() {
  const [inputCode, setInputCode] = useState('');
  const {
    eventId: ctxEventId,
    participant,
    setEventId,
    setAuthCode,
    setParticipant
  } = useContext(PlayerContext);

  const nav       = useNavigate();
  const { search } = useLocation();
  const routeEventId = new URLSearchParams(search).get('eventId') || '';

  // ── 수정: 이미 이 대회에 인증된 상태면, 바로 8버튼 메뉴로 이동
  useEffect(() => {
    if (ctxEventId === routeEventId && participant) {
      nav('/player/home', { replace: true });
    }
  }, [ctxEventId, participant, routeEventId, nav]);

  const handleSubmit = async e => {
    e.preventDefault();
    const auth = getAuth();
    if (!auth.currentUser) {
      try { await signInAnonymously(auth); }
      catch (err) { alert('익명 로그인 실패: ' + err.message); return; }
    }

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
    nav('/player/home', { replace: true });
  };

  return (
    <div className={styles.page}>
      {/* 1) 상단 헤더 */}
      <header className={styles.header}>
        <h1 className={styles.title}>AGM Golf Manager</h1>
      </header>

      {/* 2) 헤더 아래~탭바 위 전체를 컨테이너로 잡아 카드 중앙 배치 */}
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
