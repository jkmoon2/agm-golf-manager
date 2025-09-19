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
  } = useContext(PlayerContext) || {};

  const nav                       = useNavigate();
  const { eventId: routeEventId } = useParams();

  // ✅ 진입 즉시: eventId 설정 + 같은 "세션"에서 이미 인증했다면 바로 홈으로 이동
  useEffect(() => {
    setEventId?.(routeEventId);
    try {
      const authed = sessionStorage.getItem(`auth_${routeEventId}`) === 'true';
      if (authed) {
        const code = sessionStorage.getItem(`authcode_${routeEventId}`) || '';
        const partJson = sessionStorage.getItem(`participant_${routeEventId}`);
        if (code) setAuthCode?.(code);
        if (partJson) setParticipant?.(JSON.parse(partJson));
        // ✅ StepFlow 게이트 통과용 티켓 보강
        try { localStorage.setItem(`ticket:${routeEventId}`, JSON.stringify({ via:'legacy', ts: Date.now() })); } catch {}
        nav(`/player/home/${routeEventId}/1`, { replace: true });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeEventId]);

  // (보조) 컨텍스트가 이미 갖춰졌다면 홈으로
  useEffect(() => {
    const isAuth = sessionStorage.getItem(`auth_${routeEventId}`) === 'true';
    if (isAuth && ctxEventId === routeEventId && participant) {
      try { localStorage.setItem(`ticket:${routeEventId}`, JSON.stringify({ via:'legacy', ts: Date.now() })); } catch {}
      nav(`/player/home/${routeEventId}/1`, { replace: true });
    }
  }, [ctxEventId, participant, routeEventId, nav]);

  const handleSubmit = async e => {
    e.preventDefault();
    const auth = getAuth();

    // 1) 익명 로그인(필요 시)
    if (!auth.currentUser) {
      try { await signInAnonymously(auth); }
      catch (err) { alert('익명 로그인 실패: ' + err.message); return; }
    }

    // 2) 대회 데이터 가져와서 인증 코드 검사
    let part;
    try {
      const snap = await getDoc(doc(db, 'events', routeEventId));
      if (!snap.exists()) { alert('존재하지 않는 대회 ID입니다.'); return; }
      part = snap.data().participants?.find(p => String(p.authCode) === inputCode.trim());
      if (!part) { alert('인증 코드가 일치하지 않습니다.'); return; }
    } catch (err) {
      console.error('로그인 중 오류', err);
      alert('대회 정보를 불러오던 중 오류가 발생했습니다.');
      return;
    }

    // 3) 컨텍스트에 저장
    setEventId?.(routeEventId);
    setAuthCode?.(inputCode.trim());
    setParticipant?.(part);

    // 4) 인증 상태는 "세션"에만 기록(재시작하면 초기화됨) + StepFlow 게이트용 티켓 추가
    try {
      sessionStorage.setItem(`auth_${routeEventId}`, 'true');
      sessionStorage.setItem(`authcode_${routeEventId}`, inputCode.trim());
      sessionStorage.setItem(`participant_${routeEventId}`, JSON.stringify(part));
      localStorage.setItem(`ticket:${routeEventId}`, JSON.stringify({ code: inputCode.trim(), ts: Date.now() }));
    } catch {}

    // 5) 이동
    nav(`/player/home/${routeEventId}/1`, { replace: true });
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h2 className={styles.title}>인증코드로 입장</h2>
        <div className={styles.form}>
          <form onSubmit={handleSubmit}>
            <input
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
