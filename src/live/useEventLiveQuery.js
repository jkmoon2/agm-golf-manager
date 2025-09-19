// /src/live/useEventLiveQuery.js
// 이벤트 문서 + participants 서브컬렉션을 실시간 구독하는 경량 훅.
// onSnapshot을 써서 여러 사람이 동시에 변경해도 즉시 갱신됨.

import { useEffect, useState, useRef } from 'react';
import { doc, collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

export function useEventLiveQuery(eventId, opts = {}) {
  const [eventData, setEventData] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(!!eventId);
  const unsubRef = useRef([]);

  useEffect(() => {
    // 구독 해제
    unsubRef.current.forEach(u => { try{ u(); }catch{} });
    unsubRef.current = [];
    setEventData(null);
    setParticipants([]);
    if (!eventId) { setLoading(false); return; }
    setLoading(true);

    // 1) 이벤트 문서
    const u1 = onSnapshot(doc(db, 'events', eventId), (snap) => {
      setEventData(snap.exists() ? snap.data() : null);
      setLoading(false);
    }, (err) => {
      console.warn('[useEventLiveQuery] event doc error:', err);
      setLoading(false);
    });
    unsubRef.current.push(u1);

    // 2) 참가자 서브컬렉션(있으면)
    const qy = query(collection(db, 'events', eventId, 'participants'), orderBy('createdAt', 'asc'));
    const u2 = onSnapshot(qy, (qs) => {
      const rows = [];
      qs.forEach(d => rows.push({ id: d.id, ...d.data() }));
      setParticipants(rows);
    }, (err) => {
      // 컬렉션이 없거나 권한이 없으면 조용히 넘어감
      if (opts.silent !== false) console.info('[useEventLiveQuery] no participants or no permission:', err?.code);
    });
    unsubRef.current.push(u2);

    return () => {
      unsubRef.current.forEach(u => { try{ u(); }catch{} });
      unsubRef.current = [];
    };
  }, [eventId]);

  return { eventData, participants, loading };
}
