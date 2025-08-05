// src/player/screens/PlayerLoginScreen.jsx

import React, { useState, useContext, useEffect } from 'react';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { doc, getDoc }                from 'firebase/firestore';
import { db }                          from '../../firebase';
import { PlayerContext }              from '../../contexts/PlayerContext';
import styles                          from './PlayerLoginScreen.module.css';
import { useNavigate, useParams }      from 'react-router-dom';

export default function PlayerLoginScreen() {
  const [inputCode, setInputCode] = useState('');
  const {
    eventId: ctxEventId,
    participant,
    setEventId,
    setAuthCode,
    setParticipant
  } = useContext(PlayerContext);

  const nav                     = useNavigate();
  const { eventId: routeEventId } = useParams();

  // ── 로그인 화면 진입 시, 이미 컨텍스트에 참가자가 세팅되어 있으면 바로 8버튼 메뉴로
  useEffect(() => {
    if (ctxEventId === routeEventId && participant) {
      nav(`/player/home/${routeEventId}`, { replace: true });
    }
  }, [ctxEventId, participant, routeEventId, nav]);

  const handleSubmit = async e => {
    e.preventDefault();
    const auth = getAuth();

    // 1) 익명 로그인
    if (!auth.currentUser) {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        alert('익명 로그인 실패: ' + err.message);
        return;
      }
    }

    // 2) 파이어스토어에서 참가자 데이터 가져오기
    let part;
    try {
      const snap = await getDoc(doc(db, 'events', routeEventId));
      if (!snap.exists()) {
        alert('존재하지 않는 대회 ID입니다.');
        return;
      }
      const data = snap.data();
      part = data.participants?.find(p => p.authCode === inputCode.trim());
      if (!part) {
        alert('인증 코드가 일치하지 않습니다.');
        return;
      }
    } catch (err) {
      console.error('로그인 처리 중 오류', err);
      alert('대회 정보를 불러오는 중 오류가 발생했습니다.');
      return;
    }

    // 3) 컨텍스트에 저장
    setEventId(routeEventId);
    setAuthCode(inputCode.trim());
    setParticipant(part);

    // 4) 세션에도 인증 플래그·참가자 정보 저장
    sessionStorage.setItem(`auth_${routeEventId}`, 'true');
    sessionStorage.setItem(`participant_${routeEventId}`, JSON.stringify(part));
    sessionStorage.setItem(`authcode_${routeEventId}`, inputCode.trim());

    // 5) 8버튼 메뉴(PLAYER APP)으로 이동
    nav(`/player/home/${routeEventId}`, { replace: true });
  };

  return (
    <div className={styles.page}>
      {/* 상단 헤더 */}
      <header className={styles.header}>
        <h1 className={styles.title}>AGM Golf Manager</h1>
      </header>

      {/* 로그인 카드 */}
      <div className={styles.container}>
        <div className={styles.card}>
          <h2 className={styles.heading}>참가자 로그인</h2>
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
