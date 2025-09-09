// /src/player/screens/PlayerEventList.jsx
// 변경 요약:
// - "이미 인증된 대회" 판단을 sessionStorage만 사용(브라우저 재시작 시 초기화 보장)
// - 카드 클릭: 인증됨 → /player/home/:id, 미인증 → /player/home/:id/login
// - 기존 스타일(EventSelectScreen.module.css) 유지
// - ★ patch: 기간 제한 검사 추가(allowDuringPeriodOnly + accessStartAt/accessEndAt/dateStart/dateEnd)
//            허용되지 않으면 클릭 차단 + 카드 시각적 비활성화 + '접속 제한' 라벨 표시

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

  // ★ patch: Timestamp/number 안전 변환
  const tsToMillis = (ts) => {
    if (ts == null) return null;
    if (typeof ts === 'number') return ts;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.seconds === 'number') return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1e6;
    return null;
  };
  // ★ patch: 'YYYY-MM-DD' → 00:00/23:59:59 millis
  const dateStrToMillis = (s, kind /* 'start'|'end' */) => {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const t = kind === 'start' ? '00:00:00' : '23:59:59';
    const d = new Date(`${s}T${t}`);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  };
  // ★ patch: 현재 접속 허용 여부 계산
  const isAccessAllowed = (ev) => {
    const allowDuring = !!ev?.allowDuringPeriodOnly;
    if (!allowDuring) return true; // 제한 없음
    const startAt =
      tsToMillis(ev?.accessStartAt) ??
      dateStrToMillis(ev?.dateStart, 'start');
    const endAt =
      tsToMillis(ev?.accessEndAt) ??
      dateStrToMillis(ev?.dateEnd, 'end');
    const now = Date.now();
    if (startAt && now < startAt) return false;
    if (endAt && now > endAt) return false;
    return true;
  };

  const goNext = async (ev) => {
    // ★ patch: 기간 제한 차단
    if (!isAccessAllowed(ev)) {
      alert('대회 기간이 아닙니다.\n대회 기간 중에만 참가자 접속이 허용됩니다.');
      return;
    }
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
          const accessOk = isAccessAllowed(ev); // ★ patch

          return (
            <li
              key={ev.id}
              className={styles.card}
              onClick={() => goNext(ev)}
              // ★ patch: 시각적 비활성화
              style={accessOk ? undefined : { opacity: 0.55, cursor: 'not-allowed' }}
              title={accessOk ? undefined : '대회 기간 외 접속 제한'}
            >
              <div className={styles.titleRow}>
                <h3 className={styles.title} title={ev.title}>{ev.title || ev.id}</h3>
                <span className={`${styles.badge} ${isFour ? styles.badgeFour : styles.badgeStroke}`}>
                  {isFour ? 'AGM 포맷' : '스트로크'}
                </span>
                {/* ★ patch: 접속 제한 라벨 */}
                {!accessOk && (
                  <span
                    style={{
                      marginLeft: 6,
                      padding: '2px 6px',
                      borderRadius: 8,
                      background: '#fee2e2',
                      color: '#b91c1c',
                      fontSize: 12,
                      fontWeight: 700
                    }}
                  >
                    접속 제한
                  </span>
                )}
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
