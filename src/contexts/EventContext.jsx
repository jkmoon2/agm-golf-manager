// /src/contexts/EventContext.jsx
// (원본 최대 유지 + 필요한 최소 보강: 익명 인증 보장, participants 파생필드, scores 브리지/초기화, 업로드 파일명 유지)

import React, { createContext, useState, useEffect, useRef, useContext } from 'react';
import { useLocation } from 'react-router-dom';

import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';

import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';

/* 저장 전에 undefined/NaN 정제 */
function sanitizeUndefinedDeep(v) {
  if (v === undefined) return null;
  if (typeof v === 'number' && Number.isNaN(v)) return null;
  if (Array.isArray(v)) return v.map(sanitizeUndefinedDeep);
  if (v && typeof v === 'object') {
    // Firestore FieldValue(serverTimestamp 등), Timestamp, Date, DocumentReference 같은 비-plain object는 그대로 보존
    try {
      if (v instanceof Date) return v;
      const proto = Object.getPrototypeOf(v);
      if (proto && proto !== Object.prototype) return v;
    } catch {}
    const out = {};
    for (const k of Object.keys(v)) out[k] = sanitizeUndefinedDeep(v[k]);
    return out;
  }
  return v;
}

/* participants 시드(지문) 생성 — STEP5/7 seed 가드와 연동 */
function participantsSeedOf(list = []) {
  try {
    const base = (list || []).map((p) => [
      String(p?.id ?? ''),
      String(p?.nickname ?? ''),
      Number(p?.group ?? 0),
    ]);
    base.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return JSON.stringify(base);
  } catch {
    return '';
  }
}

/* participants 포함 업데이트에 파생필드 자동 부여 */
function enrichParticipantsDerived(updates) {
  if (!updates || typeof updates !== 'object') return updates;
  if (!('participants' in updates)) return updates;
  const out = { ...updates };
  try {
    const seed = participantsSeedOf(out.participants || []);
    out.participantsSeed = seed;
    if (!('participantsUpdatedAt' in out)) out.participantsUpdatedAt = serverTimestamp();
  } catch {}
  return out;
}

// ✅ 모드별 참가자 리스트(스트로크/포볼) 완전 분리 저장 지원
// - 문서 필드: participantsStroke / participantsFourball
// - 기존 호환: participants는 "현재 모드"의 미러로 계속 유지
function participantsFieldByMode(mode = 'stroke') {
  // ✅ mode 값이 'agm'으로 들어오는 케이스까지 포볼로 동일 취급
  const m = String(mode || '').toLowerCase();
  return (m === 'fourball' || m === 'agm') ? 'participantsFourball' : 'participantsStroke';
}

// room/roomNumber 혼용(구버전/모드 혼합)으로 인한 동기화 오류 방지
function normalizeParticipantsRoomFields(list) {
  if (!Array.isArray(list)) return [];
  return list.map((p) => {
    if (!p || typeof p !== 'object') return p;
    const room = p.room;
    const roomNumber = p.roomNumber;
    if (room == null && roomNumber != null) return { ...p, room: roomNumber };
    if (room != null && roomNumber == null) return { ...p, roomNumber: room };
    return p;
  });
}

function ensureModeSplitParticipants(updates, currentMode) {
  try {
    if (!updates || typeof updates !== 'object') return updates;

    // participants / participantsStroke / participantsFourball 중 하나라도 있으면 정규화 & 미러링 적용
    const hasParticipants = ('participants' in updates);
    const hasStroke = ('participantsStroke' in updates);
    const hasFourball = ('participantsFourball' in updates);
    if (!hasParticipants && !hasStroke && !hasFourball) return updates;

    const mode = updates.mode || currentMode || 'stroke';
    const field = participantsFieldByMode(mode);

    // ✅ room/roomNumber 동기화(스트로크/포볼/참가자/운영자 화면 모두 동일 기준)
    if (hasParticipants) updates.participants = normalizeParticipantsRoomFields(updates.participants || []);
    if (hasStroke) updates.participantsStroke = normalizeParticipantsRoomFields(updates.participantsStroke || []);
    if (hasFourball) updates.participantsFourball = normalizeParticipantsRoomFields(updates.participantsFourball || []);

    // ✅ (핵심) participants만 저장하는 구버전/호환 로직
    // - participants가 들어오면 현재 mode 필드(participantsStroke/Fourball)도 항상 같이 채움
    // - 반대로, mode 전용 필드만 업데이트되는 경우(예: 포볼 배정 시 participantsFourball만 업데이트)
    //   participants 미러도 같이 채워서 Player/Admin이 동일하게 보도록 보강
    if (hasParticipants) {
      if (!(field in updates)) {
        updates[field] = updates.participants || [];
      } else {
        updates[field] = normalizeParticipantsRoomFields(updates[field] || []);
      }
    } else {
      if ((field in updates) && !('participants' in updates)) {
        updates.participants = updates[field] || [];
      }
    }
  } catch {}
  return updates;
}

