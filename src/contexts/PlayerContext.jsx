// /src/contexts/PlayerContext.jsx

import React, { createContext, useState, useEffect, useRef } from 'react';
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

/**
 * ✅ Player 탭/창 단위 SSOT 보조 저장소
 * - Admin(EventContext)는 localStorage 'eventId' 를 사용합니다.
 * - Player는 'player.eventId' + 탭/창(window.name) 스코프로 분리하여 서로 덮어쓰지 않도록 합니다.
 * - iOS(PWA/Safari)에서 sessionStorage가 간헐적으로 초기화되는 케이스를 localStorage(탭 스코프)로 보강합니다.
 */
const PLAYER_TAB_PREFIX = 'agmPlayerTab:';
const getPlayerTabId = () => {
  try {
    if (typeof window === 'undefined') return 'default';
    const cur = String(window.name || '');
    if (cur.startsWith(PLAYER_TAB_PREFIX)) return cur.slice(PLAYER_TAB_PREFIX.length) || 'default';
    const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.name = PLAYER_TAB_PREFIX + id;
    return id;
  } catch {
    return 'default';
  }
};
const playerStorageKey = (eid, key) => `agm:player:${getPlayerTabId()}:${String(eid || '')}:${key}`;



// ✅ 모드별 participants 필드 선택(스트로크/포볼 분리 저장)
function participantsFieldByMode(md = 'stroke') {
  return (md === 'fourball' || md === 'agm') ? 'participantsFourball' : 'participantsStroke';
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

  // iOS/PWA에서 sessionStorage가 초기화되는 케이스 보강(탭/창 스코프 localStorage)
  try {
    localStorage.setItem(playerStorageKey(id, 'authed'), 'true');
    if (code != null) localStorage.setItem(playerStorageKey(id, 'authCode'), String(code));
    if (meObj) {
      localStorage.setItem(playerStorageKey(id, 'participant'), JSON.stringify(meObj));
      localStorage.setItem(playerStorageKey(id, 'myId'), normId(meObj.id || ''));
      localStorage.setItem(playerStorageKey(id, 'nickname'), normName(meObj.nickname || ''));
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
    try { return localStorage.getItem('player.eventId') || localStorage.getItem('eventId') || ''; } catch { return ''; }
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
      const m = pathname.match(/\/player\/(home|room|table|select)\/([^/]+)/);
      const urlEventId = m?.[2];
      if (urlEventId && urlEventId !== eventId) {
        setEventId(urlEventId);
        try { localStorage.setItem('player.eventId', urlEventId); } catch {}
      }
    }
  }, [pathname, eventId]);

  useEffect(() => {
    if (!eventId) return;
    try {
      // 우선순위: pending_code(로그인 직후) → sessionStorage(authcode_eventId) → 탭 스코프 localStorage 백업
      const pending = sessionStorage.getItem('pending_code') || '';
      const stored =
        sessionStorage.getItem(`authcode_${eventId}`) ||
        localStorage.getItem(playerStorageKey(eventId, 'authCode')) ||
        '';
      const code = (pending && pending.trim()) ? pending : stored;

      if (code != null) setAuthCode(String(code));

      // pending_code는 적용 후 정리(다른 이벤트로 새는 문제 방지)
      if (pending && pending.trim()) {
        sessionStorage.removeItem('pending_code');
        sessionStorage.setItem(`authcode_${eventId}`, String(pending));
        try { localStorage.setItem(playerStorageKey(eventId, 'authCode'), String(pending)); } catch {}
      }
    } catch {}
  }, [eventId]);useEffect(() => {
    try { if (eventId) localStorage.setItem('player.eventId', eventId); } catch {}
  }, [eventId]);

  // ✅ authCode 변경(=다른 닉네임/인증코드로 재로그인) 시에만 캐시를 정리
  // - 초기 마운트/리로드 때 authCode가 세팅되는 과정에서 participant가 매번 null로 리셋되는 문제를 방지
  const lastAuthCodeRef = useRef('');
  useEffect(() => {
    // event가 바뀌면 비교 기준 초기화
    lastAuthCodeRef.current = '';
  }, [eventId]);

  useEffect(() => {
    const cur = (authCode || '').toString().trim();
    if (!eventId) return;

    // 첫 세팅은 정리하지 않고 기준만 잡는다(리로드/스냅샷 동기화 과정에서 풀림 방지)
    if (lastAuthCodeRef.current === '') {
      lastAuthCodeRef.current = cur;
      return;
    }

    if (cur && lastAuthCodeRef.current !== cur) {
      try {
        sessionStorage.removeItem(`participant_${eventId}`);
        sessionStorage.removeItem(`myId_${eventId}`);
        sessionStorage.removeItem(`nickname_${eventId}`);
        sessionStorage.removeItem(`auth_${eventId}`);
        sessionStorage.removeItem(`authcode_${eventId}`);
      } catch {}

      try {
        localStorage.removeItem(playerStorageKey(eventId, 'participant'));
        localStorage.removeItem(playerStorageKey(eventId, 'myId'));
        localStorage.removeItem(playerStorageKey(eventId, 'nickname'));
        localStorage.removeItem(playerStorageKey(eventId, 'authed'));
        localStorage.removeItem(playerStorageKey(eventId, 'authCode'));
      } catch {}

      setParticipant(null);
    }

    lastAuthCodeRef.current = cur;
  }, [authCode, eventId]);
