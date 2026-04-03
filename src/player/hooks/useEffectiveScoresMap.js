// /src/player/hooks/useEffectiveScoresMap.js

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

function asObject(v) {
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}

export default function useEffectiveScoresMap(eventId, ctxScoresMap, ctxScoresReady) {
  const [liveScoresMap, setLiveScoresMap] = useState({});
  const [liveScoresReady, setLiveScoresReady] = useState(false);

  useEffect(() => {
    if (!eventId) {
      setLiveScoresMap({});
      setLiveScoresReady(false);
      return undefined;
    }

    const colRef = collection(db, 'events', String(eventId), 'scores');
    const unsub = onSnapshot(colRef, (snap) => {
      const next = {};
      snap.forEach((d) => {
        const data = d.data() || {};
        if (Object.prototype.hasOwnProperty.call(data, 'score')) {
          next[String(d.id)] = data.score ?? null;
        }
      });
      setLiveScoresMap(next);
      setLiveScoresReady(true);
    }, () => {
      setLiveScoresReady(false);
    });

    return () => {
      try { unsub(); } catch {}
    };
  }, [eventId]);

  return useMemo(() => {
    if (liveScoresReady) {
      return {
        scoresMap: asObject(liveScoresMap),
        scoresReady: true,
      };
    }
    return {
      scoresMap: asObject(ctxScoresMap),
      scoresReady: Boolean(ctxScoresReady),
    };
  }, [liveScoresMap, liveScoresReady, ctxScoresMap, ctxScoresReady]);
}
