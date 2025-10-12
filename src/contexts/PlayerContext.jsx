// /src/contexts/PlayerContext.jsx
//
// ✅ 변경 핵심 (원본 100% 유지 + 필요한 부분만 추가):
// 1) Firestore 저장 전 sanitizeForFirestore() 적용 → 400 에러 방지
// 2) onSnapshot 매핑 시 null 안전 스프레드
// 3) "같은 세션에서 인증된 이벤트" 만 자동 매칭 허용 → 교차 이벤트 오검출 방지
// 4) rooms / fourballRooms 문서 병합 저장(merge) 유지 → 새 규칙과 호환

import React, { createContext, useState, useEffect } from 'react';
import {
  doc,
  setDoc,
  arrayUnion,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useLocation } from 'react-router-dom';

import { pickRoomForStroke } from '../player/logic/assignStroke';
import {
  pickRoomAndPartnerForFourball,
  transactionalAssignFourball,
} from '../player/logic/assignFourball';

export const PlayerContext = createContext(null);

const ASSIGN_STRATEGY_STROKE   = 'uniform';
const ASSIGN_STRATEGY_FOURBALL = 'uniform';

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

// ── helpers (원본 유지) ────────────────────────────────────────────────
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

// ✅ Firestore 저장 전 sanitize (중첩 undefined/NaN 제거)
function sanitizeForFirestore(v) {
  if (Array.isArray(v)) {
    return v.map(sanitizeForFirestore).filter((x) => x !== undefined);
  }
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) {
      const val = v[k];
      if (val === undefined) continue;
      if (typeof val === 'number' && Number.isNaN(val)) { out[k] = null; continue; }
      out[k] = sanitizeForFirestore(val);
    }
    return out;
  }
  if (typeof v === 'number' && Number.isNaN(v)) return null;
  return v;
}

// ✅ 세션 단위 인증 플래그(이 이벤트에 대해 인증됨)
function markEventAuthed(id, code, meObj) {
  if (!id) return;
  try {
    sessionStorage.setItem(`auth_${id}`, 'true');
    if (code != null) sessionStorage.setItem(`authcode_${id}`, String(code));
    if (meObj) {
      sessionStorage.setItem(`participant_${id}`, JSON.stringify(meObj));
      sessionStorage.setItem(`myId_${id}`, normId(meObj.id || ''));
      sessionStorage.setItem(`nickname_${id}`, normName(meObj.nickname || ''));
    }
  } catch {}
}