export const EventContext = createContext({});

// ✅ Step5 등에서 import 해서 쓰는 훅 (기존 구조 유지)
export const useEvent = () => useContext(EventContext);

// ───────────────────────────────────────────────
// 인증 보장(경로 무관, 사용자 미인증 시 익명 로그인 수행)
// ───────────────────────────────────────────────
const auth = getAuth();
if (typeof window !== 'undefined') window.auth = auth; // ← 추가
try {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
} catch {}
const ensureAuthed = (() => {
  let p;
  return () => {
    if (p) return p;
    p = new Promise((resolve) => {
      const stop = onAuthStateChanged(auth, async (user) => {
        if (user) {
          stop();
          resolve(user);
          return;
        }
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.warn('[EventContext] anonymous sign-in failed:', e);
        }
      });
    });
    return p;
  };
})();

export function EventProvider({ children }) {
  const location = useLocation();
  const isPlayerRoute = !!location?.pathname?.startsWith('/player');

  const [allEvents, setAllEvents] = useState([]);
  const [eventId, setEventId] = useState(localStorage.getItem('eventId') || null);
  const [eventData, setEventData] = useState(null);

  // ✅ scores 서브컬렉션 SSOT: Admin↔Player 공용 점수 맵(읽기 전용, 루트 문서에 미러링하지 않음)
  const [scoresMap, setScoresMap] = useState({});
  const scoresMapRef = useRef({});
  const [scoresReady, setScoresReady] = useState(false);
  const scoresReadyRef = useRef(false);

  const lastEventDataRef = useRef(null);
  const queuedUpdatesRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const stableStringify = (value) => {
    const seen = new WeakSet();
    const normalize = (v) => {
      if (v === null || typeof v !== 'object') return v;
      if (seen.has(v)) return null; // 순환참조 방지
      seen.add(v);

      if (Array.isArray(v)) return v.map(normalize);

      const out = {};
      Object.keys(v).sort().forEach((k) => {
        out[k] = normalize(v[k]);
      });
      return out;
    };
    
    try {
      return JSON.stringify(normalize(value));
    } catch (e) {
      try { return JSON.stringify(value); } catch { return String(value); }
    }
  };
        
  const deepEqual = (a, b) => {
    if (a === b) return true;
    // 원시/널 체크
    if (a == null || b == null) return a === b;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    try {
      return stableStringify(a) === stableStringify(b);
    } catch {
      return false;
    }
  };

  const normalizePublicView = (data) => {
    const d = data || {};
    const pv = d.publicView || {};
    const base = {
      hiddenRooms: Array.isArray(pv.hiddenRooms) ? pv.hiddenRooms : [],
      visibleMetrics:
        pv.visibleMetrics && typeof pv.visibleMetrics === 'object'
          ? pv.visibleMetrics
          : { score: pv.score ?? true, banddang: pv.banddang ?? true },
    };
    const stroke = pv.stroke && typeof pv.stroke === 'object' ? pv.stroke : base;
    const fourball = pv.fourball && typeof pv.fourball === 'object' ? pv.fourball : base;
    return { ...d, publicView: { ...pv, stroke, fourball } };
  };

  const defaultPlayerGate = {
    steps: {
      1: 'enabled',
      2: 'enabled',
      3: 'enabled',
      4: 'enabled',
      5: 'enabled',
      6: 'enabled',
      7: 'enabled',
      8: 'enabled',
    },
    step1: { teamConfirmEnabled: true },
  };
  const normalizePlayerGate = (data) => {
    const d = data || {};
    const g = d.playerGate || {};
    const steps = g.steps || {};
    const normSteps = {};
    for (let i = 1; i <= 8; i += 1) normSteps[i] = steps[i] || 'enabled';
    const step1 = { ...(g.step1 || {}) };
    if (typeof step1.teamConfirmEnabled !== 'boolean') step1.teamConfirmEnabled = true;
    return { ...d, playerGate: { steps: normSteps, step1 } };
  };

  // 전체 이벤트 구독
  useEffect(() => {
    let unsub = null,
      cancelled = false;
    ensureAuthed().then(() => {
      if (cancelled) return;
      const colRef = collection(db, 'events');
      unsub = onSnapshot(colRef, (snap) => {
        const evts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAllEvents(evts);
      });
    });
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  // 선택 이벤트 구독
  useEffect(() => {
    if (!eventId) {
      setEventData(null);
      lastEventDataRef.current = null;
      return;
    }
    let unsub = null,
      cancelled = false;
    ensureAuthed().then(() => {
      if (cancelled) return;
      const docRef = doc(db, 'events', eventId);
      unsub = onSnapshot(docRef, { includeMetadataChanges: true }, (snap) => {
        const data = snap.data();
        const withPV = normalizePublicView(data || {});
        const withGate = normalizePlayerGate(withPV);

        // ✅ 모드별 participants 분리: participantsStroke/participantsFourball 지원
        // - split 필드가 '빈 배열'로만 존재하는 경우(생성 템플릿 잔상)는 기존 participants(mirror) 우선
        // - split 필드에 실제 데이터가 존재하면 해당 모드 필드를 participants로 매핑
        try {
          const mirrorArr = Array.isArray(withGate?.participants) ? withGate.participants : [];
          const strokeArr = Array.isArray(withGate?.participantsStroke) ? withGate.participantsStroke : [];
          const fourArr   = Array.isArray(withGate?.participantsFourball) ? withGate.participantsFourball : [];
          const splitEnabled = (strokeArr.length > 0) || (fourArr.length > 0);

          if (splitEnabled) {
            const m = withGate?.mode || 'stroke';
            const f = participantsFieldByMode(m);
            const splitArr = withGate?.[f];

            if (Array.isArray(splitArr) && splitArr.length > 0) withGate.participants = splitArr;
            else if (mirrorArr.length > 0) withGate.participants = mirrorArr;
            else withGate.participants = Array.isArray(splitArr) ? splitArr : [];
          }
        } catch {}

        // ✅ includeMetadataChanges: true 환경에서 pendingWrites 스냅샷을 무조건 무시하면
        //   (Player가 방배정/점수 입력 직후) Admin STEP7/STEP8 최초 진입 시
        //   방배정 반영이 늦고, 홈으로 나갔다가 재진입해야 반영되는 현상이 발생할 수 있음.
        //   → '데이터가 실제로 동일한 경우'에만 스킵하고, 내용이 바뀌면 즉시 반영.
        try {
          const prev = lastEventDataRef.current;
          if (prev && deepEqual(prev, withGate)) return;
        } catch {}

        setEventData(withGate);
        lastEventDataRef.current = withGate;
      });
    });
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [eventId]);

  const loadEvent = async (id) => {
    setEventId(id);
    localStorage.setItem('eventId', id);
    return id;
  };

  // 공용 업데이트(디바운스)
  const updateEvent = async (updates, opts = {}) => {
    if (!eventId || !updates || typeof updates !== 'object') return;
    await ensureAuthed();
    const { debounceMs = 400, ifChanged = true } = opts;

    const enriched = enrichParticipantsDerived(updates);
    // ✅ participants 저장 시, 모드별 필드(participantsStroke/participantsFourball)에도 같이 저장
    ensureModeSplitParticipants(enriched, lastEventDataRef.current?.mode || 'stroke');

    const before = lastEventDataRef.current || {};
    if (ifChanged) {
      let changed = false;
      for (const k of Object.keys(enriched)) {
        if (!deepEqual(before?.[k], enriched[k])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
    }
    queuedUpdatesRef.current = { ...(queuedUpdatesRef.current || {}), ...enriched };
    clearTimeout(debounceTimerRef.current);
    await new Promise((resolve) => {
      debounceTimerRef.current = setTimeout(async () => {
        const toWrite = queuedUpdatesRef.current;
        queuedUpdatesRef.current = null;
        try {
          const ref = doc(db, 'events', eventId);
          await setDoc(ref, sanitizeUndefinedDeep(toWrite), { merge: true });
          lastEventDataRef.current = { ...(lastEventDataRef.current || {}), ...toWrite };
          setEventData((prev) => (prev ? { ...prev, ...toWrite } : toWrite));
        } catch (e) {
          console.warn('[EventContext] updateEvent (debounced) failed:', e, 'payload:', toWrite);
        } finally {
          resolve();
        }
      }, debounceMs);
    });
  };

  // 즉시 업데이트
  const updateEventImmediate = async (updates, ifChanged = true) => {
    if (!eventId || !updates || typeof updates !== 'object') return;
    await ensureAuthed();

    const enriched = enrichParticipantsDerived(updates);
    // ✅ participants 저장 시, 모드별 필드(participantsStroke/participantsFourball)에도 같이 저장
    ensureModeSplitParticipants(enriched, lastEventDataRef.current?.mode || 'stroke');

    const before = lastEventDataRef.current || {};
    if (ifChanged) {
      let changed = false;
      for (const k of Object.keys(enriched)) {
        if (!deepEqual(before?.[k], enriched[k])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
    }
    try {
      const ref = doc(db, 'events', eventId);
      await setDoc(ref, sanitizeUndefinedDeep(enriched), { merge: true });

      // 즉시 저장 후 디바운스 큐/타이머 정리
      try {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        queuedUpdatesRef.current = null;
      } catch {}

      lastEventDataRef.current = { ...(lastEventDataRef.current || {}), ...enriched };
      setEventData((prev) => (prev ? { ...prev, ...enriched } : enriched));
    } catch (e) {
      console.warn('[EventContext] updateEventImmediate failed:', e);
      throw e;
    }
  };

  const updateEventById = async (id, updates) => {
    await ensureAuthed();
    await updateDoc(doc(db, 'events', id), updates);
  };

  const deleteEvent = async (id) => {
    await ensureAuthed();
    await deleteDoc(doc(db, 'events', id));
    if (eventId === id) {
      setEventId(null);
      localStorage.removeItem('eventId');
    }
  };

  // 탭 이탈/가려짐 시 강제 플러시
  useEffect(() => {
    // ✅ 운영자 로그인 상태에서 참가자 화면(/player/*)도 동시에 사용할 수 있도록,
    //    참가자 라우트에서는 Admin 쪽 디바운스 큐 플러시를 막아
    //    (iOS/Safari에서 pagehide/visibilitychange가 자주 발생할 때)
    //    stale 데이터가 덮어쓰는 현상을 방지합니다.
    if (isPlayerRoute) return;

    const flush = () => {
      try {
        if (isPlayerRoute) return;
        if (!eventId) return;
        const pending = queuedUpdatesRef.current;
        if (pending) {
          queuedUpdatesRef.current = null;
          updateDoc(doc(db, 'events', eventId), sanitizeUndefinedDeep(pending)).catch(() => {});
        }
      } catch {}
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [eventId, isPlayerRoute]);

  // 언마운트 플러시 + stale 필드 필터링
  useEffect(() => {
    return () => {
      try {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        const pending = queuedUpdatesRef.current;
        if (pending && eventId) {
          queuedUpdatesRef.current = null;

          // 최신값과 다른 구버전 participants/roomTable은 저장에서 제외
          let toWrite = { ...pending };
          try {
            const current = lastEventDataRef.current || {};
            if ('participants' in toWrite && !deepEqual(toWrite.participants, current.participants)) {
              const { participants, ...rest } = toWrite;
              toWrite = rest;
            }
            if ('roomTable' in toWrite && !deepEqual(toWrite.roomTable, current.roomTable)) {
              const { roomTable, ...rest2 } = toWrite;
              toWrite = rest2;
            }
          } catch {}

          if (Object.keys(toWrite).length > 0) {
            updateDoc(doc(db, 'events', eventId), sanitizeUndefinedDeep(toWrite)).catch(() => {});
          }
        }
      } catch (e) {
        console.warn('[EventContext] unmount flush error:', e);
      }
    };
  }, [eventId]);

  // publicView 저장/로드 (로컬 미러 포함)
  const publicViewStorageKey = (id) => `roomTableSel:${id || eventId || ''}`;
  const savePublicViewToLocal = (pv) => {
    try {
      localStorage.setItem(publicViewStorageKey(), JSON.stringify(pv || {}));
    } catch {}
  };
  const loadPublicViewFromLocal = () => {
    try {
      const raw = localStorage.getItem(publicViewStorageKey());
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const updatePublicView = async (partial, opts = {}) => {
    const { viewKey } = opts || {};
    const currAll = (lastEventDataRef.current && lastEventDataRef.current.publicView) || {};

    if (viewKey === 'stroke' || viewKey === 'fourball') {
      await ensureAuthed();
      const currOne = currAll[viewKey] && typeof currAll[viewKey] === 'object' ? currAll[viewKey] : {};
      const hasMetrics = partial && (partial.visibleMetrics || partial.metrics);
      const nextOne = hasMetrics
        ? {
            ...currOne,
            visibleMetrics: { ...(currOne.visibleMetrics || {}), ...(partial.visibleMetrics || partial.metrics || {}) },
          }
        : { ...currOne, ...partial };
      const nextAll = { ...currAll, [viewKey]: nextOne };
      if (deepEqual(currAll, nextAll)) return;
      await updateEvent({ publicView: nextAll }, opts);
      try {
        savePublicViewToLocal(nextAll);
      } catch {}
      return;
    }

    const nextRoot = { ...currAll, ...partial };
    if (deepEqual(currAll, nextRoot)) return;
    await updateEvent({ publicView: nextRoot }, opts);
    try {
      savePublicViewToLocal(nextRoot);
    } catch {}
  };

  // 미니 이벤트 정의/입력(원본 유지)
  const addEventDef = async (def) => {
    await ensureAuthed();
    const base = lastEventDataRef.current || {};
    const list = Array.isArray(base.events) ? [...base.events] : [];
    list.push(def);
    await updateEventImmediate({ events: list });
  };
  const updateEventDef = async (eventDefId, partial) => {
    await ensureAuthed();
    const base = lastEventDataRef.current || {};
    const list = Array.isArray(base.events) ? [...base.events] : [];
    const next = list.map((d) => (d.id === eventDefId ? { ...d, ...partial } : d));
    await updateEventImmediate({ events: next });
  };
  const removeEventDef = async (eventDefId) => {
    await ensureAuthed();
    const base = lastEventDataRef.current || {};
    const list = Array.isArray(base.events) ? [...base.events] : [];
    const next = list.filter((d) => d.id !== eventDefId);
    const inputs = { ...(base.eventInputs || {}) };
    delete inputs[eventDefId];
    await updateEventImmediate({ events: next, eventInputs: inputs });
  };
  const setEventInput = async ({ eventDefId, target, key, value }) => {
    await ensureAuthed();
    const base = lastEventDataRef.current || {};
    const all = { ...(base.eventInputs || {}) };
    const slot = { ...(all[eventDefId] || {}) };
    const bucket = { ...(slot[target] || {}) };
    if (value === '' || value == null) {
      delete bucket[key];
    } else {
      bucket[key] = Number(value);
    }
    slot[target] = bucket;
    all[eventDefId] = slot;
    await updateEventImmediate({ eventInputs: all }, false);
  };

  // playerGate 저장 시 서버 타임스탬프도 함께 저장
  const gateStorageKey = (id) => `playerGate:${id || eventId || ''}`;
  const saveGateToLocal = (gate) => {
    try {
      localStorage.setItem(gateStorageKey(), JSON.stringify(gate || {}));
    } catch {}
  };
  const updatePlayerGate = async (partialGate) => {
    await ensureAuthed();
    const before = lastEventDataRef.current?.playerGate || defaultPlayerGate;
    const next = {
      steps: { ...(before.steps || {}), ...(partialGate?.steps || {}) },
      step1: { ...(before.step1 || {}), ...(partialGate?.step1 || {}) },
    };
    if (deepEqual(before, next)) return;
    saveGateToLocal(next);
    await updateEventImmediate({ playerGate: next, gateUpdatedAt: serverTimestamp() }, false);
  };

  // 이메일 화이트리스트(preMembers) 자동 클레임
  useEffect(() => {
    const uidRaw = auth?.currentUser?.uid || null;
    const emailRaw = auth?.currentUser?.email || null;
    const uid = uidRaw || null;
    const email = emailRaw ? String(emailRaw).toLowerCase() : null;
    const eid = eventId || null;
    if (!uid || !eid) return;

    (async () => {
      try {
        if (email) {
          const preRef = doc(db, 'events', eid, 'preMembers', email);
          const preSnap = await getDoc(preRef);
          if (preSnap.exists()) {
            const pre = preSnap.data();
            await setDoc(
              doc(db, 'events', eid, 'memberships', uid),
              {
                email,
                name: pre?.name ?? auth?.currentUser?.displayName ?? null,
                nickname: pre?.nickname ?? null,
                verified: true,
                claimedAt: serverTimestamp(),
              },
              { merge: true },
            );
            return;
          }
        }
        await setDoc(
          doc(db, 'events', eid, 'memberships', uid),
          {
            email: email || null,
            name: auth?.currentUser?.displayName ?? null,
          },
          { merge: true },
        );
      } catch (e) {
        console.warn('[EventContext] preMembers claim failed', e);
      }
    })();
  }, [eventId, auth?.currentUser?.uid, auth?.currentUser?.email]);

  // ───────────────────────────────────────────────
  // Admin↔Player 브리지
  // 1) Admin → Player : scores 서브컬렉션 업서트
  // 2) Player → Admin : scores 구독 → participants에 score만 즉시 머지(room은 제외)
  // ───────────────────────────────────────────────
  const upsertScores = async (payload = []) => {
    if (!eventId || !Array.isArray(payload) || payload.length === 0) return;
    await ensureAuthed();
    try {
      await Promise.all(
        payload.map((item) => {
          const it = item || {};
          const hasScore = Object.prototype.hasOwnProperty.call(it, 'score');
          const hasRoom = Object.prototype.hasOwnProperty.call(it, 'room');
          if (!hasScore && !hasRoom) return Promise.resolve();

          const ref = doc(db, 'events', eventId, 'scores', String(it.id));
          const body = { updatedAt: serverTimestamp() };
          if (hasScore) body.score = it.score ?? null;
          if (hasRoom) body.room = it.room ?? null;
          return setDoc(ref, body, { merge: true });
        }),
      );

      // 로컬 scoresMap도 즉시 반영(깜박임 최소화)
      try {
        const curr = scoresMapRef.current || {};
        let changed = false;
        const next = { ...curr };
        (payload || []).forEach((it) => {
          if (!it) return;
          const pid = String(it.id ?? '');
          if (!pid) return;
          if (Object.prototype.hasOwnProperty.call(it, 'score')) {
            next[pid] = it.score ?? null;
            changed = true;
          }
        });
        if (changed && !deepEqual(curr, next)) {
          scoresMapRef.current = next;
          setScoresMap(next);
        }
        if (!scoresReadyRef.current) {
          scoresReadyRef.current = true;
          setScoresReady(true);
        }
      } catch {}
    } catch (e) {
      console.warn('[EventContext] upsertScores failed:', e);
    }
  };


  // scores 구독: 쌍방향 실시간을 위해 scoresMap만 갱신 (participants에 미러링/루트 write 금지)
  useEffect(() => {
    if (!eventId) {
      scoresMapRef.current = {};
      setScoresMap({});
      scoresReadyRef.current = false;
      setScoresReady(false);
      return;
    }
    let unsub = null;
    let cancelled = false;

    // 새 이벤트로 바뀌면, 최초 스냅샷 도착 전까지는 기존 participants.score를 유지(깜박임 방지)
    scoresReadyRef.current = false;
    setScoresReady(false);

    ensureAuthed().then(() => {
      if (cancelled) return;
      const colRef = collection(db, 'events', eventId, 'scores');
      unsub = onSnapshot(colRef, (snap) => {
        const nextMap = {};
        snap.forEach((d) => {
          const s = d.data() || {};
          // key가 존재하면(null 포함) 그대로 반영
          if (Object.prototype.hasOwnProperty.call(s, 'score')) nextMap[String(d.id)] = s.score ?? null;
        });

        // 불필요한 리렌더 방지
        if (!deepEqual(scoresMapRef.current || {}, nextMap || {})) {
          scoresMapRef.current = nextMap;
          setScoresMap(nextMap);
        }
        if (!scoresReadyRef.current) {
          scoresReadyRef.current = true;
          setScoresReady(true);
        }
      });
    });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [eventId]);

  // 참가자/관리자 공용: participants에 scoresMap을 overlay (화면 계산용)
  // - scores 스냅샷이 오기 전에는 participants.score 유지(깜박임 방지)
  // - 스냅샷 이후에는 scores가 SSOT: 문서가 없으면 null로 간주
  const overlayScoresToParticipants = (list = []) => {
    const base = Array.isArray(list) ? list : [];
    if (!base.length) return base;
    if (!scoresReadyRef.current) return base;

    const map = scoresMapRef.current || {};
    let changed = false;
    const next = base.map((p) => {
      const pid = String(p?.id ?? '');
      if (!pid) return p;

      const sc = Object.prototype.hasOwnProperty.call(map, pid) ? map[pid] : null;
      if ((p?.score ?? null) === (sc ?? null)) return p;
      changed = true;
      return { ...p, score: sc ?? null };
    });
    return changed ? next : base;
  };


  // 모드별 업로드 파일명 저장/조회(문서 + 로컬 미러)
  const uploadNameKey = (mode, id = eventId) => `uploadFileName:${id || ''}:${mode || 'stroke'}`;
  const getUploadFilename = (mode = lastEventDataRef.current?.mode || 'stroke') => {
    const ed = lastEventDataRef.current || {};
    const fromDoc = mode === 'fourball' ? ed.uploadFileNameFourball : ed.uploadFileNameStroke;
    if (fromDoc) return fromDoc;
    try {
      const raw = localStorage.getItem(uploadNameKey(mode));
      return raw || '';
    } catch {
      return '';
    }
  };
  const rememberUploadFilename = async (mode = lastEventDataRef.current?.mode || 'stroke', fileName = '') => {
    await ensureAuthed();
    try {
      localStorage.setItem(uploadNameKey(mode), fileName || '');
    } catch {}
    const partial =
      mode === 'fourball' ? { uploadFileNameFourball: fileName || '' } : { uploadFileNameStroke: fileName || '' };
    await updateEventImmediate(partial, false);
  };

  // 점수 초기화(서브컬렉션 삭제) — 초기화 정책: delete
  const resetScores = async () => {
    if (!eventId) return;
    await ensureAuthed();
    try {
      const snap = await getDocs(collection(db, 'events', eventId, 'scores'));
      const jobs = snap.docs.map((d) => deleteDoc(d.ref));
      if (jobs.length) await Promise.all(jobs);

      // 로컬 캐시도 즉시 비움
      scoresMapRef.current = {};
      setScoresMap({});
      scoresReadyRef.current = true; // 삭제 완료: 이제 scores가 SSOT
      setScoresReady(true);
    } catch (e) {
      console.warn('[EventContext] resetScores failed:', e);
    }
  };


  // 업로드 명단 적용(점수 초기화 → participants 저장 → 파일명 기억)
  const applyNewRoster = async ({
    participants: roster = [],
    mode = lastEventDataRef.current?.mode || 'stroke',
    uploadFileName = '',
    clearScores = true,
  } = {}) => {
    try {
      if (clearScores) await resetScores();
      // ✅ 업로드 명단은 모드별 리스트로 완전 분리 저장
      await updateEventImmediate(
        {
          participants: roster || [],
          ...(mode === 'fourball' ? { participantsFourball: roster || [] } : { participantsStroke: roster || [] }),
        },
        false,
      );
      if (uploadFileName) await rememberUploadFilename(mode, uploadFileName);
    } catch (e) {
      console.warn('[EventContext] applyNewRoster failed:', e);
    }
  };

  // ✅ participants → rooms 스냅샷 저장 (/events/{eventId}/rooms + event.roomTable)
  async function persistRoomsFromParticipants(listOverride) {
    try {
      const eid = eventId;
      if (!eid) return;
      const list = Array.isArray(listOverride)
        ? listOverride
        : lastEventDataRef.current?.participants || [];
      if (!Array.isArray(list)) return;

      // 1) participants 배열에서 방별 멤버 맵 구성
      const roomsById = {};
      for (const p of list) {
        const rm = p?.room;
        if (rm === undefined || rm === null || rm === '') continue;
        const key = String(rm);
        if (!roomsById[key]) roomsById[key] = [];
        roomsById[key].push({
          id: String(p?.id ?? ''),
          nickname: String(p?.nickname ?? ''),
          group: Number(p?.group ?? 0),
          handicap: Number(p?.handicap ?? 0),
        });
      }

      // 2) 하위 컬렉션 재구성
      const root = collection(db, 'events', eid, 'rooms');
      const existing = await getDocs(root);
      const delJobs = existing.docs.map((d) => deleteDoc(d.ref));
      if (delJobs.length) await Promise.all(delJobs);

      const setJobs = Object.entries(roomsById).map(([rid, members]) =>
        setDoc(doc(root, rid), { members, updatedAt: serverTimestamp() }),
      );
      if (setJobs.length) await Promise.all(setJobs);

      // 3) 이벤트 루트에도 roomTable 저장(경량 미러)
      await updateEventImmediate({ roomTable: roomsById }, false);
    } catch (err) {
      console.warn('[EventContext] persistRoomsFromParticipants error', err);
    }
  }

  return (
    <EventContext.Provider
      value={{
        allEvents,
        eventId,
        eventData,
        setEventId,
        loadEvent,
        createEvent: async ({
          title,
          mode,
          id,
          dateStart = '',
          dateEnd = '',
          allowDuringPeriodOnly = false,
          accessStartAt = null,
          accessEndAt = null,
          accessUpdatedAt = null,
          timeStart = null,
          timeEnd = null,
        }) => {
          await ensureAuthed();
          const colRef = collection(db, 'events');
          const docRef = id ? doc(db, 'events', id) : doc(colRef);
          await setDoc(docRef, {
            title,
            mode,
            roomCount: 4,
            roomNames: Array(4).fill(''),
            uploadMethod: '',
            uploadFileNameStroke: '',
            uploadFileNameFourball: '',
            participants: [],
            // ✅ 모드별 명단 분리 저장용(스트로크/포볼)
            participantsStroke: [],
            participantsFourball: [],
            dateStart,
            dateEnd,
            allowDuringPeriodOnly,
            accessStartAt,
            accessEndAt,
            accessUpdatedAt,
            timeStart: timeStart ?? null,
            timeEnd: timeEnd ?? null,
            publicView: {
              hiddenRooms: [],
              score: true,
              banddang: true,
              stroke: { hiddenRooms: [], visibleMetrics: { score: true, banddang: true } },
              fourball: { hiddenRooms: [], visibleMetrics: { score: true, banddang: true } },
            },
            playerGate: defaultPlayerGate,
            events: [],
            eventInputs: {},
          });
          return docRef.id;
        },
        updateEvent,
        updateEventImmediate,
        updateEventById,
        deleteEvent,
        updatePublicView,
        savePublicViewToLocal,
        loadPublicViewFromLocal,
        addEventDef,
        updateEventDef,
        removeEventDef,
        setEventInput,
        updatePlayerGate,
        scoresMap,
        scoresReady,
        overlayScoresToParticipants,
        upsertScores,
        getUploadFilename,
        rememberUploadFilename,
        applyNewRoster,
        resetScores,
        persistRoomsFromParticipants,
      }}
    >
      {children}
    </EventContext.Provider>
  );
}
