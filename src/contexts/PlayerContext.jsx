// src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  updateDoc,
  arrayUnion,
  doc
} from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';   // ← 추가
import { db } from '../firebase';

export const PlayerContext = createContext();

export function PlayerProvider({ children }) {
  const [eventId, setEventId] = useState('');
  const [participant, setParticipant] = useState(null);
  const [authCode, setAuthCode] = useState('');
  const [mode, setMode] = useState('stroke');
  const [rooms, setRooms] = useState([]);
  const [participants, setParticipants] = useState([]);

  useEffect(() => {
    if (!eventId) return;
    const auth = getAuth();
    (async () => {
      try {
        // 1) 파이어스토어 읽기 전 익명 로그인
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
        // 2) 참가자 목록 로드
        const partSnap = await getDocs(collection(db, 'events', eventId, 'participants'));
        setParticipants(partSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        // 3) 방 목록 로드
        const roomSnap = await getDocs(collection(db, 'events', eventId, 'rooms'));
        setRooms(roomSnap.docs.map(d => ({ number: d.data().number, ...d.data() })));
      } catch (err) {
        console.error('Firestore 읽기 오류:', err);
      }
    })();
  }, [eventId]);

  const joinRoom = async (roomNumber, participantId) => {
    const roomRef = doc(db, 'events', eventId, 'rooms', String(roomNumber));
    await updateDoc(roomRef, { players: arrayUnion(participantId) });
  };

  const joinFourBall = async (roomNumber, p1, p2) => {
    const roomRef = doc(db, 'events', eventId, 'fourballRooms', String(roomNumber));
    await updateDoc(roomRef, { teams: arrayUnion({ player1: p1, player2: p2 }) });
  };

  return (
    <PlayerContext.Provider value={{
      eventId,
      setEventId,
      participant,
      setParticipant,
      authCode,
      setAuthCode,
      mode,
      setMode,
      rooms,
      participants,
      joinRoom,
      joinFourBall
    }}>
      {children}
    </PlayerContext.Provider>
  );
}
