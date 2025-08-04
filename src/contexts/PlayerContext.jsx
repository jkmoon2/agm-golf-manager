// src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';          // ← getDoc 제거
import { db } from '../firebase';

export const PlayerContext = createContext();

export function PlayerProvider({ children }) {
  const [eventId, setEventId]           = useState('');
  const [participant, setParticipant]   = useState(null);
  const [authCode, setAuthCode]         = useState('');
  const [mode, setMode]                 = useState('stroke');
  const [rooms, setRooms]               = useState([]);
  const [participants, setParticipants] = useState([]);

  useEffect(() => {
    if (!eventId) return;

    // 참가자 목록
    getDocs(collection(db, 'events', eventId, 'participants'))
      .then(snapshot => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setParticipants(list);
      })
      .catch(console.error);

    // 방 목록
    getDocs(collection(db, 'events', eventId, 'rooms'))
      .then(snapshot => {
        const list = snapshot.docs.map(d => ({ number: d.data().number, ...d.data() }));
        setRooms(list);
      })
      .catch(console.error);
  }, [eventId]);

  // 스트로크 모드 방 배정 (STEP5)
  const joinRoom = async (roomNumber, participantId) => {
    const roomRef = doc(db, 'events', eventId, 'rooms', String(roomNumber));
    await updateDoc(roomRef, { players: arrayUnion(participantId) });
  };

  // 포볼 모드 팀 배정 (STEP7)
  const joinFourBall = async (roomNumber, p1, p2) => {
    const roomRef = doc(db, 'events', eventId, 'fourballRooms', String(roomNumber));
    await updateDoc(roomRef, { teams: arrayUnion({ player1: p1, player2: p2 }) });
  };

  return (
    <PlayerContext.Provider value={{
      eventId, setEventId,
      participant, setParticipant,
      authCode, setAuthCode,
      mode, setMode,
      rooms, participants,
      joinRoom, joinFourBall
    }}>
      {children}
    </PlayerContext.Provider>
  );
}
