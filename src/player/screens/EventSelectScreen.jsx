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

  // ✅ /player/events와 동일: 코드 없으면 로그인으로 즉시 이동
  useEffect(() => {
    try {
      const hasPending = !!sessionStorage.getItem('pending_code');
      const authedSome = Object.keys(sessionStorage).some(k => k.startsWith('auth_') && sessionStorage.getItem(k) === 'true');
      if (!hasPending && !authedSome) nav('/player/login-or-code', { replace: true });
    } catch {}
  }, [nav]);

  const fmt = (s) =>
    (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s))
      ? s.replaceAll('-', '.')
      : '미정';

  const verifyPendingCode = async (eventId) => {
    try {
      const code = sessionStorage.getItem('pending_code') || '';
      if (!code) return false;
      const snap = await getDoc(doc(db, 'events', eventId));
      if (!snap.exists()) return false;
      const findInArray = (arr) => Array.isArray(arr) && arr.find(p => {
        const v = String(p?.authCode ?? p?.code ?? p?.auth_code ?? p?.authcode ?? '').trim();
        return v && v.toUpperCase() === code.toUpperCase();
      });
      let ok = !!findInArray(snap.data().participants);
      if (!ok) {
        const qs = await getDocs(collection(db, 'events', eventId, 'participants'));
        qs.forEach(d => {
          const v = d.data() || {};
          const vv = String(v?.authCode ?? v?.code ?? v?.auth_code ?? v?.authcode ?? '').trim();
          if (vv.toUpperCase() === code.toUpperCase()) ok = true;
        });
      }
      return ok;
    } catch { return false; }
  };

  const goNext = async (ev) => {
    setEventId?.(ev.id);
    try { localStorage.setItem('eventId', ev.id); } catch {}
    const code = sessionStorage.getItem('pending_code');
    if (!code) { nav('/player/login-or-code', { replace: true }); return; }
    const ok = await verifyPendingCode(ev.id);
    if (ok) {
      if (typeof loadEvent === 'function') { try { await loadEvent(ev.id); } catch {} }
      nav(`/player/home/${ev.id}`, { replace: true });
    } else {
      alert('이 대회 참가 명단에 해당 인증코드가 없습니다. 다시 입력해 주세요.');
      try { sessionStorage.removeItem('pending_code'); } catch {}
      nav('/player/login-or-code', { replace: true });
    }
  };

  return (
    <div className={styles.container}>
      {!events.length && <div className={styles.empty}>등록된 대회가 없습니다.</div>}
      <ul className={styles.list}>
        {events.map(ev => (
          <li key={ev.id} className={styles.card} onClick={() => goNext(ev)}>
            <div className={styles.titleRow}>
              <h3 className={styles.title} title={ev.title}>{ev.title || ev.id}</h3>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
