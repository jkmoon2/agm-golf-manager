// src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase';

export const PlayerContext = createContext();

export function PlayerProvider({ children }) {
  const [eventId, setEventId]             = useState('');
  const [participant, setParticipant]     = useState(null);
  const [authCode, setAuthCode]           = useState('');
  const [mode, setMode]                   = useState('stroke');
  const [rooms, setRooms]                 = useState([]);
  const [roomNames, setRoomNames]         = useState([]);
  const [participants, setParticipants]   = useState([]);
  const [allowTeamView, setAllowTeamView] = useState(false);

  // ── 1) 이벤트 로드 및 컨텍스트 초기화 ────────────────────────────────
  //    └ eventId가 바뀔 때만 한 번 실행하도록 종속성은 [eventId] 로만 설정
  useEffect(() => {
    if (!eventId) return;

    (async () => {
      try {
        const ref  = doc(db, 'events', eventId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setParticipants([]);
          setRooms([]);
          setRoomNames([]);
          return;
        }
        const data = snap.data();

        // roomNames 세팅 (Admin STEP2 에서 만든 이름 배열)
        setRoomNames(Array.isArray(data.roomNames) ? data.roomNames : []);

        // participants 배열 보정
        const partArr = (data.participants || []).map((p, i) => ({
          id:       String(p.id ?? i),
          nickname: p.nickname  ?? '',
          handicap: p.handicap  ?? 0,
          group:    p.group     ?? 0,
          authCode: p.authCode  ?? '',
          room:     p.room      ?? null,
          partner:  p.partner   ?? null,
          score:    p.score     ?? null,
          selected: p.selected  ?? false,
        }));
        setParticipants(partArr);

        // 모드 세팅
        setMode(data.mode === 'fourball' ? 'fourball' : 'stroke');

        // rooms 목록 구성 (스트로크: group 기반)
        if (data.mode === 'stroke') {
          const groups = [...new Set(partArr.map(x => x.group))];
          setRooms(groups.map(g => ({ number: g })));
        } else {
          setRooms([]);
        }
      } catch (err) {
        console.error('[PlayerContext] 로드 오류', err);
        setParticipants([]);
        setRooms([]);
        setRoomNames([]);
      }
    })();
  }, [eventId]);


  // ── 2) participants 배열이 바뀔 때, 로그인된 participant 도 최신 정보로 동기화 ───
  useEffect(() => {
    if (!participant) return;
    const me = participants.find(p => p.id === participant.id);
    if (me) {
      setParticipant(me);
    }
  }, [participants]);


  // ── 스트로크 방 배정 ────────────────────────────────────
  const joinRoom = async (roomNumber, participantId) => {
    if (!eventId) throw new Error('Missing eventId');

    const updatedArr = participants.map(p =>
      p.id === participantId
        ? { ...p, room: roomNumber }
        : p
    ).map(p => ({
      id:       p.id,
      nickname: p.nickname,
      handicap: p.handicap,
      group:    p.group,
      authCode: p.authCode,
      room:     p.room,
      partner:  p.partner,
      score:    p.score,
      selected: p.selected
    }));

    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, { participants: updatedArr });

    const roomRef = doc(db, 'events', eventId, 'rooms', String(roomNumber));
    await updateDoc(roomRef, {
      players: arrayUnion(participantId)
    });

    setParticipants(updatedArr);
    if (participant?.id === participantId) {
      setParticipant(prev => prev && ({ ...prev, room: roomNumber }));
    }
  };


  // ── 포볼 팀 배정 ────────────────────────────────────
  const joinFourBall = async (roomNumber, p1, p2) => {
    if (!eventId) throw new Error('Missing eventId');

    const updatedArr = participants.map(p => {
      if (p.id === p1) return { ...p, room: roomNumber, partner: p2 };
      if (p.id === p2) return { ...p, room: roomNumber, partner: p1 };
      return p;
    }).map(p => ({
      id:       p.id,
      nickname: p.nickname,
      handicap: p.handicap,
      group:    p.group,
      authCode: p.authCode,
      room:     p.room,
      partner:  p.partner,
      score:    p.score,
      selected: p.selected
    }));

    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, { participants: updatedArr });

    const fbRoomRef = doc(db, 'events', eventId, 'fourballRooms', String(roomNumber));
    await updateDoc(fbRoomRef, {
      teams: arrayUnion({ player1: p1, player2: p2 })
    });

    setParticipants(updatedArr);
    if (participant?.id === p1) {
      setParticipant(prev => prev && ({ ...prev, room: roomNumber, partner: p2 }));
    }
    if (participant?.id === p2) {
      setParticipant(prev => prev && ({ ...prev, room: roomNumber, partner: p1 }));
    }
  };


  return (
    <PlayerContext.Provider value={{
      eventId, setEventId,
      participant, setParticipant,
      authCode, setAuthCode,
      mode, setMode,
      rooms, roomNames,
      participants,
      joinRoom,
      joinFourBall,
      allowTeamView, setAllowTeamView
    }}>
      {children}
    </PlayerContext.Provider>
  );
}
