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
import { getAuth, onAuthStateChanged } from 'firebase/auth';

export const PlayerContext = createContext();

export function PlayerProvider({ children }) {
  const [eventId, setEventId]             = useState('');
  const [participant, setParticipant]     = useState(null);
  const [authCode, setAuthCode]           = useState('');
  const [mode, setMode]                   = useState('stroke');
  const [rooms, setRooms]                 = useState([]);
  const [participants, setParticipants]   = useState([]);

  // 1) 익명 인증 상태 구독
  const [authUser, setAuthUser] = useState(null);
  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, user => {
      setAuthUser(user);
    });
  }, []);

  // 2) eventId + authUser 준비되면 Firestore에서 participants 불러오기 & rooms 유도
  useEffect(() => {
    if (!eventId || !authUser) return;

    // --- participants 서브컬렉션 또는 fallback 배열 ---
    getDocs(collection(db, 'events', eventId, 'participants'))
      .then(snapshot => {
        if (!snapshot.empty) {
          const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          setParticipants(list);
          return null;
        } else {
          return getDoc(doc(db, 'events', eventId));
        }
      })
      .then(evtDoc => {
        if (evtDoc && evtDoc.exists()) {
          const data = evtDoc.data();
          if (Array.isArray(data.participants)) {
            setParticipants(
              data.participants.map((p, i) => ({ id: p.id ?? `p${i}`, ...p }))
            );
          }
        }
      })
      .catch(console.error);

    // --- rooms 서브컬렉션이 비어 있으면 participants.group 기반으로 rooms 생성 ---
    getDocs(collection(db, 'events', eventId, 'rooms'))
      .then(snapshot => {
        if (!snapshot.empty) {
          const list = snapshot.docs.map(d => ({
            number: d.data().number,
            ...d.data()
          }));
          setRooms(list);
        } else {
          // fallback: participants 배열에서 group 번호로 rooms 목록 생성
          setTimeout(() => {
            setRooms(prev => {
              // use the participants state just set above
              const groups = participants
                .map(p => p.group)
                .filter(g => g != null);
              const unique = [...new Set(groups)];
              return unique.map(num => ({ number: num }));
            });
          }, 0);
        }
      })
      .catch(console.error);
  }, [eventId, authUser, participants]);

  // 3) 스트로크 모드: 방 배정
  const joinRoom = async (roomNumber, participantId) => {
    const roomRef = doc(db, 'events', eventId, 'rooms', String(roomNumber));
    await updateDoc(roomRef, {
      players: arrayUnion(participantId)
    });
    // 즉시 UI 반영
    setRooms(rs =>
      rs.map(r =>
        r.number === roomNumber
          ? { ...r, players: [...(r.players || []), participantId] }
          : r
      )
    );
  };

  // 4) 포볼 모드: 팀 배정
  const joinFourBall = async (roomNumber, p1, p2) => {
    const fbRef = doc(db, 'events', eventId, 'fourballRooms', String(roomNumber));
    await updateDoc(fbRef, {
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
