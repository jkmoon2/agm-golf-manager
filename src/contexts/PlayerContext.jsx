// src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import { pickRoomForStroke } from '../player/logic/assignStroke';
import { pickRoomForFourball } from '../player/logic/assignFourball';

export const PlayerContext = createContext();

export function PlayerProvider({ children }) {
  const [eventId, setEventId]           = useState('');
  const [participant, setParticipant]   = useState(null);
  const [authCode, setAuthCode]         = useState('');
  const [mode, setMode]                 = useState('stroke'); // 'stroke' | 'fourball'
  const [rooms, setRooms]               = useState([]);
  const [participants, setParticipants] = useState([]);
  const [allowTeamView, setAllowTeamView] = useState(false);

  const [roomCount, setRoomCount] = useState(4);
  const [roomNames, setRoomNames] = useState([]);

  useEffect(() => {
    if (!eventId) return;
    (async () => {
      try {
        const ref = doc(db, 'events', eventId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setParticipants([]); setRooms([]); setRoomCount(4); setRoomNames([]); setMode('stroke');
          return;
        }
        const data = snap.data();

        // participants 정규화(항상 문자열 id)
        const partArr = (data.participants || []).map((p, i) => ({
          id:       String(p.id ?? i),
          nickname: p.nickname ?? '',
          handicap: p.handicap ?? 0,
          group:    p.group ?? 0,
          authCode: p.authCode ?? '',
          room:     p.room ?? null,
          partner:  p.partner != null ? String(p.partner) : null,
          score:    p.score ?? null,
          selected: p.selected ?? false,
        }));
        setParticipants(partArr);

        // 'agm'도 fourball로 취급
        setMode((data.mode === 'fourball' || data.mode === 'agm') ? 'fourball' : 'stroke');

        const rn = Array.isArray(data.roomNames) ? data.roomNames : [];
        const rc = Number.isInteger(data.roomCount) ? data.roomCount : (rn.length || 4);
        setRoomCount(rc);
        setRoomNames(Array.from({ length: rc }, (_, i) => rn[i]?.trim() || ''));

        setRooms(Array.from({ length: rc }, (_, i) => ({ number: i + 1 })));

        // 로그인된 본인 동기화
        if (participant) {
          const me = partArr.find(p => p.id === String(participant.id));
          if (me) setParticipant(me);
        }
      } catch (err) {
        console.error('[PlayerContext] 로드 오류', err);
        setParticipants([]); setRooms([]); setRoomCount(4); setRoomNames([]); setMode('stroke');
      }
    })();
  }, [eventId]);

  // participants가 바뀌면 내 정보만 동기화
  useEffect(() => {
    if (!participant) return;
    const me = participants.find(p => p.id === String(participant.id));
    if (me && (me.room !== participant.room || me.partner !== participant.partner || me.score !== participant.score)) {
      setParticipant(me);
    }
  }, [participants]); // eslint-disable-line react-hooks/exhaustive-deps

  const mergeArrayUnion = async (ref, payload) => setDoc(ref, payload, { merge: true });

  // ── 스트로크: 한 명 자동 배정
  const assignStrokeForOne = async (participantId) => {
    if (!eventId) throw new Error('Missing eventId');
    const pid = String(participantId);
    const me  = participants.find(p => p.id === pid);
    if (!me) throw new Error('Participant not found');

    const chosenRoom = pickRoomForStroke({ participants, roomCount, target: me });

    const updated = participants.map(p =>
      (p.id === pid) ? { ...p, room: chosenRoom } : p
    );

    await updateDoc(doc(db, 'events', eventId), { participants: updated });
    await mergeArrayUnion(doc(db, 'events', eventId, 'rooms', String(chosenRoom)), {
      players: arrayUnion(pid),
    });

    setParticipants(updated);
    if (participant?.id === pid) setParticipant(prev => prev && ({ ...prev, room: chosenRoom }));
    return { roomNumber: chosenRoom };
  };

  // ── 포볼: 방 자동선택 + 파트너 자동선택
  const assignFourballForOneAndPartner = async (participantId) => {
    if (!eventId) throw new Error('Missing eventId');
    const pid = String(participantId);
    const me  = participants.find(p => p.id === pid);
    if (!me) throw new Error('Participant not found');

    const roomNumber = pickRoomForFourball({ participants, roomCount, target: me });

    const half = Math.floor(participants.length / 2);
    const isGroup1 = Number(me.id) < half; // 기존 로직 존중
    const isFree = (p) => p.partner == null;

    let mate = participants.find(p =>
      p.id !== me.id && (Number(p.id) < half) !== isGroup1 && p.room === roomNumber && isFree(p)
    );
    if (!mate) {
      mate = participants.find(p =>
        p.id !== me.id && (Number(p.id) < half) !== isGroup1 && isFree(p)
      );
    }

    const updated = participants.map(p => {
      if (mate && p.id === mate.id) return { ...p, room: roomNumber, partner: me.id };
      if (p.id === me.id)           return { ...p, room: roomNumber, partner: mate ? mate.id : null };
      return p;
    });

    await updateDoc(doc(db, 'events', eventId), { participants: updated });

    const fbRef = doc(db, 'events', eventId, 'fourballRooms', String(roomNumber));
    if (mate) {
      await mergeArrayUnion(fbRef, { teams: arrayUnion({ player1: me.id, player2: mate.id }) });
    } else {
      await mergeArrayUnion(fbRef, { placeholders: arrayUnion(me.id) });
    }

    setParticipants(updated);
    if (participant?.id === me.id) {
      setParticipant(prev => prev && ({ ...prev, room: roomNumber, partner: mate ? mate.id : null }));
    }
    return { roomNumber, partnerNickname: mate?.nickname || null };
  };

  // ── 기존 API 유지(비교 시 문자열화)
  const joinRoom = async (roomNumber, participantId) => {
    if (!eventId) throw new Error('Missing eventId');
    const pid = String(participantId);
    const updated = participants.map(p => (p.id === pid ? { ...p, room: roomNumber } : p));
    await updateDoc(doc(db, 'events', eventId), { participants: updated });
    await mergeArrayUnion(doc(db, 'events', eventId, 'rooms', String(roomNumber)), { players: arrayUnion(pid) });
    setParticipants(updated);
    if (participant?.id === pid) setParticipant(prev => prev && ({ ...prev, room: roomNumber }));
  };

  const joinFourBall = async (roomNumber, p1, p2) => {
    if (!eventId) throw new Error('Missing eventId');
    const a = String(p1), b = String(p2);
    const updated = participants.map(p => {
      if (p.id === a) return { ...p, room: roomNumber, partner: b };
      if (p.id === b) return { ...p, room: roomNumber, partner: a };
      return p;
    });
    await updateDoc(doc(db, 'events', eventId), { participants: updated });
    await mergeArrayUnion(doc(db, 'events', eventId, 'fourballRooms', String(roomNumber)), {
      teams: arrayUnion({ player1: a, player2: b }),
    });
    setParticipants(updated);
    if (participant?.id === a) setParticipant(prev => prev && ({ ...prev, room: roomNumber, partner: b }));
    if (participant?.id === b) setParticipant(prev => prev && ({ ...prev, room: roomNumber, partner: a }));
  };

  return (
    <PlayerContext.Provider value={{
      eventId, setEventId,
      participant, setParticipant,
      authCode, setAuthCode,
      mode, setMode,
      rooms, roomCount, roomNames,
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