export function PlayerProvider({ children }) {
  // ── 상태 (원본 유지) ────────────────────────────────────────────────
  const [eventId, setEventId]             = useState(() => {
    try { return localStorage.getItem('eventId') || ''; } catch { return ''; }
  });
  const [mode, setMode]                   = useState('stroke');
  const [roomCount, setRoomCount]         = useState(4);
  const [roomNames, setRoomNames]         = useState([]);
  const [rooms, setRooms]                 = useState([]);
  const [participants, setParticipants]   = useState([]);
  const [participant, setParticipant]     = useState(null);
  const [allowTeamView, setAllowTeamView] = useState(false);

  // 인증코드 — 세션 기반 복원
  const [authCode, setAuthCode] = useState('');

  const { pathname } = useLocation();

  // URL에서 /player/home/:eventId 감지(원본 유지)
  useEffect(() => {
    if (!eventId && typeof pathname === 'string') {
      const m = pathname.match(/\/player\/home\/([^/]+)/);
      if (m && m[1]) {
        setEventId(m[1]);
        try { localStorage.setItem('eventId', m[1]); } catch {}
      }
    }
  }, [pathname, eventId]);

  // ✅ eventId 변경 시 같은 세션의 authcode 복원
  useEffect(() => {
    if (!eventId) return;
    try {
      const code = sessionStorage.getItem(`authcode_${eventId}`) || '';
      setAuthCode(code);
    } catch {}
  }, [eventId]);

  // eventId 동기화(원본 유지)
  useEffect(() => {
    try {
      if (eventId) localStorage.setItem('eventId', eventId);
    } catch {}
  }, [eventId]);

  // authCode 변경 시 캐시 정리(원본 유지) + 이벤트별 세션 캐시 정리
  useEffect(() => {
    if (authCode && authCode.trim()) {
      localStorage.removeItem('myId');
      localStorage.removeItem('nickname');
      try {
        if (eventId) {
          sessionStorage.removeItem(`myId_${eventId}`);
          sessionStorage.removeItem(`nickname_${eventId}`);
        }
      } catch {}
      setParticipant(null);
    }
  }, [authCode, eventId]);

  // ── 실시간 구독 (원본 유지 + 가드/추가) ─────────────────────────────
  useEffect(() => {
    if (!eventId) return;
    const ref = doc(db, 'events', eventId);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? (snap.data() || {}) : {};

      // ✅ null 안전 스프레드 + 안전 기본값
      const rawParts = Array.isArray(data.participants) ? data.participants : [];
      const partArr = rawParts.map((p, i) => ({
        ...((p && typeof p === 'object') ? p : {}),
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

      // ── me 매칭: ① authCode 최우선 ② 같은 세션에서 인증된 이벤트만 캐시 사용
      let me = null;

      if (authCode && authCode.trim()) {
        me = partArr.find((p) => String(p.authCode) === String(authCode)) || null;
      } else {
        const authedThisEvent = sessionStorage.getItem(`auth_${eventId}`) === 'true';
        if (authedThisEvent) {
          let idCached  = '';
          let nickCache = '';
          try {
            idCached  = normId(sessionStorage.getItem(`myId_${eventId}`) || '');
            nickCache = normName(sessionStorage.getItem(`nickname_${eventId}`) || '');
          } catch {}
          if (!idCached) {
            try { idCached = normId(localStorage.getItem(`myId_${eventId}`) || ''); } catch {}
          }
          if (!nickCache) {
            try { nickCache = normName(localStorage.getItem(`nickname_${eventId}`) || ''); } catch {}
          }

          if (idCached)  me = partArr.find((p) => normId(p.id) === idCached) || null;
          if (!me && nickCache) me = partArr.find((p) => normName(p.nickname) === nickCache) || null;
        }
      }

      if (me) {
        setParticipant(me);

        // (원본 유지) — 전역 키 기록
        localStorage.setItem('myId', normId(me.id));
        localStorage.setItem('nickname', normName(me.nickname));

        // ✅ 이벤트별 세션 키도 기록
        try {
          sessionStorage.setItem(`myId_${eventId}`, normId(me.id));
          sessionStorage.setItem(`nickname_${eventId}`, normName(me.nickname));
        } catch {}

        if (me.authCode) setAuthCode(me.authCode);

        // 세션 인증 플래그 기록
        markEventAuthed(eventId, me.authCode, me);
      } else {
        setParticipant(null);
      }
    });

    return () => unsub();
  }, [eventId, authCode]);

  // ── Firestore write helper (원본 유지 + sanitize) ───────────────────
  async function writeParticipants(next) {
    if (!eventId) return;
    const ref = doc(db, 'events', eventId);
    await setDoc(ref, sanitizeForFirestore({ participants: Array.isArray(next) ? next : [] }), { merge: true });
  }

  // ── API (원본 유지) ──────────────────────────────────────────────────
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

  async function assignStrokeForOne(participantId) {
    const pid = normId(participantId || participant?.id);
    const me = participants.find((p) => normId(p.id) === pid) ||
               (participant ? participants.find((p) => normName(p.nickname) === normName(participant.nickname)) : null);
    if (!me) throw new Error('Participant not found');

    let chosenRoom = 0;

    try {
      const r = pickRoomForStroke ? pickRoomForStroke(participants, roomCount, me) : null;
      chosenRoom = toInt(typeof r === 'number' ? r : (r?.roomNumber ?? r?.room), 0);
    } catch (_) {}

    if (!chosenRoom) {
      if (ASSIGN_STRATEGY_STROKE === 'uniform') {
        chosenRoom = pickUniform(roomCount);
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

  async function assignFourballForOneAndPartner(participantId) {
    const pid = normId(participantId || participant?.id);
    const me = participants.find((p) => normId(p.id) === pid) ||
               (participant ? participants.find((p) => normName(p.nickname) === normName(participant.nickname)) : null);
    if (!me) throw new Error('Participant not found');

    // 1조가 아니면 기존 배정 그대로 리턴(원본 유지)
    if (toInt(me.group) !== 1) {
      const partnerNickname =
        (me.partner ? participants.find((p) => normId(p.id) === normId(me.partner)) : null)?.nickname || '';
      return { roomNumber: me.room ?? null, partnerNickname };
    }

    if (FOURBALL_USE_TRANSACTION) {
      // (우선) 외부 유틸 트랜잭션 시도
      try {
        if (typeof transactionalAssignFourball === 'function') {
          const result = await transactionalAssignFourball({
            db,
            eventId,
            participants,
            roomCount,
            selfId: pid,
          });
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

      // (대안) 직접 트랜잭션
      try {
        const result = await runTransaction(db, async (tx) => {
          const eref = doc(db, 'events', eventId);
          const snap = await tx.get(eref);
          const data = snap.exists() ? (snap.data() || {}) : {};
          const parts = (data.participants || []).map((p, i) => ({
            ...((p && typeof p === 'object') ? p : {}),
            id: normId(p?.id ?? i),
            nickname: normName(p?.nickname),
            group: toInt(p?.group, 0),
            room: p?.room ?? null,
            partner: p?.partner != null ? normId(p?.partner) : null,
          }));

          const self = parts.find((p) => normId(p.id) === pid);
          if (!self) throw new Error('Participant not found');

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

          // ✅ 저장 전 sanitize
          tx.set(eref, sanitizeForFirestore({ participants: next }), { merge: true });

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

    // 비트랜잭션 버전 (원본 유지)
    let roomNumber = 0;
    let mateId = '';

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
    } catch (_) {}

    if (!roomNumber) {
      if (ASSIGN_STRATEGY_FOURBALL === 'uniform') {
        roomNumber = pickUniform(roomCount);
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
        mateId = ''; // 싱글
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

  return (
    <PlayerContext.Provider
      value={{
        eventId, setEventId,
        mode, roomCount, roomNames, rooms,
        participants, participant,
        setParticipant,
        authCode, setAuthCode,
        allowTeamView, setAllowTeamView,
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
