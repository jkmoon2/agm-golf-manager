// /src/player/screens/PlayerEventList.jsx

import React, { useContext, useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventContext } from '../../contexts/EventContext';
import { db } from '../../firebase';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';
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

  // /player/events로 바로 들어온 경우: 코드도 없고 이전 인증도 없으면 로그인으로
  useEffect(() => {
    try {
      const hasPending = !!sessionStorage.getItem('pending_code');
      const authedSome = Object.keys(sessionStorage).some(
        k => k.startsWith('auth_') && sessionStorage.getItem(k) === 'true'
      );
      if (!hasPending && !authedSome) {
        nav('/player/login-or-code', { replace: true });
      }
    } catch {}
  }, [nav]);

  const fmt = (s) =>
    (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s))
      ? s.replaceAll('-', '.')
      : '미정';

  const tsToMillis = (ts) => {
    if (ts == null) return null;
    if (typeof ts === 'number') return ts;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.seconds === 'number') return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1e6;
    return null;
  };
  const dateStrToMillis = (s, kind) => {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const t = kind === 'start' ? '00:00:00' : '23:59:59';
    const d = new Date(`${s}T${t}`);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  };
  const getStartEnd = (ev) => ({
    startAt: tsToMillis(ev?.accessStartAt) ?? dateStrToMillis(ev?.dateStart, 'start'),
    endAt:   tsToMillis(ev?.accessEndAt)   ?? dateStrToMillis(ev?.dateEnd, 'end'),
  });
  const isAccessAllowed = (ev) => {
    if (!ev?.allowDuringPeriodOnly) return true;
    const { startAt, endAt } = getStartEnd(ev);
    const now = Date.now();
    if (startAt && now < startAt) return false;
    if (endAt && now > endAt) return false;
    return true;
  };
  const isEnded = (ev) => {
    const { endAt } = getStartEnd(ev);
    return !!(endAt && Date.now() > endAt);
  };

  const verifyPendingCode = async (eventId) => {
    try {
      const code = sessionStorage.getItem('pending_code') || '';
      if (!code) return { ok:false };
      const snap = await getDoc(doc(db, 'events', eventId));
      if (!snap.exists()) return { ok:false };

      const findInArray = (arr) =>
        Array.isArray(arr) && arr.find(p => {
          const v = String(p?.authCode ?? p?.code ?? p?.auth_code ?? p?.authcode ?? '').trim();
          return v && v.toUpperCase() === code.toUpperCase();
        });

      let participant = findInArray(snap.data().participants);
      if (!participant) {
        const qs = await getDocs(collection(db, 'events', eventId, 'participants'));
        qs.forEach(d => {
          const v = d.data() || {};
          const vv = String(v?.authCode ?? v?.code ?? v?.auth_code ?? v?.authcode ?? '').trim();
          if (!participant && vv.toUpperCase() === code.toUpperCase()) participant = { id: d.id, ...v };
        });
      }
      if (!participant) return { ok:false };

      // 통과 처리 (세션 보존)
      sessionStorage.setItem(`auth_${eventId}`, 'true');
      sessionStorage.setItem(`authcode_${eventId}`, sessionStorage.getItem('pending_code') || '');
      sessionStorage.setItem(`participant_${eventId}`, JSON.stringify(participant));
      localStorage.setItem(`ticket:${eventId}`, JSON.stringify({ code: sessionStorage.getItem('pending_code') || '', ts: Date.now() }));
      return { ok:true, participant };
    } catch {
      return { ok:false };
    }
  };

  const goNext = async (ev) => {
    if (!isAccessAllowed(ev)) { alert('대회 기간이 아닙니다.'); return; }
    setEventId?.(ev.id);
    try { localStorage.setItem('eventId', ev.id); } catch {}

    // ✅ 변경 1: 이 대회가 이미 인증돼 있으면 코드 없이 바로 입장 (세션 유지)
    try {
      if (sessionStorage.getItem(`auth_${ev.id}`) === 'true') {
        if (typeof loadEvent === 'function') { try { await loadEvent(ev.id); } catch {} }
        nav(`/player/home/${ev.id}`, { replace: true });
        return;
      }
    } catch {}

    // 아직 인증되지 않은 대회는 pending_code로 검증
    const code = sessionStorage.getItem('pending_code');
    if (!code) {
      alert('먼저 참가자 로그인 화면에서 인증코드를 입력해 주세요.');
      nav('/player/login-or-code', { replace: true });
      return;
    }

    const { ok } = await verifyPendingCode(ev.id);
    if (ok) {
      if (typeof loadEvent === 'function') { try { await loadEvent(ev.id); } catch {} }
      nav(`/player/home/${ev.id}`, { replace: true });
    } else {
      alert('이 대회 참가 명단에 해당 인증코드가 없습니다. 다시 입력해 주세요.');
      try { sessionStorage.removeItem('pending_code'); } catch {}
      nav('/player/login-or-code', { replace: true });
    }
  };

  const endedBadgeStyle = {
    marginLeft: 6,
    padding: '2px 6px',
    borderRadius: 8,
    background: '#fee2e2',
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap'
  };

  return (
    <div className={styles.container}>
      {!events.length && <div className={styles.empty}>등록된 대회가 없습니다.</div>}
      <ul className={styles.list}>
        {events.map(ev => {
          const dateStart = ev.dateStart ?? ev.startDate ?? '';
          const dateEnd   = ev.dateEnd   ?? ev.endDate   ?? '';
          const count = Array.isArray(ev.participants) ? ev.participants.length : 0;
          const isFour = (ev.mode === 'agm' || ev.mode === 'fourball');
          const accessOk = isAccessAllowed(ev);
          const ended = isEnded(ev);

          return (
            <li
              key={ev.id}
              className={styles.card}
              onClick={() => goNext(ev)}
              style={accessOk ? undefined : { opacity: 0.55, cursor: 'not-allowed' }}
              title={accessOk ? undefined : '대회 기간 외 접속 제한'}
            >
              <div className={styles.titleRow}>
                <h3 className={styles.title} title={ev.title}>{ev.title || ev.id}</h3>
                <span className={`${styles.badge} ${isFour ? styles.badgeFour : styles.badgeStroke}`}>
                  {isFour ? 'AGM 포볼' : '스트로크'}
                </span>
                {ended && <span style={endedBadgeStyle}>종료</span>}
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
