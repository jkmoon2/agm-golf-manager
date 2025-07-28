// src/player/screens/PlayerLoginScreen.jsx

import React, { useState } from 'react';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { doc, getDoc }               from 'firebase/firestore';
import { db }                         from '../../firebase';
import { useParticipant }             from '../../contexts/ParticipantContext';
import { useNavigate, useParams }     from 'react-router-dom';
import styles                         from './PlayerLoginScreen.module.css';

export default function PlayerLoginScreen() {
  const [inputCode, setInputCode] = useState('');
  const { setEventId, setAuthCode, setParticipant } = useParticipant();
  const nav = useNavigate();
  const { eventId: routeEventId } = useParams();

  const handleSubmit = async e => {
    e.preventDefault();
    // 1) 익명 로그인
    const auth = getAuth();
    if (!auth.currentUser) {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        alert('익명 로그인 실패: ' + err.message);
        return;
      }
    }

    // 2) 이벤트 문서 불러오기
    const evtSnap = await getDoc(doc(db, 'events', routeEventId));
    if (!evtSnap.exists()) {
      alert('존재하지 않는 대회 ID입니다.');
      return;
    }
    const data = evtSnap.data();

    // 3) 참가자 인증코드 검사
    const part = data.participants?.find(p => p.authCode === inputCode);
    if (!part) {
      alert('인증 코드가 일치하지 않습니다.');
      return;
    }

    // 4) context 저장 후 홈으로
    setEventId(routeEventId);
    setAuthCode(inputCode);
    setParticipant(part);
    nav('/player/home');
  };

  return (
    <div className={styles.container}>
      <h2>참가자 입장</h2>
      <p>대회 ID: <strong>{routeEventId}</strong></p>
      <form onSubmit={handleSubmit} className={styles.form}>
        <label>
          인증 코드
          <input
            value={inputCode}
            onChange={e => setInputCode(e.target.value)}
            placeholder="인증 코드를 입력하세요"
            required
          />
        </label>
        <button type="submit">입장하기</button>
      </form>
    </div>
  );
}
