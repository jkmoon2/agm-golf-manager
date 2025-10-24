// /src/player/screens/EventSelectScreen.jsx

import React, { useContext, useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventContext } from '../../contexts/EventContext';
import { db } from '../../firebase';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';
import styles from './EventSelectScreen.module.css';

export default function EventSelectScreen() {
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

  const wasAuthed = (id) => {
    try { return sessionStorage.getItem(`auth_${id}`) === 'true'; }
    catch { return false; }
  };

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

  const tryPendingCode = async (eventId) => {
    try {
      const code = sessionStorage.getItem('pending_code') || '';
      if (!code) return false;
      const snap = await getDoc(doc(db, 'events', eventId));
      if (!snap.exists()) return false;
      const part = (snap.data().participants || []).find(p => String(p.authCode) === code);
      if (!part) return false;
      sessionStorage.setItem(`auth_${eventId}`, 'true');
      sessionStorage.setItem(`authcode_${eventId}`, code);
      sessionStorage.setItem(`participant_${eventId}`, JSON.stringify(part));
      try { localStorage.setItem(`ticket:${eventId}`, JSON.stringify({ code, ts: Date.now() })); } catch {}
      return true;
    } catch { return false; }
  };

  const goNext = async (ev) => {
    if (!isAccessAllowed(ev)) {
      alert('대회 기간이 아닙니다.\n대회 기간 중에만 참가자 접속이 허용됩니다.');
      return;
    }
    try { localStorage.setItem('eventId', ev.id); } catch {}
    setEventId?.(ev.id);
    if (typeof loadEvent === 'function') { try { await loadEvent(ev.id); } catch {} }

    if (wasAuthed(ev.id)) { nav(`/player/home/${ev.id}/1`); return; }

    const ok = await tryPendingCode(ev.id);
    if (ok) nav(`/player/home/${ev.id}/1`);
    else    nav(`/player/login/${ev.id}`);
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
