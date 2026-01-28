// /src/contexts/PlayerContext.jsx
import React, { createContext, useState, useEffect, useRef } from 'react';
import {
  doc,
  setDoc,
  arrayUnion,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,        // â updateë§ ì¬ì© (create ê¸ì§)
  getDoc,           // â ì´ë²¤í¸ ë¬¸ì ì¡´ì¬ íì¸
  collection,       // â ADD: scores êµ¬ëì©
} from 'firebase/firestore';
import { db } from '../firebase';
import { useLocation } from 'react-router-dom';
import { getAuth, signInAnonymously } from 'firebase/auth';

// (ì í) ë¨ì ìë import â ì¬ì©íì§ ììë ë¹ë ê°ë¥í ìíë¼ë©´ ê·¸ëë¡ ëìë ë©ëë¤.
// import { pickRoomForStroke } from '../player/logic/assignStroke';
import {
  pickRoomAndPartnerForFourball,
  transactionalAssignFourball,
} from '../player/logic/assignFourball';

export const PlayerContext = createContext(null);

// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// â ì½ì ì§ë¨ ëêµ¬ (ì¼ë ë²: ì½ììì localStorage.setItem('AGM_DEBUG','1'); í ìë¡ê³ ì¹¨)
const DEBUG = (() => {
  try { return (localStorage.getItem('AGM_DEBUG') === '1'); } catch { return false; }
})();
function exposeDiag(part) {
  try {
    const prev = (window.__AGM_DIAG || {});
    window.__AGM_DIAG = { ...prev, ...part };
    if (DEBUG) console.log('[AGM][diag]', window.__AGM_DIAG);
  } catch {}
}
// ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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

// â helpers â
const normId   = (v) => String(v ?? '').trim();
const normName = (s) => (s ?? '').toString().normalize('NFC').trim();
const normCode = (v) => String(v ?? '').trim().toUpperCase();
const toInt    = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);



