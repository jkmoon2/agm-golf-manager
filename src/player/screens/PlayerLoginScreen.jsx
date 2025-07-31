// src/player/screens/PlayerLoginScreen.jsx

import React, { useState, useContext } from 'react';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { doc, getDoc }                from 'firebase/firestore';
import { db }                          from '../../firebase';
import { PlayerContext }              from '../../contexts/PlayerContext';
import styles                          from './PlayerLoginScreen.module.css';
import { useNavigate, useLocation }    from 'react-router-dom';

export default function PlayerLoginScreen() {
  const [inputCode, setInputCode] = useState('');
  const { setEventId, setAuthCode, setParticipant } = useContext(PlayerContext);
  const nav       = useNavigate();
  const { search } = useLocation();

  // ── 쿼리스트링에서 eventId 읽어오기 ──
  const routeEventId = new URLSearchParams(search).get('eventId') || '';

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

    // 2) 이벤트 문서 로드
    const evtSnap = await getDoc(doc(db, 'events', routeEventId));
    if (!evtSnap.exists()) {
      alert('존재하지 않는 대회 ID입니다.');
      return;
    }
    const data = evtSnap.data();

    // 3) 인증 코드 확인
    const part = data.participants?.find(p => p.authCode === inputCode.trim());
    if (!part) {
      alert('인증 코드가 일치하지 않습니다.');
      return;
    }

    // 4) Context 저장 후 8버튼 메뉴로 이동
    setEventId(routeEventId);
    setAuthCode(inputCode.trim());
    setParticipant(part);
    // → 반드시 선택한 eventId를 포함한 경로로 넘겨줍니다
    nav(`/player/home/${routeEventId}`, { replace: true });
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