// ───────── events/{eventId} 구독: participants 원본 로드 (기존 유지)
  useEffect(() => {
    if (!eventId) return;
    const ref = doc(db, 'events', eventId);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? (snap.data() || {}) : {};
      const md = (data.mode === 'fourball' || data.mode === 'agm') ? 'fourball' : 'stroke';
      setMode(md);

      // ✅ 모드별 참가자 리스트(스트로크/포볼) 분리 저장 지원
      // - 현재 모드에 해당하는 participantsStroke/participantsFourball을 우선 사용
      // - (호환) 없으면 기존 participants를 사용
      const f = participantsFieldByMode(md);

      // ✅ SSOT: split 필드(participantsStroke/participantsFourball) + legacy(participants) 동시 존재 시 merge
      // - Player/Admin 어느 쪽에서 저장하든 "방배정/팀원/점수"가 한쪽 필드에만 기록되는 경우가 있어
      //   iOS에서 스냅샷 순서에 따라 "방배정 풀림/리스트 안뜸"이 발생할 수 있습니다.
      const rawSplit  = Array.isArray(data?.[f]) ? data[f] : [];
      const rawLegacy = Array.isArray(data.participants) ? data.participants : [];

      const mergeById = (primary = [], secondary = []) => {
        const map = new Map();
        secondary.forEach((p, i) => {
          const id = normId(p?.id ?? i);
          map.set(id, (p && typeof p === 'object') ? p : {});
        });
        primary.forEach((p, i) => {
          const id = normId(p?.id ?? i);
          const base = map.get(id) || {};
          const cur = (p && typeof p === 'object') ? p : {};
          const out = { ...base, ...cur };

          // 중요 필드: null/undefined가 덮어쓰지 않도록 보강
          const pick = (k) => {
            const a = cur?.[k];
            const b = base?.[k];
            if (a !== undefined && a !== null && a !== '') return a;
            if (b !== undefined) return b;
            return a;
          };
          out.room       = pick('room');
          out.roomNumber = pick('roomNumber');
          out.partner    = pick('partner');
          out.score      = pick('score');
          out.authCode   = pick('authCode');

          map.set(id, out);
        });
        return Array.from(map.values());
      };

      let rawParts =
        (rawSplit.length && rawLegacy.length)
          ? mergeById(rawSplit, rawLegacy)
          : (rawSplit.length ? rawSplit : rawLegacy);

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
          room:     (p?.room ?? p?.roomNumber) ?? null,
          roomNumber: (p?.roomNumber ?? p?.room) ?? null,
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
        const authedThisEvent =
          sessionStorage.getItem(`auth_${eventId}`) === 'true' ||
          localStorage.getItem(playerStorageKey(eventId, 'authed')) === 'true';
        if (authedThisEvent) {
          let idCached  = '';
          let nickCache = '';
          try {
            idCached  = normId(sessionStorage.getItem(`myId_${eventId}`) || '');
            nickCache = normName(sessionStorage.getItem(`nickname_${eventId}`) || '');
          } catch {}
          if (!idCached)  { try { idCached  = normId(localStorage.getItem(playerStorageKey(eventId, 'myId')) || ''); } catch {} }
          if (!nickCache) { try { nickCache = normName(localStorage.getItem(playerStorageKey(eventId, 'nickname')) || ''); } catch {} }
          if (idCached)         me = partArr.find((p) => normId(p.id) === idCached) || null;
          if (!me && nickCache) me = partArr.find((p) => normName(p.nickname) === nickCache) || null;
        }
      }

      if (me) {
        setParticipant(me);

        // ✅ 탭/창 스코프 보강(다른 창 테스트 시 서로 덮어쓰기 방지 + iOS sessionStorage 유실 대비)
        try {
          localStorage.setItem(playerStorageKey(eventId, 'myId'), normId(me.id));
          localStorage.setItem(playerStorageKey(eventId, 'nickname'), normName(me.nickname));
          if (me.authCode) localStorage.setItem(playerStorageKey(eventId, 'authCode'), String(me.authCode));
          localStorage.setItem(playerStorageKey(eventId, 'authed'), 'true');
        } catch {}

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
