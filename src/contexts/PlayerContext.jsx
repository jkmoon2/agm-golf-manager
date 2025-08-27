// src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import {
  doc,
  setDoc,
  arrayUnion,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';

// Admin/logic 유틸 — 스트로크, 포볼
import { pickRoomForStroke } from '../player/logic/assignStroke';
// ⬇️ 기존 'pickRoomForFourball' 대신 실제 export 이름으로 교체
import {
  pickRoomAndPartnerForFourball,
  transactionalAssignFourball,
} from '../player/logic/assignFourball';

export const PlayerContext = createContext(null);

/* =======================
   배정 전략(필요시 여길 조정)
   'uniform'  : 전체 방 중 무작위 (요구사항 기본)
   'balanced' : 최소 인원 방들 중 무작위
======================= */
const ASSIGN_STRATEGY_STROKE   = 'uniform';
const ASSIGN_STRATEGY_FOURBALL = 'uniform';

/* =======================
   트랜잭션 토글
   - 기본값: true
   - 끄기: REACT_APP_FOURBALL_USE_TRANSACTION=false
          또는 localStorage.FOURBALL_USE_TRANSACTION='false'
======================= */
const FOURBALL_USE_TRANSACTION = (() => {
  try {
    const env = (process.env.REACT_APP_FOURBALL_USE_TRANSACTION ?? '').toString().toLowerCase();
    const ls  = (localStorage.getItem('FOURBALL_USE_TRANSACTION') ?? '').toString().toLowerCase();
    const v   = (ls || env || 'true');
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  } catch {
    return true;
  }
})();

// ── helpers ───────────────────────────────────────────────────────────
const normId   = (v) => String(v ?? '').trim();
const normName = (s) => (s ?? '').toString().normalize('NFC').trim();
const toInt    = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const makeLabel = (roomNames, num) => {
  const n = Array.isArray(roomNames) && roomNames[num - 1]?.trim()
    ? roomNames[num - 1].trim()
    : '';
  return n || `${num}번방`;
};

