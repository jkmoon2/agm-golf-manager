// /src/player/hooks/useLatestEventData.js

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

function tsToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1e6;
  return Number(ts) || 0;
}

function getFreshness(data) {
  if (!data || typeof data !== 'object') return 0;
  return Math.max(
    tsToMillis(data.participantsUpdatedAt),
    Number(data.participantsUpdatedAtClient || 0),
    tsToMillis(data.inputsUpdatedAt),
    tsToMillis(data.gateUpdatedAt),
    tsToMillis(data.updatedAt)
  );
}

export default function useLatestEventData(eventId, eventData) {
  const [fallbackEventData, setFallbackEventData] = useState(null);
  const [fallbackFreshness, setFallbackFreshness] = useState(0);

  useEffect(() => {
    if (!eventId) {
      setFallbackEventData(null);
      setFallbackFreshness(0);
      return undefined;
    }
    const ref = doc(db, 'events', eventId);
    const unsub = onSnapshot(ref, (snap) => {
      const next = snap.data() || null;
      setFallbackEventData(next);
      setFallbackFreshness(getFreshness(next));
    });
    return unsub;
  }, [eventId]);

  const contextFreshness = useMemo(() => getFreshness(eventData), [eventData]);

  return useMemo(() => {
    if (!fallbackEventData) return eventData;
    if (!eventData) return fallbackEventData;
    return (contextFreshness >= fallbackFreshness) ? eventData : fallbackEventData;
  }, [eventData, fallbackEventData, contextFreshness, fallbackFreshness]);
}
