// src/player/screens/EventSelectScreen.jsx

import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { db } from '../../firebase';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './EventSelectScreen.module.css';

export default function EventSelectScreen() {
  // ✅ 방어적 비구조화: Provider 미장착 시에도 크래시 방지
  const ctx = useContext(PlayerContext) || {};
  const { setEventId, setParticipant, setAuthCode } = ctx;

  const [availableEvents, setAvailableEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  // YYYY-MM-DD -> YYYY.MM.DD (없으면 '미정')
  const fmt = (s) =>
    (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s))
      ? s.replaceAll('-', '.')
      : '미정';

  useEffect(() => {
    const auth = getAuth();
    (async () => {
      if (!auth.currentUser) {
        try { await signInAnonymously(auth); }
        catch (e) { console.error('익명 로그인 실패', e); }
      }
      try {
        const snap = await getDocs(collection(db, 'events'));
        const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAvailableEvents(events);
      } catch (e) {
        console.error('이벤트 목록 조회 실패', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSelect = (id) => {
    // 컨텍스트/세션 복원(기존 로직 유지)
    // ✅ 컨텍스트가 없을 수 있으므로 옵셔널 호출 + 로컬 스토리지 폴백
    try { localStorage.setItem('eventId', id); } catch {}
    setEventId?.(id);

    const savedPart = JSON.parse(sessionStorage.getItem(`participant_${id}`) || 'null');
    setParticipant?.(savedPart);
    setAuthCode?.(sessionStorage.getItem(`authcode_${id}`) || '');

    // 한 번 인증한 대회는 추가 인증 없이 바로 입장
    const isAuth = sessionStorage.getItem(`auth_${id}`) === 'true';
    nav(isAuth ? `/player/home/${id}` : `/player/home/${id}/login`);
  };

  if (loading) return <p className={styles.loading}>대회 목록을 불러오는 중...</p>;

  return (
    <div className={styles.container}>
      {availableEvents.length === 0 && (
        <p className={styles.empty}>운영 중인 대회가 없습니다.</p>
      )}

      <ul className={styles.list}>
        {availableEvents.map(evt => {
          // 새 필드(dateStart/dateEnd) → 과거(startDate/endDate) 폴백
          const dateStart = evt.dateStart ?? evt.startDate ?? '';
          const dateEnd   = evt.dateEnd   ?? evt.endDate   ?? '';
          const count = Array.isArray(evt.participants) ? evt.participants.length : 0;
          const isFour = (evt.mode === 'agm' || evt.mode === 'fourball');

          return (
            <li
              key={evt.id}
              className={styles.card}
              onClick={() => handleSelect(evt.id)}
            >
              {/* 제목 한 줄 + 모드 배지 */}
              <div className={styles.titleRow}>
                <h3 className={styles.title} title={evt.title}>{evt.title}</h3>
                <span className={`${styles.badge} ${isFour ? styles.badgeFour : styles.badgeStroke}`}>
                  {isFour ? 'AGM 포볼' : '스트로크'}
                </span>
              </div>

              {/* 한 줄: 참가자 → 날짜 */}
              <div className={styles.subline}>
                <span>👥 참가자 {count}명</span>
                <span>📅 {fmt(dateStart)} ~ {fmt(dateEnd)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
