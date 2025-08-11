// src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';

// 참가자 전용 자동 배정 유틸
import { pickRoomForStroke } from '../player/logic/assignStroke';
import { pickRoomForFourball } from '../player/logic/assignFourball';

export const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const [eventId, setEventId]             = useState('');
  const [participant, setParticipant]     = useState(null);
  const [authCode, setAuthCode]           = useState('');
  const [mode, setMode]                   = useState('stroke'); // 'stroke' | 'fourball' | 'agm'->fourball
  const [rooms, setRooms]                 = useState([]);
  const [participants, setParticipants]   = useState([]);
  const [allowTeamView, setAllowTeamView] = useState(false);

  // Admin STEP2 연동 값
  const [roomCount, setRoomCount] = useState(4);
  const [roomNames, setRoomNames] = useState([]);

  // 이벤트 로드
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      try {
        const ref = doc(db, 'events', eventId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setParticipants([]); setRooms([]); setRoomCount(4); setRoomNames([]);
          setMode('stroke');
          return;
        }
        const data = snap.data();

        const partArr = (data.participants || []).map((p, i) => ({
          id:       String(p.id ?? i),
          nickname: p.nickname ?? '',
          handicap: p.handicap ?? 0,
          group:    p.group ?? 0,
          authCode: p.authCode ?? '',
          room:     p.room ?? null,
          partner:  p.partner ?? null,
          score:    p.score ?? null,
          selected: p.selected ?? false,
        }));
        setParticipants(partArr);

        setMode((data.mode === 'fourball' || data.mode === 'agm') ? 'fourball' : 'stroke');

        const rn = Array.isArray(data.roomNames) ? data.roomNames : [];
        const rc = Number.isInteger(data.roomCount) ? data.roomCount : (rn.length || 4);
        setRoomCount(rc);
        setRoomNames(Array.from({ length: rc }, (_, i) => rn[i]?.trim() || ''));
        setRooms(Array.from({ length: rc }, (_, i) => ({ number: i + 1 })));

        if (participant) {
          const me = partArr.find(p => p.id === participant.id);
          if (me) setParticipant(me);
        }
      } catch (err) {
        console.error('[PlayerContext] 로드 오류', err);
        setParticipants([]); setRooms([]); setRoomCount(4); setRoomNames([]);
        setMode('stroke');
      }
    })();
  }, [eventId]); // participant 포함 금지(루프 위험)

  // participants 변경 시 내 정보 동기화(루프 방지)
  useEffect(() => {
    if (!participant) return;
    const me = participants.find(p => p.id === participant.id);
    if (me && (me.room !== participant.room || me.partner !== participant.partner || me.score !== participant.score)) {
      setParticipant(me);
    }
  }, [participants]); // eslint-disable-line react-hooks/exhaustive-deps

  // setDoc merge + arrayUnion helper
  const mergeArrayUnion = async (ref, payload) => setDoc(ref, payload, { merge: true });

  // ── 스트로크: 한 명 자동 배정(STEP5)
  const assignStrokeForOne = async (participantId) => {
    if (!eventId) throw new Error('Missing eventId');
    const me = participants.find(p => p.id === participantId);
    if (!me) throw new Error('Participant not found');

    const chosenRoom = pickRoomForStroke({ participants, roomCount, target: me });

    const updated = participants.map(p => p.id === participantId ? { ...p, room: chosenRoom } : p);
    await updateDoc(doc(db, 'events', eventId), { participants: updated });
    await mergeArrayUnion(doc(db, 'events', eventId, 'rooms', String(chosenRoom)), { players: arrayUnion(participantId) });

    setParticipants(updated);
    if (participant?.id === participantId) setParticipant(prev => prev && ({ ...prev, room: chosenRoom }));
    return { roomNumber: chosenRoom };
  };

  // ── 포볼: 방+파트너 자동선택(STEP7, 무작위)
  const assignFourballForOneAndPartner = async (participantId) => {
    if (!eventId) throw new Error('Missing eventId');
    const me = participants.find(p => p.id === participantId);
    if (!me) throw new Error('Participant not found');

    const roomNumber = pickRoomForFourball({ participants, roomCount, target: me });

    const half = Math.floor(participants.length / 2);
    const isGroup1 = Number(me.id) < half;
    const isFree   = (p) => p.partner == null;

    let candidates = participants.filter(p =>
      p.id !== me.id && (Number(p.id) < half) !== isGroup1 && p.room === roomNumber && isFree(p)
    );
    if (candidates.length === 0) {
      candidates = participants.filter(p => p.id !== me.id && (Number(p.id) < half) !== isGroup1 && isFree(p));
    }
    const mate = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;

    const updated = participants.map(p => {
      if (mate && p.id === mate.id) return { ...p, room: roomNumber, partner: me.id };
      if (p.id === me.id)           return { ...p, room: roomNumber, partner: mate ? mate.id : null };
      return p;
    });

    await updateDoc(doc(db, 'events', eventId), { participants: updated });

    const fbRef = doc(db, 'events', eventId, 'fourballRooms', String(roomNumber));
    if (mate) await mergeArrayUnion(fbRef, { teams: arrayUnion({ player1: me.id, player2: mate.id }) });
    else      await mergeArrayUnion(fbRef, { placeholders: arrayUnion(me.id) });

    setParticipants(updated);
    if (participant?.id === me.id) {
      setParticipant(prev => prev && ({ ...prev, room: roomNumber, partner: mate ? mate.id : null }));
    }
    return { roomNumber, partnerNickname: mate?.nickname || null };
  };

  // ── 기존 API 유지
  const joinRoom = async (roomNumber, participantId) => {
    if (!eventId) throw new Error('Missing eventId');
    const updated = participants.map(p => p.id === participantId ? { ...p, room: roomNumber } : p);
    await updateDoc(doc(db, 'events', eventId), { participants: updated });
    await mergeArrayUnion(doc(db, 'events', eventId, 'rooms', String(roomNumber)), { players: arrayUnion(participantId) });
    setParticipants(updated);
    if (participant?.id === participantId) setParticipant(prev => prev && ({ ...prev, room: roomNumber }));
  };

  const joinFourBall = async (roomNumber, p1, p2) => {
    if (!eventId) throw new Error('Missing eventId');
    const updated = participants.map(p => {
      if (p.id === p1) return { ...p, room: roomNumber, partner: p2 };
      if (p.id === p2) return { ...p, room: roomNumber, partner: p1 };
      return p;
    });
    await updateDoc(doc(db, 'events', eventId), { participants: updated });
    await mergeArrayUnion(doc(db, 'events', eventId, 'fourballRooms', String(roomNumber)), {
      teams: arrayUnion({ player1: p1, player2: p2 }),
    });
    setParticipants(updated);
    if (participant?.id === p1) setParticipant(prev => prev && ({ ...prev, room: roomNumber, partner: p2 }));
    if (participant?.id === p2) setParticipant(prev => prev && ({ ...prev, room: roomNumber, partner: p1 }));
  };

  return (
    <PlayerContext.Provider value={{
      eventId, setEventId,
      participant, setParticipant,
      authCode, setAuthCode,
      mode, setMode,
      rooms,
      roomCount, roomNames,
      participants,
      joinRoom, joinFourBall,
      assignStrokeForOne,
      assignFourballForOneAndPartner,
      allowTeamView, setAllowTeamView,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

// 기존 코드들이 named import를 쓰므로 named export 유지.
// (원하면 아래 줄은 생략해도 됨)
export default PlayerProvider;
