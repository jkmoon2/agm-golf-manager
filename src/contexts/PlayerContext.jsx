// src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import {
  doc, getDoc, updateDoc, setDoc, arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase';

// 참가자 전용 자동 배정 유틸
import { pickRoomForStroke } from '../player/logic/assignStroke';
import { pickRoomForFourball } from '../player/logic/assignFourball';

export const PlayerContext = createContext();

export function PlayerProvider({ children }) {
  const [eventId, setEventId]             = useState('');
  const [participant, setParticipant]     = useState(null);
  const [authCode, setAuthCode]           = useState('');
  const [mode, setMode]                   = useState('stroke'); // 'stroke' | 'fourball'
  const [rooms, setRooms]                 = useState([]);
  const [participants, setParticipants]   = useState([]);
  const [allowTeamView, setAllowTeamView] = useState(false);

  // Admin STEP2 연동 값
  const [roomCount, setRoomCount] = useState(4);
  const [roomNames, setRoomNames] = useState([]);

  // 이벤트 정보 로드
  useEffect(() => {
    if (!eventId) return;

    (async () => {
      try {
        const ref = doc(db, 'events', eventId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setParticipants([]);
          setRooms([]);
          setRoomCount(4);
          setRoomNames([]);
          setMode('stroke');
          return;
        }

        const data = snap.data();

        // 참가자 배열 보정
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

        // 모드: 'agm' 도 fourball로 동일 취급
        setMode((data.mode === 'fourball' || data.mode === 'agm') ? 'fourball' : 'stroke');

        // 방수/방이름
        const rn = Array.isArray(data.roomNames) ? data.roomNames : [];
        const rc = Number.isInteger(data.roomCount) ? data.roomCount : (rn.length || 4);
        setRoomCount(rc);
        setRoomNames(Array.from({ length: rc }, (_, i) => rn[i]?.trim() || ''));

        // rooms 호환(1..N)
        setRooms(Array.from({ length: rc }, (_, i) => ({ number: i + 1 })));

        // 로그인된 본인 최신화
        if (participant) {
          const me = partArr.find(p => p.id === participant.id);
          if (me) setParticipant(me);
        }
      } catch (err) {
        console.error('[PlayerContext] 로드 오류', err);
        setParticipants([]);
        setRooms([]);
        setRoomCount(4);
        setRoomNames([]);
        setMode('stroke');
      }
    })();
  }, [eventId]); // participant를 넣으면 루프 위험

  // participants가 바뀌면 내 정보만 동기화(무한루프 방지)
  useEffect(() => {
    if (!participant) return;
    const me = participants.find(p => p.id === participant.id);
    if (me && (me.room !== participant.room || me.partner !== participant.partner || me.score !== participant.score)) {
      setParticipant(me);
    }
  }, [participants]); // eslint-disable-line react-hooks/exhaustive-deps

  // setDoc merge + arrayUnion 사용 도우미
  const mergeArrayUnion = async (ref, payload) => {
    await setDoc(ref, payload, { merge: true });
  };

  // ─────────────────────────  스트로크 (STEP5 룰) ─────────────────────────
  const assignStrokeForOne = async (participantId) => {
    if (!eventId) throw new Error('Missing eventId');
    const me = participants.find(p => p.id === participantId);
    if (!me) throw new Error('Participant not found');

    const chosenRoom = pickRoomForStroke({
      participants,
      roomCount,
      target: me,
    });

    const updated = participants.map(p =>
      p.id === participantId ? { ...p, room: chosenRoom } : p
    );

    // Firestore
    await updateDoc(doc(db, 'events', eventId), { participants: updated });
    await mergeArrayUnion(doc(db, 'events', eventId, 'rooms', String(chosenRoom)), {
      players: arrayUnion(participantId),
    });

    setParticipants(updated);
    if (participant?.id === participantId) {
      setParticipant(prev => prev && ({ ...prev, room: chosenRoom }));
    }

    return { roomNumber: chosenRoom };
  };

  // ─────────────────────────  포볼 (STEP7 룰) ─────────────────────────
  // 방 자동선택 + 파트너 자동선택까지 한 번에 처리
  const assignFourballForOneAndPartner = async (participantId) => {
    if (!eventId) throw new Error('Missing eventId');
    const me = participants.find(p => p.id === participantId);
    if (!me) throw new Error('Participant not found');

    // 1) 방 자동선택
    const roomNumber = pickRoomForFourball({
      participants,
      roomCount,
      target: me,
    });

    // 2) 파트너 자동선택: 반대 그룹에서 아직 파트너 없는 사람 우선
    const half = Math.floor(participants.length / 2);
    const isGroup1 = Number(me.id) < half;
    const isFree   = (p) => p.partner == null;

    // 2-1) 같은 방에 이미 들어와 있는 반대그룹 '미배정 파트너' 우선
    let mate = participants.find(p =>
      p.id !== me.id &&
      (Number(p.id) < half) !== isGroup1 &&
      p.room === roomNumber &&
      isFree(p)
    );

    // 2-2) 그게 없다면, 반대그룹 중 아직 파트너 없는 사람 아무나
    if (!mate) {
      mate = participants.find(p =>
        p.id !== me.id &&
        (Number(p.id) < half) !== isGroup1 &&
        isFree(p)
      );
    }

    // 3) participants 배열 갱신
    let updated = participants.map(p => {
      if (mate && p.id === mate.id) return { ...p, room: roomNumber, partner: me.id };
      if (p.id === me.id)           return { ...p, room: roomNumber, partner: mate ? mate.id : null };
      return p;
    });

    // 4) Firestore 반영
    await updateDoc(doc(db, 'events', eventId), { participants: updated });

    // fourballRooms 컬렉션 업데이트
    const fbRef = doc(db, 'events', eventId, 'fourballRooms', String(roomNumber));
    if (mate) {
      await mergeArrayUnion(fbRef, {
        teams: arrayUnion({ player1: me.id, player2: mate.id }),
      });
    } else {
      // 파트너가 아직 없으면 자리만 표시(옵션)
      await mergeArrayUnion(fbRef, {
        placeholders: arrayUnion(me.id),
      });
    }

    // 5) 로컬 반영
    setParticipants(updated);
    if (participant?.id === me.id) {
      setParticipant(prev => prev && ({ ...prev, room: roomNumber, partner: mate ? mate.id : null }));
    }

    return { roomNumber, partnerNickname: mate?.nickname || null };
  };

  // ─────────────────────────  기존 API (유지) ─────────────────────────
  const joinRoom = async (roomNumber, participantId) => {
    if (!eventId) throw new Error('Missing eventId');

    const updated = participants.map(p =>
      p.id === participantId ? { ...p, room: roomNumber } : p
    );
    await updateDoc(doc(db, 'events', eventId), { participants: updated });
    await mergeArrayUnion(doc(db, 'events', eventId, 'rooms', String(roomNumber)), {
      players: arrayUnion(participantId),
    });
    setParticipants(updated);
    if (participant?.id === participantId) {
      setParticipant(prev => prev && ({ ...prev, room: roomNumber }));
    }
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
      // 기존
      joinRoom, joinFourBall,
      // 신규
      assignStrokeForOne,
      assignFourballForOneAndPartner,
      allowTeamView, setAllowTeamView,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}
