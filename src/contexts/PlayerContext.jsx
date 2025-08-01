// src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export const PlayerContext = createContext({
  eventId:          null,
  authCode:         '',
  participant:      null,
  availableEvents:  [],       // ── 새로 추가
  setEventId:       () => {},
  setAuthCode:      () => {},
  setParticipant:   () => {},
  setAvailableEvents: () => {} // ── 새로 추가
});

export function PlayerProvider({ children }) {
  const [eventId, setEventId]           = useState(null);
  const [authCode, setAuthCode]         = useState('');
  const [participant, setParticipant]   = useState(null);
  const [availableEvents, setAvailableEvents] = useState([]); // ── 새로 추가

  // ── 마운트 시점에 Firestore에서 대회 리스트 조회 ──
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'events'));
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAvailableEvents(list);
      } catch (err) {
        console.error('이벤트 목록 로드 실패', err);
      }
    })();
  }, []);

  return (
    <PlayerContext.Provider value={{
      eventId,
      authCode,
      participant,
      availableEvents,      // ── 새로 추가
      setEventId,
      setAuthCode,
      setParticipant,
      setAvailableEvents    // ── 새로 추가
    }}>
      {children}
    </PlayerContext.Provider>
  );
}
