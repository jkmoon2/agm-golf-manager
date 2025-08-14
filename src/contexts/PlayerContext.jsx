// src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';

// (기존) 자동 배정 유틸
import { pickRoomForStroke } from '../player/logic/assignStroke';
import { pickRoomForFourball } from '../player/logic/assignFourball';

export const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  // ───────────────── 상태 ─────────────────
  const [eventId, setEventId]             = useState('');
  const [participant, setParticipant]     = useState(null);   // {id, nickname, room, partner, gHandi, ...}
  const [authCode, setAuthCode]           = useState('');
  const [mode, setMode]                   = useState('stroke'); // 'stroke' | 'fourball' | 'agm'
  const [rooms, setRooms]                 = useState([]);
  const [participants, setParticipants]   = useState([]);
  const [allowTeamView, setAllowTeamView] = useState(false);

  // Admin STEP2
  const [roomCount, setRoomCount] = useState(0);
  const [roomNames, setRoomNames] = useState([]);

  // ✅ 권장 해결: 객체 participant를 의존성에 넣지 않고 ID만 추적
  const myId = participant?.id ?? null;

  // ───────────────── 유틸 ─────────────────
  const normalizeParticipant = (p) => ({
    id: String(p?.id ?? ''),
    nickname: p?.nickname ?? '',
    room: p?.room ?? null,
    partner: p?.partner ?? null,
    gHandi: typeof p?.gHandi === 'number' ? p.gHandi : (Number(p?.gHandi) || 0),
    ...p,
  });

  // ───────────────── 데이터 로드 ─────────────────
  // 이벤트 문서 로드: eventRef를 이펙트 안에서 생성(의존성 경고 제거)
  useEffect(() => {
    if (!eventId) return;

    let cancelled = false;
    (async () => {
      try {
        const ref  = doc(db, 'events', eventId);
        const snap = await getDoc(ref);
        const data = snap.exists() ? (snap.data() || {}) : {};

        const m = (data.mode === 'agm') ? 'fourball' : (data.mode || 'stroke');
        if (!cancelled) setMode(m);

        if (!cancelled) {
          setRoomCount(Number(data.roomCount || 0));
          setRoomNames(Array.isArray(data.roomNames) ? data.roomNames : []);
        }

        const list = Array.isArray(data.participants)
          ? data.participants.map(normalizeParticipant)
          : [];

        if (!cancelled) {
          setParticipants(list);
          if (myId) {
            const me = list.find(p => p.id === myId);
            if (me) setParticipant(me);
          }
        }
      } catch (e) {
        console.error('Failed to load event:', e);
      }
    })();

    return () => { cancelled = true; };
    // ✅ eventRef를 참조하지 않으므로 의존성은 eventId, myId만
  }, [eventId, myId]);

  // participants 변경 시 내 정보 동기화
  useEffect(() => {
    if (!myId) return;
    const me = participants.find(p => p.id === myId);
    if (me) {
      setParticipant(prev => (prev && prev.id === myId ? { ...prev, ...me } : me));
    }
  }, [participants, myId]);

  // ───────────────── Firestore 업데이트 공통 ─────────────────
  const writeParticipants = async (next) => {
    if (!eventId) throw new Error('No event selected');
    await updateDoc(doc(db, 'events', eventId), { participants: next });
    setParticipants(next);
  };

  // rooms/fourballRooms 서브컬렉션 안전 쓰기
  const pushRoomMember = async (collectionName, roomNumber, payload) => {
    if (!eventId) return;
    const ref = doc(db, 'events', eventId, collectionName, String(roomNumber));
    await setDoc(ref, { members: arrayUnion(payload) }, { merge: true });
  };

  // ───────────────── 노출 API ─────────────────
  // 방 직접 입장(스트로크)
  const joinRoom = async (roomNumber, id) => {
    const pid = String(id ?? myId);
    if (!pid) throw new Error('Missing participant id');

    const next = participants.map(p =>
      p.id === pid ? { ...p, room: Number(roomNumber) } : p
    );
    await writeParticipants(next);
    await pushRoomMember('rooms', Number(roomNumber), { id: pid });
  };

  // 포볼 직접 조인
  const joinFourBall = async (roomNumber, p1, p2) => {
    const a = String(p1), b = String(p2);
    const next = participants.map(p => {
      if (p.id === a) return { ...p, room: Number(roomNumber), partner: b };
      if (p.id === b) return { ...p, room: Number(roomNumber), partner: a };
      return p;
    });
    await writeParticipants(next);
    await pushRoomMember('fourballRooms', Number(roomNumber), { ids: [a, b] });
  };

  // 자동 배정: 스트로크(한 명)
  const assignStrokeForOne = async (id) => {
    const my = participants.find(p => p.id === String(id ?? myId));
    if (!my) throw new Error('Participant not found');

    const roomNumber = pickRoomForStroke({ participants, roomCount, target: my });

    const next = participants.map(p =>
      p.id === my.id ? { ...p, room: roomNumber } : p
    );

    await new Promise(r => setTimeout(r, 600));
    await writeParticipants(next);
    await pushRoomMember('rooms', roomNumber, { id: my.id });

    return { roomNumber };
  };

  // 자동 배정: 포볼(본인 + 파트너)
  const assignFourballForOneAndPartner = async (id) => {
    const participantId = String(id ?? myId);
    const me = participants.find(p => p.id === participantId);
    if (!me) throw new Error('Participant not found');

    const roomNumber = pickRoomForFourball({ participants, roomCount, target: me });

    // 1조/2조 반대편 + 파트너 미배정
    const half = Math.floor(participants.length / 2);
    const isGroup1 = Number(me.id) < half;
    const isFree   = (p) => p.partner == null;

    let candidates = participants.filter(p =>
      p.id !== me.id && (Number(p.id) < half) !== isGroup1 && p.room === roomNumber && isFree(p)
    );
    if (candidates.length === 0) {
      candidates = participants.filter(p =>
        p.id !== me.id && (Number(p.id) < half) !== isGroup1 && isFree(p)
      );
    }
    if (candidates.length === 0) {
      const nextSolo = participants.map(p =>
        p.id === me.id ? { ...p, room: roomNumber, partner: null } : p
      );
      await new Promise(r => setTimeout(r, 600));
      await writeParticipants(nextSolo);
      await pushRoomMember('fourballRooms', roomNumber, { ids: [me.id] });
      return { roomNumber, partnerNickname: null };
    }

    const partner = candidates[Math.floor(Math.random() * candidates.length)];

    const next = participants.map(p => {
      if (p.id === me.id)      return { ...p, room: roomNumber, partner: partner.id };
      if (p.id === partner.id) return { ...p, room: roomNumber, partner: me.id };
      return p;
    });

    await new Promise(r => setTimeout(r, 600));
    await writeParticipants(next);
    await pushRoomMember('fourballRooms', roomNumber, { ids: [me.id, partner.id] });

    return { roomNumber, partnerNickname: partner.nickname || '' };
  };

  // ───────────────── Provider ─────────────────
  return (
    <PlayerContext.Provider
      value={{
        // 상태
        eventId, setEventId,
        participant, setParticipant,
        authCode, setAuthCode,
        mode, setMode,
        rooms, setRooms,
        roomCount, setRoomCount,
        roomNames, setRoomNames,
        participants, setParticipants,
        allowTeamView, setAllowTeamView,

        // API
        joinRoom, joinFourBall,
        assignStrokeForOne,
        assignFourballForOneAndPartner,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export default PlayerProvider;
