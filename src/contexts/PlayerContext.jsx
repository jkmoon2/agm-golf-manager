// /src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import {
  doc,
  setDoc,
  arrayUnion,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,        // ✅ 추가
  getDoc,           // ✅ 추가 (이벤트 문서 존재 확인용)
} from 'firebase/firestore';
import { db } from '../firebase';
import { useLocation } from 'react-router-dom';
import { getAuth, signInAnonymously } from 'firebase/auth';

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

// ─ helpers ─
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

const pickUniform = (roomCount) => 1 + Math.floor(cryptoRand() * roomCount);

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

// Firestore sanitize
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

// 세션 인증 플래그
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

// ✅ 모든 쓰기 전에 인증 보장
async function ensureAuthReady() {
  const auth = getAuth();
  if (!auth.currentUser) {
    const cred = await signInAnonymously(auth);
    await cred.user.getIdToken(true);
  } else {
    await auth.currentUser.getIdToken(true);
  }
}

export function PlayerProvider({ children }) {
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
  const [authCode, setAuthCode]           = useState('');

  const { pathname } = useLocation();

  useEffect(() => {
    if (!eventId && typeof pathname === 'string') {
      const m = pathname.match(/\/player\/home\/([^/]+)/);
      if (m && m[1]) {
        setEventId(m[1]);
        try { localStorage.setItem('eventId', m[1]); } catch {}
      }
    }
  }, [pathname, eventId]);

  useEffect(() => {
    if (!eventId) return;
    try {
      const code = sessionStorage.getItem(`authcode_${eventId}`) || '';
      setAuthCode(code);
    } catch {}
  }, [eventId]);

  useEffect(() => {
    try { if (eventId) localStorage.setItem('eventId', eventId); } catch {}
  }, [eventId]);

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

  useEffect(() => {
    if (!eventId) return;
    const ref = doc(db, 'events', eventId);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? (snap.data() || {}) : {};

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
          if (!idCached)  { try { idCached  = normId(localStorage.getItem(`myId_${eventId}`) || ''); } catch {} }
          if (!nickCache) { try { nickCache = normName(localStorage.getItem(`nickname_${eventId}`) || ''); } catch {} }
          if (idCached)         me = partArr.find((p) => normId(p.id) === idCached) || null;
          if (!me && nickCache) me = partArr.find((p) => normName(p.nickname) === nickCache) || null;
        }
      }

      if (me) {
        setParticipant(me);
        localStorage.setItem('myId', normId(me.id));
        localStorage.setItem('nickname', normName(me.nickname));
        try {
          sessionStorage.setItem(`myId_${eventId}`, normId(me.id));
          sessionStorage.setItem(`nickname_${eventId}`, normName(me.nickname));
        } catch {}
        if (me.authCode) setAuthCode(me.authCode);
        markEventAuthed(eventId, me.authCode, me);
      } else {
        setParticipant(null);
      }
    });
    return () => unsub();
  }, [eventId, authCode]);

  // participants 저장 (화이트리스트 + updateDoc)
  async function writeParticipants(next) {
    if (!eventId) return;
    await ensureAuthReady(); // ✅

    const eref = doc(db, 'events', eventId);

    // 이벤트 문서 존재 보장(없으면 create 금지 규칙 때문에 거부됨)
    const exists = (await getDoc(eref)).exists();
    if (!exists) {
      alert('이벤트 문서가 존재하지 않습니다. 관리자에게 문의해 주세요.');
      throw new Error('Event document does not exist');
    }

    const ALLOWED = ['id','group','nickname','handicap','score','room','partner','authCode','selected'];
    const cleaned = (Array.isArray(next) ? next : []).map((p, i) => {
      const out = {};
      for (const k of ALLOWED) if (p[k] !== undefined) out[k] = p[k] ?? null;
      if (out.id === undefined) out.id = String(p?.id ?? i);
      if (out.group !== undefined) {
        out.group = Number.isFinite(+out.group) ? +out.group : String(out.group ?? '');
      }
      if (out.handicap !== undefined) {
        const n = Number(out.handicap);
        out.handicap = Number.isFinite(n) ? n : (out.handicap == null ? null : String(out.handicap));
      }
      if (out.score !== undefined) {
        const n = Number(out.score);
        out.score = Number.isFinite(n) ? n : (out.score == null ? null : String(out.score));
      }
      if (out.room !== undefined && out.room !== null) {
        const n = Number(out.room);
        out.room = Number.isFinite(n) ? n : String(out.room);
      }
      if (out.partner !== undefined && out.partner !== null) {
        const n = Number(out.partner);
        out.partner = Number.isFinite(n) ? n : String(out.partner);
      }
      if (typeof out.selected !== 'boolean' && out.selected != null) out.selected = !!out.selected;
      return out;
    });

    // ✅ setDoc(merge) → updateDoc 으로 고정 (항상 update 규칙만 타게)
    await updateDoc(
      eref,
      sanitizeForFirestore({ participants: cleaned, updatedAt: serverTimestamp() })
    );
  }

  // ─ API ─
  async function joinRoom(roomNumber, id) {
    await ensureAuthReady(); // ✅
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
      await ensureAuthReady(); // ✅
      const rref = doc(db, 'events', eventId, 'rooms', String(rid));
      await setDoc(rref, { members: arrayUnion(targetId) }, { merge: true });
    } catch (_) {}
  }

  async function joinFourBall(roomNumber, p1, p2) {
    await ensureAuthReady(); // ✅
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
      await ensureAuthReady(); // ✅
      const fbref = doc(db, 'events', eventId, 'fourballRooms', String(rid));
      await setDoc(fbref, { pairs: arrayUnion({ p1: a, p2: b }) }, { merge: true });
    } catch (_) {}
  }

  async function assignStrokeForOne(participantId) {
    await ensureAuthReady(); // ✅

    const pid = normId(participantId || participant?.id);
    const me = participants.find((p) => normId(p.id) === pid) ||
               (participant ? participants.find((p) => normName(p.nickname) === normName(participant.nickname)) : null);
    if (!me) throw new Error('Participant not found');

    let chosenRoom = 0;
    try {
      const r = pickRoomForStroke ? pickRoomForStroke(participants, roomCount, me) : null;
      chosenRoom = toInt(typeof r === 'number' ? r : (r?.roomNumber ?? r?.room), 0);
    } catch {}

    if (!chosenRoom) {
      if (ASSIGN_STRATEGY_STROKE === 'uniform') chosenRoom = pickUniform(roomCount);
      else {
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
      await ensureAuthReady(); // ✅
      const rref = doc(db, 'events', eventId, 'rooms', String(chosenRoom));
      await setDoc(rref, { members: arrayUnion(pid) }, { merge: true });
    } catch (_) {}

    return { roomNumber: chosenRoom, roomLabel: makeLabel(roomNames, chosenRoom) };
  }

  async function assignFourballForOneAndPartner(participantId) {
    await ensureAuthReady(); // ✅

    const pid = normId(participantId || participant?.id);
    const me = participants.find((p) => normId(p.id) === pid) ||
               (participant ? participants.find((p) => normName(p.nickname) === normName(participant.nickname)) : null);
    if (!me) throw new Error('Participant not found');

    if (toInt(me.group) !== 1) {
      const partnerNickname =
        (me.partner ? participants.find((p) => normId(p.id) === normId(me.partner)) : null)?.nickname || '';
      return { roomNumber: me.room ?? null, partnerNickname };
    }

    if (FOURBALL_USE_TRANSACTION) {
      try {
        if (typeof transactionalAssignFourball === 'function') {
          const result = await transactionalAssignFourball({
            db, eventId, participants, roomCount, selfId: pid,
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

          tx.set(eref, sanitizeForFirestore({ participants: next, updatedAt: serverTimestamp() }), { merge: true });

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

    // 비트랜잭션
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
    } catch {}

    if (!roomNumber) {
      if (ASSIGN_STRATEGY_FOURBALL === 'uniform') roomNumber = pickUniform(roomCount);
      else {
        const candidates = minRooms(participants, roomCount);
        roomNumber = shuffle(candidates)[0] || pickUniform(roomCount);
      }
    }
    if (!mateId) {
      const pool = participants.filter(
        (p) => toInt(p.group) === 2 && !p.partner && normId(p.id) !== pid
      );
      mateId = pool.length ? normId(shuffle(pool)[0].id) : '';
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
      await ensureAuthReady(); // ✅
      const fbref = doc(db, 'events', eventId, 'fourballRooms', String(roomNumber));
      if (mateId) await setDoc(fbref, { pairs: arrayUnion({ p1: pid, p2: mateId }) }, { merge: true });
      else        await setDoc(fbref, { singles: arrayUnion(pid) }, { merge: true });
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
