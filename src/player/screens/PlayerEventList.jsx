// /src/player/screens/PlayerEventList.jsx
// 변경 요약:
// - "이미 인증된 대회" 판단을 sessionStorage만 사용(브라우저 재시작 시 초기화 보장)
// - 카드 클릭: 인증됨 → /player/home/:id, 미인증 → /player/home/:id/login
// - 기존 스타일(EventSelectScreen.module.css) 유지

import React, { useContext, useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventContext } from '../../contexts/EventContext';
import { db } from '../../firebase';
import { collection, getDocs } from 'firebase/firestore';
import styles from './EventSelectScreen.module.css';

export default function PlayerEventList() {
  const nav = useNavigate();
  const { allEvents = [], loadEvent, setEventId } = useContext(EventContext) || {};
  const [cache, setCache] = useState([]);
  const events = useMemo(() => (allEvents?.length ? allEvents : cache), [allEvents, cache]);

  useEffect(() => {
    (async () => {
      if (allEvents && allEvents.length) return;
      const snap = await getDocs(collection(db, 'events'));
      const list = [];
      snap.forEach(d => { const v = d.data() || {}; list.push({ id: d.id, ...v }); });
      setCache(list);
    })();
  }, [allEvents]);

  const fmt = (s) =>
    (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s))
      ? s.replaceAll('-', '.')
      : '미정';

  // ✅ 같은 "세션"에서만 인증 유지
  const wasAuthed = (id) => {
    try {
      return sessionStorage.getItem(`auth_${id}`) === 'true';
    } catch {
      return false;
    }
  };

  const goNext = async (ev) => {
    try { localStorage.setItem('eventId', ev.id); } catch {}
    setEventId?.(ev.id);
    if (typeof loadEvent === 'function') {
      try { await loadEvent(ev.id); } catch {}
    }
    if (wasAuthed(ev.id)) {
      nav(`/player/home/${ev.id}`);
    } else {
      nav(`/player/home/${ev.id}/login`);
    }
  };

  return (
    <div className={styles.container}>
      {/* 상단 중복 제목 제거 */}

      {!events.length && <div style={{ color:'#6b7280', padding: 12 }}>등록된 대회가 없습니다.</div>}

      <ul className={styles.list}>
        {events.map(ev => {
          const dateStart = ev.dateStart ?? ev.startDate ?? '';
          const dateEnd   = ev.dateEnd   ?? ev.endDate   ?? '';
          const count = Array.isArray(ev.participants) ? ev.participants.length : 0;
          const isFour = (ev.mode === 'agm' || ev.mode === 'fourball');

          return (
            <li key={ev.id} className={styles.card} onClick={() => goNext(ev)}>
              <div className={styles.titleRow}>
                <h3 className={styles.title} title={ev.title}>{ev.title || ev.id}</h3>
                <span className={`${styles.badge} ${isFour ? styles.badgeFour : styles.badgeStroke}`}>
                  {isFour ? 'AGM 포맷' : '스트로크'}
                </span>
              </div>
              <div className={styles.subline}>
                <span>👥 참가자 {count}명</span>
                {(dateStart || dateEnd) && <span>📅 {fmt(dateStart)} ~ {fmt(dateEnd)}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