const cryptoRand = () =>
  (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
    : Math.random();

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(cryptoRand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const pickUniform = (roomCount) =>
  1 + Math.floor(cryptoRand() * roomCount);

// 최소 인원 방 목록 계산
const minRooms = (participants, roomCount) => {
  const counts = Array.from({ length: roomCount }, (_, i) =>
    participants.filter((p) => toInt(p.room) === i + 1).length
  );
  const min = Math.min(...counts);
  return counts
    .map((c, i) => ({ n: i + 1, c }))
    .filter((x) => x.c === min)
    .map((x) => x.n);
};

export function PlayerProvider({ children }) {
  // ── 상태 ─────────────────────────────────────────────────────────────
  const [eventId, setEventId]             = useState('');
  const [mode, setMode]                   = useState('stroke'); // 'stroke' | 'fourball' | 'agm'->fourball
  const [roomCount, setRoomCount]         = useState(4);
  const [roomNames, setRoomNames]         = useState([]);
  const [rooms, setRooms]                 = useState([]);
  const [participants, setParticipants]   = useState([]);
  const [participant, setParticipant]     = useState(null);
  const [allowTeamView, setAllowTeamView] = useState(false);

  // 인증코드(로그인 화면에서 세팅)
  const [authCode, setAuthCode] = useState(() => localStorage.getItem('authCode') || '');

  // 인증코드가 바뀌면 예전 캐시/상태 제거(다른 닉네임 잔상 방지)
  useEffect(() => {
    if (authCode && authCode.trim()) {
      localStorage.removeItem('myId');
      localStorage.removeItem('nickname');
      setParticipant(null);
    }
  }, [authCode]);

  // 실시간 구독(단일 소스: events/{id}.participants[])
  useEffect(() => {
    if (!eventId) return;
    const ref = doc(db, 'events', eventId);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? (snap.data() || {}) : {};

      const partArr = (data.participants || []).map((p, i) => ({
        ...p,
        id:       normId(p?.id ?? i),
        nickname: normName(p?.nickname),
        handicap: toInt(p?.handicap, 0),
        group:    toInt(p?.group, 0),
        authCode: (p?.authCode ?? '').toString(),
        room:     p?.room ?? null,
        partner:  p?.partner != null ? normId(p.partner) : null,
        score:    toInt(p?.score, 0),
        selected: !!p?.selected,
      }));
      setParticipants(partArr);

      const md = (data.mode === 'fourball' || data.mode === 'agm') ? 'fourball' : 'stroke';
      setMode(md);

      const rn = Array.isArray(data.roomNames) ? data.roomNames : [];
      const rc = Number.isInteger(data.roomCount) ? data.roomCount : (rn.length || 4);
      setRoomCount(rc);
      setRoomNames(Array.from({ length: rc }, (_, i) => rn[i]?.trim() || ''));
      setRooms(Array.from({ length: rc }, (_, i) => ({ number: i + 1, label: makeLabel(rn, i + 1) })));

      // 인증코드 우선 매칭
      let me = null;
      if (authCode && authCode.trim()) {
        me = partArr.find((p) => String(p.authCode) === String(authCode)) || null;
      } else {
        const idCached  = normId(localStorage.getItem('myId') || '');
        const nickCache = normName(localStorage.getItem('nickname') || '');
        if (idCached)  me = partArr.find((p) => normId(p.id) === idCached) || null;
        if (!me && nickCache) me = partArr.find((p) => normName(p.nickname) === nickCache) || null;
      }

      if (me) {
        setParticipant(me);
        localStorage.setItem('myId', normId(me.id));
        localStorage.setItem('nickname', normName(me.nickname));
        if (me.authCode) {
          setAuthCode(me.authCode);
          localStorage.setItem('authCode', me.authCode);
        }
      } else {
        setParticipant(null);
      }
    });

    return () => unsub();
  }, [eventId, authCode]);

  // ── Firestore write helper ───────────────────────────────────────────
  async function writeParticipants(next) {
    if (!eventId) return;
    const ref = doc(db, 'events', eventId);
    await setDoc(ref, { participants: next }, { merge: true });
  }

  // ── API(유지) ────────────────────────────────────────────────────────
  async function joinRoom(roomNumber, id) {
    const rid = toInt(roomNumber, 0);
    const targetId = normId(id);
    const next = participants.map((p) =>
      normId(p.id) === targetId ? { ...p, room: rid } : p
    );
    setParticipants(next);
    if (participant && normId(participant.id) === targetId) {
      setParticipant((prev) => prev && { ...prev, room: rid });
    }
    await writeParticipants(next);

    try {
      const rref = doc(db, 'events', eventId, 'rooms', String(rid));
      await setDoc(rref, { members: arrayUnion(targetId) }, { merge: true });
    } catch (_) {}
  }

  async function joinFourBall(roomNumber, p1, p2) {
    const rid = toInt(roomNumber, 0);
    const a = normId(p1), b = normId(p2);
    const next = participants.map((p) => {
      if (normId(p.id) === a) return { ...p, room: rid, partner: b };
      if (normId(p.id) === b) return { ...p, room: rid, partner: a };
      return p;
    });
    setParticipants(next);
    if (participant && normId(participant.id) === a) setParticipant((prev) => prev && { ...prev, room: rid, partner: b });
    if (participant && normId(participant.id) === b) setParticipant((prev) => prev && { ...prev, room: rid, partner: a });
    await writeParticipants(next);

    try {
      const fbref = doc(db, 'events', eventId, 'fourballRooms', String(rid));
      await setDoc(fbref, { pairs: arrayUnion({ p1: a, p2: b }) }, { merge: true });
    } catch (_) {}
  }

  // ── 스트로크 자동 배정 ──────────────────────────────────────────────
  async function assignStrokeForOne(participantId) {
    const pid = normId(participantId || participant?.id);
    const me = participants.find((p) => normId(p.id) === pid) ||
               (participant ? participants.find((p) => normName(p.nickname) === normName(participant.nickname)) : null);
    if (!me) throw new Error('Participant not found');

    let chosenRoom = 0;

    // 1) Admin 유틸 우선
    try {
      const r = pickRoomForStroke ? pickRoomForStroke(participants, roomCount, me) : null;
      chosenRoom = toInt(typeof r === 'number' ? r : (r?.roomNumber ?? r?.room), 0);
    } catch (_) { /* fallback */ }

    // 2) fallback
    if (!chosenRoom) {
      if (ASSIGN_STRATEGY_STROKE === 'uniform') {
        chosenRoom = pickUniform(roomCount);                // ✅ 전체 방에서 랜덤
      } else {
        const candidates = minRooms(participants, roomCount);
        chosenRoom = shuffle(candidates)[0] || pickUniform(roomCount);
      }
    }

    const next = participants.map((p) =>
      normId(p.id) === pid ? { ...p, room: chosenRoom } : p
    );
    setParticipants(next);
    if (participant && normId(participant.id) === pid) {
      setParticipant((prev) => prev && { ...prev, room: chosenRoom });
    }
    await writeParticipants(next);

    try {
      const rref = doc(db, 'events', eventId, 'rooms', String(chosenRoom));
      await setDoc(rref, { members: arrayUnion(pid) }, { merge: true });
    } catch (_) {}

    return { roomNumber: chosenRoom, roomLabel: makeLabel(roomNames, chosenRoom) };
  }

  // ── 포볼 자동 배정(옵션: 트랜잭션) ───────────────────────────────────
  async function assignFourballForOneAndPartner(participantId) {
    const pid = normId(participantId || participant?.id);
    const me = participants.find((p) => normId(p.id) === pid) ||
               (participant ? participants.find((p) => normName(p.nickname) === normName(participant.nickname)) : null);
    if (!me) throw new Error('Participant not found');

    // 2조는 여기서도 가드
    if (toInt(me.group) !== 1) {
      const partnerNickname =
        (me.partner ? participants.find((p) => normId(p.id) === normId(me.partner)) : null)?.nickname || '';
      return { roomNumber: me.room ?? null, partnerNickname };
    }

    // ── A) 트랜잭션 버전 (토글) ───────────────────────────────────────
    if (FOURBALL_USE_TRANSACTION) {
      // 우선 모듈이 제공하는 transactionalAssignFourball을 사용
      try {
        if (typeof transactionalAssignFourball === 'function') {
          const result = await transactionalAssignFourball({
            db,
            eventId,
            participants,
            roomCount,
            selfId: pid,
          });
          // result: { roomNumber, partnerId, nextParticipants }
          if (result?.nextParticipants) {
            setParticipants(result.nextParticipants);
            if (participant && normId(participant.id) === pid) {
              setParticipant((prev) =>
                prev && { ...prev, room: result.roomNumber, partner: result.partnerId || null }
              );
            }
          }
          const partnerNickname =
            (participants.find((p) => normId(p.id) === result?.partnerId) || {})?.nickname || '';
          return {
            roomNumber: result?.roomNumber ?? null,
            partnerId: result?.partnerId || null,
            partnerNickname,
          };
        }
      } catch (e) {
        console.warn('[fourball tx util] fallback to manual tx:', e?.message);
      }

      // 모듈 유틸이 없거나 실패 시, 수동 트랜잭션 fallback
      try {
        const result = await runTransaction(db, async (tx) => {
          const eref = doc(db, 'events', eventId);
          const snap = await tx.get(eref);
          const data = snap.exists() ? (snap.data() || {}) : {};
          const parts = (data.participants || []).map((p, i) => ({
            ...p,
            id: normId(p?.id ?? i),
            nickname: normName(p?.nickname),
            group: toInt(p?.group, 0),
            room: p?.room ?? null,
            partner: p?.partner != null ? normId(p.partner) : null,
          }));

          const self = parts.find((p) => normId(p.id) === pid);
          if (!self) throw new Error('Participant not found');

          // 방/파트너 선택
          let roomNumber = 0;
          let mateId = '';

          if (ASSIGN_STRATEGY_FOURBALL === 'uniform') {
            roomNumber = pickUniform(roomCount);
          } else {
            const candidates = minRooms(parts, roomCount);
            roomNumber = shuffle(candidates)[0] || pickUniform(roomCount);
          }
          const pool = parts.filter(
            (p) => toInt(p.group) === 2 && !p.partner && normId(p.id) !== pid
          );
          mateId = pool.length ? normId(shuffle(pool)[0].id) : '';

          const next = parts.map((p) => {
            if (normId(p.id) === pid) return { ...p, room: roomNumber, partner: mateId || null };
            if (mateId && normId(p.id) === mateId) return { ...p, room: roomNumber, partner: pid };
            return p;
          });

          tx.set(eref, { participants: next }, { merge: true });

          const fbref = doc(db, 'events', eventId, 'fourballRooms', String(roomNumber));
          if (mateId) tx.set(fbref, { pairs: arrayUnion({ p1: pid, p2: mateId }) }, { merge: true });
          else        tx.set(fbref, { singles: arrayUnion(pid) }, { merge: true });

          return { roomNumber, mateId, next };
        });

        if (result?.next) {
          setParticipants(result.next);
          if (participant && normId(participant.id) === pid) {
            setParticipant((prev) =>
              prev && { ...prev, room: result.roomNumber, partner: result.mateId || null }
            );
          }
        }
        const partnerNickname =
          (participants.find((p) => normId(p.id) === result?.mateId) || {})?.nickname || '';
        return { roomNumber: result?.roomNumber ?? null, partnerId: result?.mateId || null, partnerNickname };
      } catch (err) {
        console.warn('[fourball tx manual] fallback to non-tx:', err?.message);
      }
    }

    // ── B) 기존(비트랜잭션) 로직(원본 유지) ────────────────────────────
    let roomNumber = 0;
    let mateId = '';

    // 1) Admin 유틸 우선 — ⬇️ 이름 교체
    try {
      const r = pickRoomAndPartnerForFourball
        ? pickRoomAndPartnerForFourball(participants, roomCount, me)
        : null;
      roomNumber = toInt(r?.roomNumber ?? r?.room, 0);
      const partnerRaw = r?.partner ?? r?.mate ?? r?.partnerId ?? r?.partnerID;
      if (partnerRaw && typeof partnerRaw === 'object') {
        mateId = normId(partnerRaw.id);
      } else if (partnerRaw) {
        const cand = participants.find((p) => normId(p.id) === normId(partnerRaw)) ||
                     participants.find((p) => normName(p.nickname) === normName(partnerRaw));
        mateId = cand ? normId(cand.id) : '';
      }
    } catch (_) { /* fallback */ }

    // 2) fallback — 방은 전략에 따라, 파트너는 2조 미배정자 중 랜덤
    if (!roomNumber) {
      if (ASSIGN_STRATEGY_FOURBALL === 'uniform') {
        roomNumber = pickUniform(roomCount);               // ✅ 전체 방에서 랜덤
      } else {
        const candidates = minRooms(participants, roomCount);
        roomNumber = shuffle(candidates)[0] || pickUniform(roomCount);
      }
    }

    if (!mateId) {
      const pool = participants.filter(
        (p) => toInt(p.group) === 2 && !p.partner && normId(p.id) !== pid
      );
      if (pool.length) {
        mateId = normId(shuffle(pool)[0].id);
      } else {
        mateId = ''; // 남은 2조가 없으면 싱글
      }
    }

    const next = participants.map((p) => {
      if (normId(p.id) === pid)    return { ...p, room: roomNumber, partner: mateId || null };
      if (mateId && normId(p.id) === mateId) return { ...p, room: roomNumber, partner: pid };
      return p;
    });
    setParticipants(next);
    if (participant && normId(participant.id) === pid) {
      setParticipant((prev) => prev && { ...prev, room: roomNumber, partner: mateId || null });
    }
    await writeParticipants(next);

    try {
      const fbref = doc(db, 'events', eventId, 'fourballRooms', String(roomNumber));
      if (mateId) await setDoc(fbref, { pairs: arrayUnion({ p1: pid, p2: mateId }) }, { merge: true });
      else await setDoc(fbref, { singles: arrayUnion(pid) }, { merge: true });
    } catch (_) {}

    const partnerNickname = (participants.find((p) => normId(p.id) === mateId) || {})?.nickname || '';
    return { roomNumber, partnerId: mateId || null, partnerNickname };
  }

  // ── 컨텍스트 값 ─────────────────────────────────────────────────────
  return (
    <PlayerContext.Provider
      value={{
        // 상태
        eventId, setEventId,
        mode, roomCount, roomNames, rooms,
        participants, participant,
        setParticipant,
        authCode, setAuthCode,
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
