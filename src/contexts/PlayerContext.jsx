// src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';

// 참가자 전용 자동 배정 유틸 (기존 로직 그대로 사용)
import { pickRoomForStroke } from '../player/logic/assignStroke';
import { pickRoomForFourball } from '../player/logic/assignFourball';

export const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  // ───────────────────────── 상태 (기존 필드 유지) ─────────────────────────
  const [eventId, setEventId]             = useState('');
  const [participant, setParticipant]     = useState(null);   // {id, nickname, room, partner, gHandi, ...}
  const [authCode, setAuthCode]           = useState('');
  const [mode, setMode]                   = useState('stroke'); // 'stroke' | 'fourball' | 'agm'
  const [rooms, setRooms]                 = useState([]);       // 필요시 사용
  const [participants, setParticipants]   = useState([]);       // 전체 참가자 배열
  const [allowTeamView, setAllowTeamView] = useState(false);

  // Admin STEP2 연동 값
  const [roomCount, setRoomCount] = useState(0);
  const [roomNames, setRoomNames] = useState([]);

  // ❗ 권장 해결: 객체 participant를 의존성에 직접 넣지 않기 위해 ID만 별도 추적
  const myId = participant?.id ?? null;

  // ───────────────────────── Firestore 헬퍼 ─────────────────────────
  const eventRef = eventId ? doc(db, 'events', eventId) : null;

  const normalizeParticipant = (p) => ({
    id: String(p?.id ?? ''),
    nickname: p?.nickname ?? '',
    room: p?.room ?? null,
    partner: p?.partner ?? null, // fourball일 때 짝
    gHandi: typeof p?.gHandi === 'number' ? p.gHandi : (Number(p?.gHandi) || 0),
    ...p,
  });

  // ───────────────────────── 데이터 로딩 ─────────────────────────
  // 이벤트 문서 로드 (이펙트 1)
  useEffect(() => {
    if (!eventRef) return;

    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(eventRef);
        const data = snap.exists() ? (snap.data() || {}) : {};

        // 모드: 'agm'은 fourball로 처리
        const m = (data.mode === 'agm') ? 'fourball' : (data.mode || 'stroke');
        if (!cancelled) setMode(m);

        // Admin STEP 값
        if (!cancelled) {
          setRoomCount(Number(data.roomCount || 0));
          setRoomNames(Array.isArray(data.roomNames) ? data.roomNames : []);
        }

        // 참가자 배열 정규화
        const list = Array.isArray(data.participants)
          ? data.participants.map(normalizeParticipant)
          : [];

        if (!cancelled) {
          setParticipants(list);

          // 이미 인증되어 있는 경우 내 정보 동기화
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
    // ✅ 권장 해결안: participant(객체) 대신 myId만 의존성에 둡니다.
  }, [eventId, myId]); // ← Netlify CI에서의 react-hooks/exhaustive-deps 경고 해결

  // participants 변경 시 내 정보 동기화 (이펙트 2)
  useEffect(() => {
    if (!myId) return;
    const me = participants.find(p => p.id === myId);
    if (me) {
      setParticipant(prev => (prev && prev.id === myId ? { ...prev, ...me } : me));
    }
  }, [participants, myId]); // ✅ participant 대신 myId

  // (선택) authCode를 사용한 무언가가 있다면 여기에… (이펙트 3 자리 유지)
  // useEffect(() => { ... }, [authCode]);

  // ───────────────────────── Firestore 업데이트 공통 ─────────────────────────
  const writeParticipants = async (next) => {
    if (!eventRef) throw new Error('No event selected');
    await updateDoc(eventRef, { participants: next });
    setParticipants(next);
  };

  // rooms 서브컬렉션 안전 쓰기 예시
  const pushRoomMember = async (collectionName, roomNumber, payload) => {
    if (!eventId) return;
    const ref = doc(db, 'events', eventId, collectionName, String(roomNumber));
    // 문서 유무 상관 없이 merge true로 안전 쓰기 + arrayUnion
    await setDoc(ref, { members: arrayUnion(payload) }, { merge: true });
  };

  // ───────────────────────── 노출 API ─────────────────────────
  // 방 직접 입장(스트로크)
  const joinRoom = async (roomNumber, id) => {
    const pid = String(id ?? myId);
    if (!pid) throw new Error('Missing participant id');

    const next = participants.map(p =>
      p.id === pid ? { ...p, room: Number(roomNumber) } : p
    );
    await writeParticipants(next);

    // 서브컬렉션(예: strokeRooms)에도 기록
    await pushRoomMember('rooms', Number(roomNumber), { id: pid });
  };

  // 포볼 직접 조인 (방 + 파트너가 정해져 있을 때)
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

  // ───────── 자동 배정: 스트로크(한 명) ─────────
  const assignStrokeForOne = async (id) => {
    const my = participants.find(p => p.id === String(id ?? myId));
    if (!my) throw new Error('Participant not found');

    const roomNumber = pickRoomForStroke({ participants, roomCount, target: my });

    const next = participants.map(p =>
      p.id === my.id ? { ...p, room: roomNumber } : p
    );

    // UX: 관리자 느낌 유지용 미세 지연(스피너 연동 시)
    await new Promise(r => setTimeout(r, 600));
    await writeParticipants(next);
    await pushRoomMember('rooms', roomNumber, { id: my.id });

    return { roomNumber };
  };

  // ───────── 자동 배정: 포볼(본인 + 파트너) ─────────
  const assignFourballForOneAndPartner = async (id) => {
    const participantId = String(id ?? myId);
    const me = participants.find(p => p.id === participantId);
    if (!me) throw new Error('Participant not found');

    // 1) 방 먼저
    const roomNumber = pickRoomForFourball({ participants, roomCount, target: me });

    // 2) 파트너 후보군 추리기 (1조/2조 반대편 + 아직 partner 없는 사람)
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
      // 파트너가 더이상 없으면 본인만 방 배정
      const nextSolo = participants.map(p =>
        p.id === me.id ? { ...p, room: roomNumber, partner: null } : p
      );
      await new Promise(r => setTimeout(r, 600));
      await writeParticipants(nextSolo);
      await pushRoomMember('fourballRooms', roomNumber, { ids: [me.id] });
      return { roomNumber, partnerNickname: null };
    }

    // 무작위 파트너 선택
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

  // ───────────────────────── 컨텍스트 값 제공 ─────────────────────────
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

// 기존 코드들이 named import를 쓰므로 named export 유지.
// (원하면 아래 줄은 생략해도 됨)
export default PlayerProvider;
