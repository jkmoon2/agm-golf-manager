// /src/contexts/PlayerContext.jsx
import React, { createContext, useState, useEffect } from 'react';
import {
  doc,
  setDoc,
  arrayUnion,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,        // ✅ update만 사용 (create 금지)
  getDoc,           // ✅ 이벤트 문서 존재 확인
  collection,       // ★ ADD: scores 구독용
} from 'firebase/firestore';
import { db } from '../firebase';
import { useLocation } from 'react-router-dom';
import { getAuth, signInAnonymously } from 'firebase/auth';

// (선택) 남아 있던 import — 사용하지 않아도 빌드 가능한 상태라면 그대로 두셔도 됩니다.
// import { pickRoomForStroke } from '../player/logic/assignStroke';
import {
  pickRoomAndPartnerForFourball,
  transactionalAssignFourball,
} from '../player/logic/assignFourball';

export const PlayerContext = createContext(null);

// ──────────────────────────────────────────────────────────────
// ✅ 콘솔 진단 도구 (켜는 법: 콘솔에서 localStorage.setItem('AGM_DEBUG','1'); 후 새로고침)
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
// ──────────────────────────────────────────────────────────────

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



// ✅ 모드별 participants 필드 선택(스트로크/포볼 분리 저장)
function participantsFieldByMode(md = 'stroke') {
  return md === 'fourball' ? 'participantsFourball' : 'participantsStroke';
}
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

// 현재 participants 기준으로 방별 인원수 (1-indexed room)
const countInRoom = (list, roomCount) => {
  const counts = Array.from({ length: roomCount }, () => 0);
  list.forEach(p => {
    const r = toInt(p?.room, 0);
    if (r >= 1 && r <= roomCount) counts[r - 1] += 1;
  });
  return counts;
};

// 스트로크용: “같은 조 중복 금지 + 정원 4미만”을 만족하는 방 목록
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

// 포볼용: “정원 4미만”을 만족하는 방 목록
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

// ✅ 모든 쓰기 전에 인증 보장 + 콘솔 점검용 노출
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

  const { pathname } = useLocation();

  useEffect(() => {
    // ✅ URL의 eventId가 localStorage에 남아있는 예전 eventId를 덮어쓰도록(가장 흔한 원인)
    //   - /player/home/:eventId
    //   - /player/room/:eventId
    //   - /player/table/:eventId
    //   - /player/select/:eventId
    if (typeof pathname === 'string') {
      // player 라우트가 점수/결과 등으로 확장되면서 eventId 추출 범위를 넓힘
      const m = pathname.match(/\/player\/(home|room|table|select|score|result|step1|step2|step4|step5)\/([^/]+)/);
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
      setParticipant(null);
    }
  }, [authCode, eventId]);

  // ───────── events/{eventId} 구독: participants 원본 로드 (기존 유지)
  useEffect(() => {
    if (!eventId) return;
    const ref = doc(db, 'events', eventId);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? (snap.data() || {}) : {};
      const md = (data.mode === 'fourball' || data.mode === 'agm') ? 'fourball' : 'stroke';
      setMode(md);

      // ✅ Admin 화면과 동일하게 기본은 events/{eventId}.participants 를 기준으로 읽는다.
      // - participantsStroke/participantsFourball 은 과거/실험용으로 남아 있을 수 있으며,
      //   Admin(방배정) 수정이 participants 에만 반영되는 경우가 있어서 Player 쪽에서 우선순위를 낮춘다.
      // - (호환) participants 가 비어있고 모드별 필드만 존재하는 구버전 이벤트는 fallback 한다.
      const f = participantsFieldByMode(md);
      const rawParts =
        (Array.isArray(data.participants) && data.participants.length)
          ? data.participants
          : ((Array.isArray(data?.[f]) && data[f].length)
              ? data[f]
              : (Array.isArray(data.participants) ? data.participants : []));
      const partArr = rawParts.map((p, i) => {
        // ★ FIX: 점수 기본값 0 → null 보정(초기화 오해 방지)
        const scoreRaw = p?.score;
        const scoreVal = (scoreRaw === '' || scoreRaw == null) ? null : toInt(scoreRaw, 0);
        return {
          ...((p && typeof p === 'object') ? p : {}),
          id:       normId(p?.id ?? i),
          nickname: normName(p?.nickname),
          handicap: toInt(p?.handicap, 0),
          group:    toInt(p?.group, 0),
          authCode: (p?.authCode ?? '').toString(),
          // roomNumber(구버전) 호환
          room:     (p?.room ?? p?.roomNumber) ?? null,
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

  // ───────── ★★★ ADD: scores 서브컬렉션 구독 → participants에 즉시 합치기(ADMIN→PLAYER 실시간)
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

  // participants 저장 (화이트리스트 + updateDoc)
  async function writeParticipants(next) {
    if (!eventId) return;
    await ensureAuthReady();

    const eref = doc(db, 'events', eventId);

    const exists = (await getDoc(eref)).exists();
    if (DEBUG) exposeDiag({ eventId, eventExists: exists });
    if (!exists) {
      alert('이벤트 문서가 존재하지 않습니다. 관리자에게 문의해 주세요.');
      throw new Error('Event document does not exist');
    }

    const ALLOWED = ['id','group','nickname','handicap','score','room','roomNumber','partner','authCode','selected'];
    const cleaned = (Array.isArray(next) ? next : []).map((p, i) => {
      const out = {};
      for (const k of ALLOWED) if (p[k] !== undefined) out[k] = p[k] ?? null;
      if (out.id === undefined) out.id = String(p?.id ?? i);

      // 숫자 정규화
      if (out.group !== undefined) {
        out.group = Number.isFinite(+out.group) ? +out.group : String(out.group ?? '');
      }
      if (out.handicap !== undefined) {
        const n = Number(out.handicap);
        out.handicap = Number.isFinite(n) ? n : (out.handicap == null ? null : String(out.handicap));
      }
      if (out.score !== undefined) {
        // ★ FIX: 빈값은 null 유지
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

      // roomNumber 동기화(표시용)
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

  // ─ API (원본 유지) ─
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
          // ★ FIX: 모드별 분리 저장(participantsFourball / participantsStroke) 기준으로 읽고/쓰기
          // - participantsFourball 값이 존재하는 이벤트에서는 participants만 갱신하면
          //   onSnapshot이 participantsFourball을 다시 덮어써서 "배정이 풀리는" 현상이 발생합니다.
          const fieldParts = participantsFieldByMode(mode);
          const baseParts = (Array.isArray(data?.[fieldParts]) && data[fieldParts]?.length)
            ? data[fieldParts]
            : (data.participants || []);

          const parts = (baseParts || []).map((p, i) => ({
            ...((p && typeof p === 'object') ? p : {}),
            id: normId(p?.id ?? i),
            nickname: normName(p?.nickname),
            group: toInt(p?.group, 0),
          // roomNumber(구버전) 호환
          room: (p?.room ?? p?.roomNumber) ?? null,
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