// â ëª¨ëë³ participants íë ì í(ì¤í¸ë¡í¬/í¬ë³¼ ë¶ë¦¬ ì ì¥)
function participantsFieldByMode(md = 'stroke') {
  return md === 'fourball' ? 'participantsFourball' : 'participantsStroke';
}
const makeLabel = (roomNames, num) => {
  const n = Array.isArray(roomNames) && roomNames[num - 1]?.trim()
    ? roomNames[num - 1].trim()
    : '';
  return n || `${num}ë²ë°©`;
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

// íì¬ participants ê¸°ì¤ì¼ë¡ ë°©ë³ ì¸ìì (1-indexed room)
const countInRoom = (list, roomCount) => {
  const counts = Array.from({ length: roomCount }, () => 0);
  list.forEach(p => {
    const r = toInt(p?.room, 0);
    if (r >= 1 && r <= roomCount) counts[r - 1] += 1;
  });
  return counts;
};

// ì¤í¸ë¡í¬ì©: âê°ì ì¡° ì¤ë³µ ê¸ì§ + ì ì 4ë¯¸ë§âì ë§ì¡±íë ë°© ëª©ë¡
const validRoomsForStroke = (list, roomCount, me) => {
  const myGroup = toInt(me?.group, 0);
  const counts = countInRoom(list, roomCount);
  const rooms = [];
  for (let r = 1; r <= roomCount; r++) {
    const sameGroupExists = list.some(p => toInt(p.room) === r && toInt(p.group) === myGroup && normId(p.id) !== normId(me?.id));
    if (!sameGroupExists && counts[r - 1] < 4) rooms.push(r);
  }
  if (rooms.length === 0) {
    for (let r = 1; r <= roomCount; r++) if (counts[r - 1] < 4) rooms.push(r);
  }
  return rooms;
};

// í¬ë³¼ì©: âì ì 4ë¯¸ë§âì ë§ì¡±íë ë°© ëª©ë¡
const validRoomsForFourball = (list, roomCount) => {
  const counts = countInRoom(list, roomCount);
  const rooms = [];
  for (let r = 1; r <= roomCount; r++) if (counts[r - 1] < 4) rooms.push(r);
  return rooms.length ? rooms : Array.from({ length: roomCount }, (_, i) => i + 1);
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

// ì¸ì ì¸ì¦ íëê·¸
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

// â ëª¨ë  ì°ê¸° ì ì ì¸ì¦ ë³´ì¥ + ì½ì ì ê²ì© ë¸ì¶
async function ensureAuthReady() {
  const auth = getAuth();
  if (!auth.currentUser) {
    const cred = await signInAnonymously(auth);
    await cred.user.getIdToken(true);
  } else {
    await auth.currentUser.getIdToken(true);
  }
  if (DEBUG) {
    const a = getAuth();
    exposeDiag({
      projectId: a?.app?.options?.projectId ?? null,
      uid: a?.currentUser?.uid ?? null,
      isAnonymous: !!a?.currentUser?.isAnonymous,
    });
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
  const [membershipRoom, setMembershipRoom] = useState(null);
  const authCodeRef = useRef('');

  // authCodeê° ë°ëì´ë ì´ë²¤í¸ ì¤ëì· useEffectê° ì¬êµ¬ëëì§ ìëë¡ refë¡ ë³´ê´
  useEffect(() => {
    authCodeRef.current = authCode || '';
  }, [authCode]);

  const { pathname } = useLocation();

  useEffect(() => {
    // â URLì eventIdê° localStorageì ë¨ììë ìì  eventIdë¥¼ ë®ì´ì°ëë¡(ê°ì¥ íí ìì¸)
    //   - /player/home/:eventId
    //   - /player/room/:eventId
    //   - /player/table/:eventId
    //   - /player/select/:eventId
    if (typeof pathname === 'string') {
      const m = pathname.match(/\/player\/(home|room|table|select)\/([^/]+)/);
      const urlEventId = m?.[2];
      if (urlEventId && urlEventId !== eventId) {
        setEventId(urlEventId);
        try { localStorage.setItem('eventId', urlEventId); } catch {}
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
    }
  }, [authCode, eventId]);

  // âââââââââ events/{eventId} êµ¬ë: participants ìë³¸ ë¡ë (ê¸°ì¡´ ì ì§)
  useEffect(() => {
    if (!eventId) return;
    const ref = doc(db, 'events', eventId);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? (snap.data() || {}) : {};
      const md = (data.mode === 'fourball' || data.mode === 'agm') ? 'fourball' : 'stroke';
      setMode(md);

      // â ëª¨ëë³ ì°¸ê°ì ë¦¬ì¤í¸(ì¤í¸ë¡í¬/í¬ë³¼) ë¶ë¦¬ ì ì¥ ì§ì
      // - íì¬ ëª¨ëì í´ë¹íë participantsStroke/participantsFourballì ì°ì  ì¬ì©
      // - (í¸í) ìì¼ë©´ ê¸°ì¡´ participantsë¥¼ ì¬ì©
      const f = participantsFieldByMode(md);
      const rawParts =
        (Array.isArray(data?.[f]) && data[f].length)
          ? data[f]
          : (Array.isArray(data.participants) ? data.participants : []);
      const partArr = rawParts.map((p, i) => {
        // â FIX: ì ì ê¸°ë³¸ê° 0 â null ë³´ì (ì´ê¸°í ì¤í´ ë°©ì§)
        const scoreRaw = p?.score;
        const scoreVal = (scoreRaw === '' || scoreRaw == null) ? null : toInt(scoreRaw, 0);
        return {
          ...((p && typeof p === 'object') ? p : {}),
          id:       normId(p?.id ?? i),
          nickname: normName(p?.nickname),
          handicap: toInt(p?.handicap, 0),
          group:    toInt(p?.group, 0),
          authCode: (p?.authCode ?? '').toString(),
          room:     p?.room ?? null,
          partner:  p?.partner != null ? normId(p.partner) : null,
          score:    scoreVal,
          selected: !!p?.selected,
        };
      });
      setParticipants(partArr);

      const rn = Array.isArray(data.roomNames) ? data.roomNames : [];
      const rc = Number.isInteger(data.roomCount) ? data.roomCount : (rn.length || 4);
      setRoomCount(rc);
      setRoomNames(Array.from({ length: rc }, (_, i) => rn[i]?.trim() || ''));
      setRooms(Array.from({ length: rc }, (_, i) => ({ number: i + 1, label: makeLabel(rn, i + 1) })));

      // ✅ authCode 최신값은 ref 기준(이 effect는 authCode에 의존하지 않음)
      const currentAuthCode = (authCodeRef?.current ?? authCode ?? "");

      let me = null;
      if (currentAuthCode && String(currentAuthCode).trim()) {
        const key = normCode(currentAuthCode);
        me = partArr.find((p) => normCode(p.authCode) === key) || null;
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

      // keep participant stable (prevents iOS flicker)
      setParticipant((prev) => {
        if (me) return me;
        if (prev?.id != null) {
          const still = partArr.find((p) => normId(p?.id) === normId(prev.id));
          if (still) return still;
        }
        return null;
      });

      if (me) {
        localStorage.setItem('myId', normId(me.id));
        localStorage.setItem('nickname', normName(me.nickname));
        try {
          sessionStorage.setItem(`myId_${eventId}`, normId(me.id));
          sessionStorage.setItem(`nickname_${eventId}`, normName(me.nickname));
        } catch {}
        if (me.authCode) setAuthCode(me.authCode);
        markEventAuthed(eventId, me.authCode, me);
      }
    });
    return () => unsub();
  }, [eventId]);
  // âââââââââ âââ ADD: memberships ë¬¸ì êµ¬ë â room fallback (iOS/ê´ë¦¬ì-ì°¸ê°ìí­ ìì í)
  useEffect(() => {
    if (!eventId) return;
    let unsub = null;
    let alive = true;

    (async () => {
      try {
        await ensureAuthReady();
        if (!alive) return;
        const auth = getAuth();
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const mref = doc(db, 'events', eventId, 'memberships', uid);
        unsub = onSnapshot(mref, (snap) => {
          const data = snap.exists() ? (snap.data() || {}) : {};
          const roomVal = (data.room ?? data.roomNumber ?? null);
          setMembershipRoom(roomVal ?? null);
        });
      } catch (e) {
        // ignore
      }
    })();

    return () => {
      alive = false;
      try {
        if (unsub) unsub();
      } catch {}
    };
  }, [eventId]);


  // âââââââââ âââ ADD: scores ìë¸ì»¬ë ì êµ¬ë â participantsì ì¦ì í©ì¹ê¸°(ADMINâPLAYER ì¤ìê°)
  useEffect(() => {
    if (!eventId) return;
    const colRef = collection(db, 'events', eventId, 'scores');
    const unsub = onSnapshot(colRef, (snap) => {
      const map = {};
      snap.forEach(d => {
        const s = d.data() || {};
        map[String(d.id)] = {
          score: (Object.prototype.hasOwnProperty.call(s, 'score') ? s.score : undefined),
        };
      });
      setParticipants(prev => {
        const next = (prev || []).map(p => {
          const s = map[String(p.id)];
          if (!s) return p;
          let out = p, changed = false;
          if (Object.prototype.hasOwnProperty.call(s, 'score') && (p.score ?? null) !== (s.score ?? null)) {
            out = { ...out, score: s.score ?? null }; changed = true;
          }
          return changed ? out : p;
        });
        return next;
      });
    });
    return () => unsub();
  }, [eventId]);

  // participants ì ì¥ (íì´í¸ë¦¬ì¤í¸ + updateDoc)
  async function writeParticipants(next) {
    if (!eventId) return;
    await ensureAuthReady();

    const eref = doc(db, 'events', eventId);

    const exists = (await getDoc(eref)).exists();
    if (DEBUG) exposeDiag({ eventId, eventExists: exists });
    if (!exists) {
      alert('ì´ë²¤í¸ ë¬¸ìê° ì¡´ì¬íì§ ììµëë¤. ê´ë¦¬ììê² ë¬¸ìí´ ì£¼ì¸ì.');
      throw new Error('Event document does not exist');
    }

    const ALLOWED = ['id','group','nickname','handicap','score','room','roomNumber','partner','authCode','selected'];
    const cleaned = (Array.isArray(next) ? next : []).map((p, i) => {
      const out = {};
      for (const k of ALLOWED) if (p[k] !== undefined) out[k] = p[k] ?? null;
      if (out.id === undefined) out.id = String(p?.id ?? i);

      // ì«ì ì ê·í
      if (out.group !== undefined) {
        out.group = Number.isFinite(+out.group) ? +out.group : String(out.group ?? '');
      }
      if (out.handicap !== undefined) {
        const n = Number(out.handicap);
        out.handicap = Number.isFinite(n) ? n : (out.handicap == null ? null : String(out.handicap));
      }
      if (out.score !== undefined) {
        // â FIX: ë¹ê°ì null ì ì§
        if (out.score === '' || out.score == null) out.score = null;
        else {
          const n = Number(out.score);
          out.score = Number.isFinite(n) ? n : null;
        }
      }
      if (out.room !== undefined && out.room !== null) {
        const n = Number(out.room);
        out.room = Number.isFinite(n) ? n : String(out.room);
      }
      if (out.roomNumber !== undefined && out.roomNumber !== null) {
        const n = Number(out.roomNumber);
        out.roomNumber = Number.isFinite(n) ? n : String(out.roomNumber);
      }
      if (out.partner !== undefined && out.partner !== null) {
        const n = Number(out.partner);
        out.partner = Number.isFinite(n) ? n : String(out.partner);
      }
      if (typeof out.selected !== 'boolean' && out.selected != null) out.selected = !!out.selected;

      // roomNumber ëê¸°í(íìì©)
      if (out.roomNumber == null && out.room != null) out.roomNumber = out.room;

      return out;
    });

    try {
      await updateDoc(
        eref,
        sanitizeForFirestore({ participants: cleaned, [participantsFieldByMode(mode)]: cleaned, participantsUpdatedAt: serverTimestamp() })
      );
    } catch (e) {
      exposeDiag({ lastWriteError: e?.message || String(e) });
      throw e;
    }
  }

  // â API (ìë³¸ ì ì§) â
  async function joinRoom(roomNumber, id) {
    await ensureAuthReady();
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
      await ensureAuthReady();
      const rref = doc(db, 'events', eventId, 'rooms', String(rid));
      await setDoc(rref, { members: arrayUnion(targetId) }, { merge: true });
    } catch (_) {}
  }

  async function joinFourBall(roomNumber, p1, p2) {
    await ensureAuthReady();
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
      await ensureAuthReady();
      const fbref = doc(db, 'events', eventId, 'fourballRooms', String(rid));
      await setDoc(fbref, { pairs: arrayUnion({ p1: a, p2: b }) }, { merge: true });
    } catch (_) {}
  }

  async function assignStrokeForOne(participantId) {
    await ensureAuthReady();

    const pid = normId(participantId || participant?.id);
    const me = participants.find((p) => normId(p.id) === pid) ||
               (participant ? participants.find((p) => normName(p.nickname) === normName(participant.nickname)) : null);
    if (!me) throw new Error('Participant not found');

    let candidates = validRoomsForStroke(participants, roomCount, me);
    if (!candidates.length) candidates = Array.from({ length: roomCount }, (_, i) => i + 1);
    const chosenRoom = candidates[Math.floor(cryptoRand() * candidates.length)];

    const next = participants.map((p) =>
      normId(p.id) === pid ? { ...p, room: chosenRoom } : p
    );
    setParticipants(next);
    if (participant && normId(participant.id) === pid) {
      setParticipant((prev) => prev && { ...prev, room: chosenRoom });
    }
    await writeParticipants(next);

    try {
      await ensureAuthReady();
      const rref = doc(db, 'events', eventId, 'rooms', String(chosenRoom));
      await setDoc(rref, { members: arrayUnion(pid) }, { merge: true });
    } catch (_) {}

    return { roomNumber: chosenRoom, roomLabel: makeLabel(roomNames, chosenRoom) };
  }

  async function assignFourballForOneAndPartner(participantId) {
    await ensureAuthReady();

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
          // â FIX: ëª¨ëë³ ë¶ë¦¬ ì ì¥(participantsFourball / participantsStroke) ê¸°ì¤ì¼ë¡ ì½ê³ /ì°ê¸°
          // - participantsFourball ê°ì´ ì¡´ì¬íë ì´ë²¤í¸ììë participantsë§ ê°±ì íë©´
          //   onSnapshotì´ participantsFourballì ë¤ì ë®ì´ì¨ì "ë°°ì ì´ íë¦¬ë" íìì´ ë°ìí©ëë¤.
          const fieldParts = participantsFieldByMode(mode);
          const baseParts = (Array.isArray(data?.[fieldParts]) && data[fieldParts]?.length)
            ? data[fieldParts]
            : (data.participants || []);

          const parts = (baseParts || []).map((p, i) => ({
            ...((p && typeof p === 'object') ? p : {}),
            id: normId(p?.id ?? i),
            nickname: normName(p?.nickname),
            group: toInt(p?.group, 0),
            room: p?.room ?? null,
            partner: p?.partner != null ? normId(p?.partner) : null,
          }));

          const self = parts.find((p) => normId(p.id) === pid);
          if (!self) throw new Error('Participant not found');

          const rooms = validRoomsForFourball(parts, roomCount);
          const roomNumber = rooms[Math.floor(cryptoRand() * rooms.length)];

          const pool = parts.filter(
            (p) => toInt(p.group) === 2 && !p.partner && normId(p.id) !== pid
          );
          const mateId = pool.length ? normId(shuffle(pool)[0].id) : '';

          const next = parts.map((p) => {
            if (normId(p.id) === pid) return { ...p, room: roomNumber, partner: mateId || null };
            if (mateId && normId(p.id) === mateId) return { ...p, room: roomNumber, partner: pid };
            return p;
          });

          tx.set(
            eref,
            sanitizeForFirestore({
              participants: next,
              [fieldParts]: next,
              participantsUpdatedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
            { merge: true }
          );

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

    const rooms = validRoomsForFourball(participants, roomCount);
    const roomNumber = rooms[Math.floor(cryptoRand() * rooms.length)];

    let mateId = '';
    const pool = participants.filter(
      (p) => toInt(p.group) === 2 && !p.partner && normId(p.id) !== pid
    );
    mateId = pool.length ? normId(shuffle(pool)[0].id) : '';

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
      await ensureAuthReady();
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
        membershipRoom,
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
