// src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase';

export const PlayerContext = createContext();

export function PlayerProvider({ children }) {
  const [eventId, setEventId]           = useState('');
  const [participant, setParticipant]   = useState(null);
  const [authCode, setAuthCode]         = useState('');
  const [mode, setMode]                 = useState('stroke'); // 또는 'fourball'
  const [rooms, setRooms]               = useState([]);
  const [participants, setParticipants] = useState([]);

  // 이벤트가 바뀔 때마다 Firestore에서 rooms/participants 불러오기
  useEffect(() => {
    if (!eventId) return;

    // 참가자 목록 (subcollection: events/{eventId}/participants)
    getDocs(collection(db, 'events', eventId, 'participants'))
      .then(snapshot => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setParticipants(list);
      })
      .catch(console.error);

    // 방 목록 (subcollection: events/{eventId}/rooms)
    getDocs(collection(db, 'events', eventId, 'rooms'))
      .then(snapshot => {
        const list = snapshot.docs.map(d => ({ number: d.data().number, ...d.data() }));
        setRooms(list);
      })
      .catch(console.error);
  }, [eventId]);

  // 스트로크 모드 방 배정 (운영자 STEP5 로직)
  const joinRoom = async (roomNumber, participantId) => {
    const roomRef = doc(db, 'events', eventId, 'rooms', String(roomNumber));
    await updateDoc(roomRef, {
      players: arrayUnion(participantId)
    });
  };

  // 포볼 모드 팀 배정 (운영자 STEP7 로직)
  const joinFourBall = async (roomNumber, p1, p2) => {
    const roomRef = doc(db, 'events', eventId, 'fourballRooms', String(roomNumber));
    await updateDoc(roomRef, {
      teams: arrayUnion({ player1: p1, player2: p2 })
    });
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
