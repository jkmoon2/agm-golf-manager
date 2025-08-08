// src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase';

// (NEW) 참가자 로직 유틸
import { pickRoomForStroke } from '../player/logic/assignStroke';
import { pickRoomForFourball } from '../player/logic/assignFourball';

export const PlayerContext = createContext();

export function PlayerProvider({ children }) {
  const [eventId, setEventId]             = useState('');
  const [participant, setParticipant]     = useState(null);
  const [authCode, setAuthCode]           = useState('');
  const [mode, setMode]                   = useState('stroke');
  const [rooms, setRooms]                 = useState([]); // 유지
  const [participants, setParticipants]   = useState([]);
  const [allowTeamView, setAllowTeamView] = useState(false);

  // (NEW) Admin STEP2 연동용 메타
  const [roomCount, setRoomCount] = useState(4);
  const [roomNames, setRoomNames] = useState([]);

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
          setRoomCount(4);
          setRoomNames([]);
          setMode('stroke');
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

        // 모드 정규화: "agm"도 fourball로 처리
        const m = String(data.mode || 'stroke').toLowerCase();
        setMode(m === 'fourball' || m === 'agm' ? 'fourball' : 'stroke');

        // (NEW) Admin STEP2: 방 수/방 이름 로드
        const rn = Array.isArray(data.roomNames) ? data.roomNames : [];
        const rc = Number.isInteger(data.roomCount)
          ? data.roomCount
          : (rn.length > 0 ? rn.length : 4);
        setRoomCount(rc);
        // 길이 보정
        const fixedNames = Array.from({ length: rc }, (_, i) => rn[i]?.trim() || '');
        setRoomNames(fixedNames);

        // (유지) rooms — 기존 코드 호환: 1..roomCount로 구성
        setRooms(Array.from({ length: rc }, (_, i) => ({ number: i + 1 })));
      } catch (err) {
        console.error('[PlayerContext] 로드 오류', err);
        setParticipants([]);
        setRooms([]);
        setRoomCount(4);
        setRoomNames([]);
        setMode('stroke');
      }
    })();
    // ⚠️ 의존성은 eventId만 — participant를 넣으면 재귀 갱신 루프 가능성
  }, [eventId]);

  // (NEW) participants가 바뀔 때 로그인된 participant 최신화
  // → ESLint의 "missing dependency" 경고 없이 안전
  useEffect(() => {
    if (!participant) return;
    const me = participants.find(p => p.id === participant.id);
    if (me) setParticipant(me);
  }, [participants, participant?.id]); // id만 의존하도록 안정화

  // ── 헬퍼: 안전한 setDoc(merge)로 배열 union 쓰기 ─────────────────
  const mergeArrayUnion = async (ref, payload) => {
    await setDoc(ref, payload, { merge: true });
  };

  // ── 스트로크: 한 명 자동 배정(관리자 STEP5 룰 호환) ───────────────
  const assignStrokeForOne = async (participantId) => {
    if (!eventId) throw new Error('Missing eventId');

    const me = participants.find(p => p.id === participantId);
    if (!me) throw new Error('Participant not found');

    const chosenRoom = pickRoomForStroke({
      participants,
      roomCount,
      target: me,
    });

    // participants 업데이트(로컬)
    const updatedArr = participants.map(p =>
      p.id === participantId ? { ...p, room: chosenRoom } : p
    ).map(p => ({
      id: p.id, nickname: p.nickname, handicap: p.handicap, group: p.group,
      authCode: p.authCode, room: p.room, partner: p.partner,
      score: p.score, selected: p.selected,
    }));

    // Firestore 업데이트
    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, { participants: updatedArr });

    // rooms 서브컬렉션: 문서 없어도 병합되게 setDoc 사용
    const roomRef = doc(db, 'events', eventId, 'rooms', String(chosenRoom));
    await mergeArrayUnion(roomRef, { players: arrayUnion(participantId) });

    // 로컬 컨텍스트 반영
    setParticipants(updatedArr);
    if (participant?.id === participantId) {
      setParticipant(prev => prev && ({ ...prev, room: chosenRoom }));
    }

    return { roomNumber: chosenRoom };
  };

  // ── 포볼: 한 명 "방만" 자동 배정(관리자 STEP7 룰 중 방 선택) ─────
  // 팀원 선택은 나중에 joinFourBall 호출 시 partner 저장
  const assignFourballRoomForOne = async (participantId) => {
    if (!eventId) throw new Error('Missing eventId');

    const me = participants.find(p => p.id === participantId);
    if (!me) throw new Error('Participant not found');

    const chosenRoom = pickRoomForFourball({
      participants,
      roomCount,
      target: me,
    });

    // 방만 먼저 기록
    const updatedArr = participants.map(p =>
      p.id === participantId ? { ...p, room: chosenRoom } : p
    ).map(p => ({
      id: p.id, nickname: p.nickname, handicap: p.handicap, group: p.group,
      authCode: p.authCode, room: p.room, partner: p.partner,
      score: p.score, selected: p.selected,
    }));

    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, { participants: updatedArr });

    // fourballRooms에도 자리 확보(선택 사항이지만 Admin 연동상 안전)
    const fbRoomRef = doc(db, 'events', eventId, 'fourballRooms', String(chosenRoom));
    await mergeArrayUnion(fbRoomRef, {
      // teams는 partner 확정 시 arrayUnion으로 추가하므로 여기선 placeholder
      placeholders: arrayUnion(participantId),
    });

    setParticipants(updatedArr);
    if (participant?.id === participantId) {
      setParticipant(prev => prev && ({ ...prev, room: chosenRoom }));
    }

    return { roomNumber: chosenRoom };
  };

  // ── 기존 joinRoom (수정: setDoc 사용), 유지 ───────────────────────
  const joinRoom = async (roomNumber, participantId) => {
    if (!eventId) throw new Error('Missing eventId');

    const updatedArr = participants.map(p =>
      p.id === participantId ? { ...p, room: roomNumber } : p
    ).map(p => ({
      id: p.id, nickname: p.nickname, handicap: p.handicap, group: p.group,
      authCode: p.authCode, room: p.room, partner: p.partner,
      score: p.score, selected: p.selected,
    }));

    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, { participants: updatedArr });

    const roomRef = doc(db, 'events', eventId, 'rooms', String(roomNumber));
    await mergeArrayUnion(roomRef, { players: arrayUnion(participantId) });

    setParticipants(updatedArr);
    if (participant?.id === participantId) {
      setParticipant(prev => prev && ({ ...prev, room: roomNumber }));
    }
  };

  // ── 기존 joinFourBall (수정: setDoc 사용), 유지 ────────────────────
  const joinFourBall = async (roomNumber, p1, p2) => {
    if (!eventId) throw new Error('Missing eventId');

    const updatedArr = participants.map(p => {
      if (p.id === p1) return { ...p, room: roomNumber, partner: p2 };
      if (p.id === p2) return { ...p, room: roomNumber, partner: p1 };
      return p;
    }).map(p => ({
      id: p.id, nickname: p.nickname, handicap: p.handicap, group: p.group,
      authCode: p.authCode, room: p.room, partner: p.partner,
      score: p.score, selected: p.selected,
    }));

    const eventRef = doc(db, 'events', eventId);
    await updateDoc(eventRef, { participants: updatedArr });

    const fbRoomRef = doc(db, 'events', eventId, 'fourballRooms', String(roomNumber));
    await mergeArrayUnion(fbRoomRef, {
      teams: arrayUnion({ player1: p1, player2: p2 }),
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
      rooms,
      roomCount,
      roomNames,
      participants,
      // 기존
      joinRoom,
      joinFourBall,
      // NEW
      assignStrokeForOne,
      assignFourballRoomForOne,
      allowTeamView, setAllowTeamView,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}
