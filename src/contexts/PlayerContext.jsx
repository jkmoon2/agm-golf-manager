// src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import { pickRoomForStroke } from '../player/logic/assignStroke';
import { pickRoomForFourball } from '../player/logic/assignFourball';

export const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const [eventId, setEventId]             = useState('');
  const [participant, setParticipant]     = useState(null);
  const [authCode, setAuthCode]           = useState('');
  const [mode, setMode]                   = useState('stroke');
  const [rooms, setRooms]                 = useState([]);
  const [participants, setParticipants]   = useState([]);
  const [allowTeamView, setAllowTeamView] = useState(false);

  const [roomCount, setRoomCount] = useState(0);
  const [roomNames, setRoomNames] = useState([]);

  const myId = participant?.id ?? null;

  const normalizeParticipant = (p) => ({
    id: String((p?.id ?? '')).trim(),
    nickname: p?.nickname ?? '',
    room: p?.room ?? null,
    partner: p?.partner ?? null,
    handicap: typeof p?.handicap === 'number' ? p.handicap : (Number(p?.handicap) || 0),
    gHandi: typeof p?.gHandi === 'number' ? p.gHandi : (Number(p?.gHandi) || 0),
    ...p,
  });

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
            const me = list.find(p => p.id === String(myId).trim());
            if (me) setParticipant(me);
          }
        }
      } catch (e) {
        console.error('Failed to load event:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [eventId, myId]);

  useEffect(() => {
    if (!myId) return;
    const me = participants.find(p => p.id === String(myId).trim());
    if (me) {
      setParticipant(prev => (prev && prev.id === me.id ? { ...prev, ...me } : me));
    }
  }, [participants, myId]);

  const writeParticipants = async (next) => {
    if (!eventId) throw new Error('No event selected');
    await updateDoc(doc(db, 'events', eventId), { participants: next });
    setParticipants(next);
  };

  const pushRoomMember = async (collectionName, roomNumber, payload) => {
    if (!eventId) return;
    const ref = doc(db, 'events', eventId, collectionName, String(roomNumber));
    await setDoc(ref, { members: arrayUnion(payload) }, { merge: true });
  };

  /** ────────────────────────────────────────────────────────────
   * 내 참가자 레코드 해석(타이밍/자료형/동기화 이슈에 안전)
   * 1) id 문자열 정규화
   * 2) 현재 participants에서 검색
   * 3) 실패 시 Firestore 스냅샷을 한 번 더 읽어 재시도(+participants 갱신)
   * 4) 최후로 컨텍스트의 participant를 정규화하여 사용
   * 반환: { me, list }  (list는 최종 participants 배열)
   * ──────────────────────────────────────────────────────────── */
  const resolveMy = async (idMaybe) => {
    const idStr = String(idMaybe ?? myId ?? '').trim();
    // 1차: 현재 메모리
    let list = participants;
    let me = list.find(p => String(p.id).trim() === idStr);

    if (!me) {
      try {
        // 2차: 최신 스냅샷 1회
        if (eventId) {
          const ref  = doc(db, 'events', eventId);
          const snap = await getDoc(ref);
          const data = snap.exists() ? (snap.data() || {}) : {};
          const fresh = Array.isArray(data.participants)
            ? data.participants.map(normalizeParticipant)
            : [];
          list = fresh;
          setParticipants(fresh);
          me = fresh.find(p => String(p.id).trim() === idStr);
        }
      } catch (e) {
        console.warn('[resolveMy] snapshot retry failed:', e);
      }
    }

    if (!me && participant?.id && String(participant.id).trim() === idStr) {
      // 3차: 컨텍스트의 participant를 정규화해 사용
      me = normalizeParticipant(participant);
    }

    return { me, list, idStr };
  };

  // ───────── 자동 배정: 스트로크(한 명) ─────────
  const assignStrokeForOne = async (id) => {
    const { me, list } = await resolveMy(id);
    if (!me) {
      console.warn('[assignStrokeForOne] Participant not found after retries', {
        idTried: id, myId, total: list?.length,
        sample: (list || []).slice(0, 5).map(p => p?.id)
      });
      throw new Error('Participant not found');
    }

    const roomNumber = pickRoomForStroke({ participants: list, roomCount, target: me });

    const next = list.map(p =>
      p.id === me.id ? { ...p, room: roomNumber } : p
    );

    await new Promise(r => setTimeout(r, 600));
    await writeParticipants(next);
    await pushRoomMember('rooms', roomNumber, { id: me.id });

    return { roomNumber };
  };

  // ───────── 자동 배정: 포볼(본인 + 파트너) ─────────
  const assignFourballForOneAndPartner = async (id) => {
    const { me, list } = await resolveMy(id);
    if (!me) {
      console.warn('[assignFourballForOneAndPartner] Participant not found after retries');
      throw new Error('Participant not found');
    }

    const roomNumber = pickRoomForFourball({ participants: list, roomCount, target: me });

    const half = Math.floor(list.length / 2);
    const isGroup1 = Number(me.id) < half;
    const isFree   = (p) => p.partner == null;

    let candidates = list.filter(p =>
      p.id !== me.id && (Number(p.id) < half) !== isGroup1 && p.room === roomNumber && isFree(p)
    );
    if (candidates.length === 0) {
      candidates = list.filter(p =>
        p.id !== me.id && (Number(p.id) < half) !== isGroup1 && isFree(p)
      );
    }
    if (candidates.length === 0) {
      const nextSolo = list.map(p =>
        p.id === me.id ? { ...p, room: roomNumber, partner: null } : p
      );
      await new Promise(r => setTimeout(r, 600));
      await writeParticipants(nextSolo);
      await pushRoomMember('fourballRooms', roomNumber, { ids: [me.id] });
      return { roomNumber, partnerNickname: null };
    }

    const partner = candidates[Math.floor(Math.random() * candidates.length)];

    const next = list.map(p => {
      if (p.id === me.id)      return { ...p, room: roomNumber, partner: partner.id };
      if (p.id === partner.id) return { ...p, room: roomNumber, partner: me.id };
      return p;
    });

    await new Promise(r => setTimeout(r, 600));
    await writeParticipants(next);
    await pushRoomMember('fourballRooms', roomNumber, { ids: [me.id, partner.id] });

    return { roomNumber, partnerNickname: partner.nickname || '' };
  };

  return (
    <PlayerContext.Provider
      value={{
        eventId, setEventId,
        participant, setParticipant,
        authCode, setAuthCode,
        mode, setMode,
        rooms, setRooms,
        roomCount, setRoomCount,
        roomNames, setRoomNames,
        participants, setParticipants,
        allowTeamView, setAllowTeamView,

        joinRoom: async (roomNumber, id) => {
          const idStr = String(id ?? myId).trim();
          const next = participants.map(p =>
            p.id === idStr ? { ...p, room: Number(roomNumber) } : p
          );
          await writeParticipants(next);
          await pushRoomMember('rooms', Number(roomNumber), { id: idStr });
        },

        joinFourBall: async (roomNumber, p1, p2) => {
          const a = String(p1).trim(), b = String(p2).trim();
          const next = participants.map(p => {
            if (p.id === a) return { ...p, room: Number(roomNumber), partner: b };
            if (p.id === b) return { ...p, room: Number(roomNumber), partner: a };
            return p;
          });
          await writeParticipants(next);
          await pushRoomMember('fourballRooms', Number(roomNumber), { ids: [a, b] });
        },

        assignStrokeForOne,
        assignFourballForOneAndPartner,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export default PlayerProvider;
