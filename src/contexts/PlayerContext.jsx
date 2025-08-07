// src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
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
  const [participants, setParticipants]   = useState([]);
  // 테스트 단계에서는 항상 활성화
  const [allowTeamView, setAllowTeamView] = useState(true);

  // ── 이벤트 로드 및 컨텍스트 초기화 ────────────────────────────────
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      try {
        const ref  = doc(db, 'events', eventId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setParticipants([]);
          setRooms([]);
          return;
        }
        const data = snap.data();

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

        // 모드 설정
        setMode(data.mode === 'fourball' ? 'fourball' : 'stroke');

        // rooms 배열 구성 (스트로크: group 기반)
        if (data.mode === 'stroke') {
          const groups = [...new Set(partArr.map(x => x.group))];
          setRooms(groups.map(g => ({ number: g })));
        } else {
          setRooms([]); // 포볼은 별도 처리
        }

        // 이미 participant 있으면 최신 정보로 갱신
        if (participant) {
          const me = partArr.find(p => p.id === participant.id);
          if (me) setParticipant(me);
        }
      } catch (err) {
        console.error('[PlayerContext] 로드 오류', err);
        setParticipants([]);
        setRooms([]);
      }
    })();
  }, [eventId]);

  // ── 스트로크 방 배정 (STEP5) ────────────────────────────────────
  const joinRoom = async (roomNumber, participantId) => {
    if (!eventId) throw new Error('Missing eventId');

    // 1) 로컬 상태 업데이트
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

    // 2) Firestore: 이벤트 문서 전체 갱신
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, { participants: updatedArr });

    // 3) Firestore: rooms 서브컬렉션에 players 배열로 추가 (없으면 생성)
    const roomRef = doc(db, 'events', eventId, 'rooms', String(roomNumber));
    await setDoc(roomRef, {
      players: arrayUnion(participantId)
    }, { merge: true });

    // 4) 로컬 컨텍스트 반영
    setParticipants(updatedArr);
    if (participant?.id === participantId) {
      setParticipant(prev => prev && ({ ...prev, room: roomNumber }));
    }
  };

  // ── 포볼 팀 배정 (STEP7) ────────────────────────────────────
  const joinFourBall = async (roomNumber, p1, p2) => {
    if (!eventId) throw new Error('Missing eventId');

    // 1) 로컬 participants 업데이트
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

    // 2) 이벤트 문서 갱신
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, { participants: updatedArr });

    // 3) fourballRooms 서브컬렉션에 teams 배열로 추가
    const fbRoomRef = doc(db, 'events', eventId, 'fourballRooms', String(roomNumber));
    await setDoc(fbRoomRef, {
      teams: arrayUnion({ player1: p1, player2: p2 })
    }, { merge: true });

    // 4) 로컬 컨텍스트 반영
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
      rooms,
      participants,
      joinRoom,
      joinFourBall,
      allowTeamView, setAllowTeamView
    }}>
      {children}
    </PlayerContext.Provider>
  );
}
