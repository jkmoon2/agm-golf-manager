// /src/contexts/EventContext.jsx

import React, { createContext, useState, useEffect, useRef } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  getDoc,
  // ★ ADD: scores 초기화용
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';

import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';

/* ★ Firestore 저장 전 undefined/NaN 정제 (원본 유지) */
function sanitizeUndefinedDeep(v){
  if (v === undefined) return null;
  if (typeof v === 'number' && Number.isNaN(v)) return null;
  if (Array.isArray(v)) return v.map(sanitizeUndefinedDeep);
  if (v && typeof v === 'object'){
    const out = {};
    for (const k of Object.keys(v)) out[k] = sanitizeUndefinedDeep(v[k]);
    return out;
  }
  return v;
}

// ★ ADD: participants 시드(fingerprint) 생성기 — STEP5/7의 seed 가드와 연동
function participantsSeedOf(list = []) {
  try {
    const base = (list || []).map(p => [
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

// ★ ADD: participants 포함 업데이트에 파생필드(Seed/UpdatedAt) 자동 부여
function enrichParticipantsDerived(updates) {
  if (!updates || typeof updates !== 'object') return updates;
  if (!('participants' in updates)) return updates;
  const out = { ...updates };
  try {
    const seed = participantsSeedOf(out.participants || []);
    out.participantsSeed = seed;
    // Admin/Player 동기화 가드: 서버 타임스탬프
    if (!('participantsUpdatedAt' in out)) out.participantsUpdatedAt = serverTimestamp();
  } catch {}
  return out;
}

export const EventContext = createContext({});

// ───────────────────────────────────────────────
// 인증 게이팅 (원본 유지)
// ───────────────────────────────────────────────
const auth = getAuth();
try { setPersistence(auth, browserLocalPersistence).catch(() => {}); } catch {}
const ensureAuthed = (() => {
  let p;
  return () => {
    if (p) return p;
    p = new Promise((resolve) => {
      const stop = onAuthStateChanged(auth, async (user) => {
        if (user) { stop(); resolve(user); return; }
        const isPlayerApp =
          typeof window !== 'undefined' &&
          /^\/player(\/|$)/.test(window.location.pathname);
        if (isPlayerApp) {
          try { await signInAnonymously(auth); } catch (e) { console.warn('[EventContext] anonymous sign-in failed:', e); }
        }
      });
    });
    return p;
  };
})();

export function EventProvider({ children }) {
  const [allEvents, setAllEvents]   = useState([]);
  const [eventId, setEventId]       = useState(localStorage.getItem('eventId') || null);
  const [eventData, setEventData]   = useState(null);

  const lastEventDataRef  = useRef(null);
  const queuedUpdatesRef  = useRef(null);
  const debounceTimerRef  = useRef(null);

  const stableStringify = (v) => JSON.stringify(v, Object.keys(v || {}).sort());
  const deepEqual = (a, b) => {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    try { return stableStringify(a) === stableStringify(b); } catch { return false; }
  };

  const normalizePublicView = (data) => {
    const d  = data || {};
    const pv = d.publicView || {};
    const base = {
      hiddenRooms: Array.isArray(pv.hiddenRooms) ? pv.hiddenRooms : [],
      visibleMetrics:
        (pv.visibleMetrics && typeof pv.visibleMetrics === 'object')
          ? pv.visibleMetrics
          : { score: pv.score ?? true, banddang: pv.banddang ?? true },
    };
    const stroke   = (pv.stroke   && typeof pv.stroke   === 'object') ? pv.stroke   : base;
    const fourball = (pv.fourball && typeof pv.fourball === 'object') ? pv.fourball : base;
    return { ...d, publicView: { ...pv, stroke, fourball } };
  };

  const defaultPlayerGate = {
    steps: {1:'enabled',2:'enabled',3:'enabled',4:'enabled',5:'enabled',6:'enabled',7:'enabled',8:'enabled'},
    step1: { teamConfirmEnabled: true }
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

  // 전체 이벤트 구독 (원본 유지)
  useEffect(() => {
    let unsub = null, cancelled = false;
    ensureAuthed().then(() => {
      if (cancelled) return;
      const colRef = collection(db, 'events');
      unsub = onSnapshot(colRef, snap => {
        const evts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllEvents(evts);
      });
    });
    return () => { cancelled = true; if (unsub) unsub(); };
  }, []);

  // 선택 이벤트 구독 (원본 유지)
  useEffect(() => {
    if (!eventId) { setEventData(null); lastEventDataRef.current = null; return; }
    let unsub = null, cancelled = false;
    ensureAuthed().then(() => {
      if (cancelled) return;
      const docRef = doc(db, 'events', eventId);
      unsub = onSnapshot(
        docRef,
        { includeMetadataChanges: true },
        snap => {
          if (snap.metadata.hasPendingWrites) return;
          const data = snap.data();
          const withPV   = normalizePublicView(data || {});
          const withGate = normalizePlayerGate(withPV);
          setEventData(withGate);
          lastEventDataRef.current = withGate;
        }
      );
    });
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [eventId]);

  const loadEvent = async (id) => {
    setEventId(id);
    localStorage.setItem('eventId', id);
    return id;
  };

  // 공용 업데이트(디바운스)
  const updateEvent = async (updates, opts = {}) => {
    if (!eventId || !updates || typeof updates !== 'object') return;
    const { debounceMs = 400, ifChanged = true } = opts;

    // ★ ADD: participants 포함 시 파생필드 자동 부여
    const enriched = enrichParticipantsDerived(updates);

    const before = lastEventDataRef.current || {};
    if (ifChanged) {
      let changed = false;
      for (const k of Object.keys(enriched)) {
        if (!deepEqual(before?.[k], enriched[k])) { changed = true; break; }
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
          setEventData(prev => prev ? { ...prev, ...toWrite } : toWrite);
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

    // ★ ADD: participants 포함 시 파생필드 자동 부여
    const enriched = enrichParticipantsDerived(updates);

    const before = lastEventDataRef.current || {};
    if (ifChanged) {
      let changed = false;
      for (const k of Object.keys(enriched)) {
        if (!deepEqual(before?.[k], enriched[k])) { changed = true; break; }
      }
      if (!changed) return;
    }
    try {
      const ref = doc(db, 'events', eventId);
      await setDoc(ref, sanitizeUndefinedDeep(enriched), { merge: true });

      // ★ 즉시 저장 후 디바운스 큐/타이머 비워 stale write 차단 (원본 유지)
      try {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        queuedUpdatesRef.current = null;
      } catch {}

      lastEventDataRef.current = { ...(lastEventDataRef.current || {}), ...enriched };
      setEventData(prev => prev ? { ...prev, ...enriched } : enriched);
    } catch (e) {
      console.warn('[EventContext] updateEventImmediate failed:', e);
      throw e;
    }
  };

  const updateEventById = async (id, updates) => {
    await updateDoc(doc(db, 'events', id), updates);
  };

  const deleteEvent = async (id) => {
    await deleteDoc(doc(db, 'events', id));
    if (eventId === id) {
      setEventId(null);
      localStorage.removeItem('eventId');
    }
  };

  // 이탈/가려짐 시 강제 플러시 (원본 유지)
  useEffect(() => {
    const flush = () => {
      try {
        if (!eventId) return;
        const pending = queuedUpdatesRef.current;
        if (pending) {
          queuedUpdatesRef.current = null;
          updateDoc(doc(db, 'events', eventId), sanitizeUndefinedDeep(pending)).catch(() => {});
        }
      } catch {}
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [eventId]);

  // 언마운트 플러시 + stale 필드 필터링 (원본 유지)
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

          // 현재 최신값과 다른 구버전 participants/roomTable은 저장에서 제외
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

  // publicView 저장 (로컬 미러 포함) (원본 유지)
  const publicViewStorageKey = (id) => `roomTableSel:${id || eventId || ''}`;
  const savePublicViewToLocal = (pv) => { try { localStorage.setItem(publicViewStorageKey(), JSON.stringify(pv || {})); } catch {} };
  const loadPublicViewFromLocal = () => {
    try { const raw = localStorage.getItem(publicViewStorageKey()); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  };

  const updatePublicView = async (partial, opts = {}) => {
    const { viewKey } = opts || {};
    const currAll = (lastEventDataRef.current && lastEventDataRef.current.publicView) || {};

    if (viewKey === 'stroke' || viewKey === 'fourball') {
      const currOne = (currAll[viewKey] && typeof currAll[viewKey] === 'object') ? currAll[viewKey] : {};
      const hasMetrics = partial && (partial.visibleMetrics || partial.metrics);
      const nextOne = hasMetrics
        ? {
            ...currOne,
            visibleMetrics: { ...(currOne.visibleMetrics || {}), ...(partial.visibleMetrics || partial.metrics || {}) }
          }
        : { ...currOne, ...partial };
      const nextAll = { ...currAll, [viewKey]: nextOne };
      if (deepEqual(currAll, nextAll)) return;
      await updateEvent({ publicView: nextAll }, opts);
      try { savePublicViewToLocal(nextAll); } catch {}
      return;
    }

    const nextRoot = { ...currAll, ...partial };
    if (deepEqual(currAll, nextRoot)) return;
    await updateEvent({ publicView: nextRoot }, opts);
    try { savePublicViewToLocal(nextRoot); } catch {}
  };

  // 이벤트(미니 이벤트) 정의/입력 (원본 유지)
  const addEventDef = async (def) => {
    const base = lastEventDataRef.current || {};
    const list = Array.isArray(base.events) ? [...base.events] : [];
    list.push(def);
    await updateEventImmediate({ events: list });
  };
  const updateEventDef = async (eventDefId, partial) => {
    const base = lastEventDataRef.current || {};
    const list = Array.isArray(base.events) ? [...base.events] : [];
    const next = list.map(d => d.id === eventDefId ? { ...d, ...partial } : d);
    await updateEventImmediate({ events: next });
  };
  const removeEventDef = async (eventDefId) => {
    const base = lastEventDataRef.current || {};
    const list = Array.isArray(base.events) ? [...base.events] : [];
    const next = list.filter(d => d.id !== eventDefId);
    const inputs = { ...(base.eventInputs || {}) };
    delete inputs[eventDefId];
    await updateEventImmediate({ events: next, eventInputs: inputs });
  };
  const setEventInput = async ({ eventDefId, target, key, value }) => {
    const base = lastEventDataRef.current || {};
    const all  = { ...(base.eventInputs || {}) };
    const slot = { ...(all[eventDefId] || {}) };
    const bucket = { ...(slot[target] || {}) };
    if (value === '' || value == null) { delete bucket[key]; } else { bucket[key] = Number(value); }
    slot[target] = bucket;
    all[eventDefId] = slot;
    await updateEventImmediate({ eventInputs: all }, false);
  };

  // ★ playerGate 저장 시 서버 타임스탬프도 함께 저장(최신판 식별) (원본 유지)
  const gateStorageKey = (id) => `playerGate:${id || eventId || ''}`;
  const saveGateToLocal = (gate) => { try { localStorage.setItem(gateStorageKey(), JSON.stringify(gate || {})); } catch {} };

  const updatePlayerGate = async (partialGate) => {
    const before = lastEventDataRef.current?.playerGate || defaultPlayerGate;
    const next = {
      steps: { ...(before.steps || {}), ...(partialGate?.steps || {}) },
      step1: { ...(before.step1 || {}), ...(partialGate?.step1 || {}) },
    };
    if (deepEqual(before, next)) return;
    saveGateToLocal(next);
    await updateEventImmediate({ playerGate: next, gateUpdatedAt: serverTimestamp() }, false);
  };

  // ───────────────────────────────────────────────
  // 이메일 화이트리스트(preMembers) 자동 클레임 (원본 유지)
  // ───────────────────────────────────────────────
  useEffect(() => {
    const uidRaw   = auth?.currentUser?.uid || null;
    const emailRaw = auth?.currentUser?.email || null;
    const uid = uidRaw || null;
    const email = emailRaw ? String(emailRaw).toLowerCase() : null;
    const eid = eventId || null;
    if (!uid || !eid) return;

    (async () => {
      try {
        if (email) {
          const preRef  = doc(db, 'events', eid, 'preMembers', email);
          const preSnap = await getDoc(preRef);
          if (preSnap.exists()) {
            const pre = preSnap.data();
            await setDoc(doc(db, 'events', eid, 'memberships', uid), {
              email,
              name: pre?.name ?? (auth?.currentUser?.displayName ?? null),
              nickname: pre?.nickname ?? null,
              verified: true,
              claimedAt: serverTimestamp()
            }, { merge: true });
            return;
          }
        }
        await setDoc(doc(db, 'events', eid, 'memberships', uid), {
          email: email || null,
          name : auth?.currentUser?.displayName ?? null
        }, { merge: true });
      } catch (e) {
        console.warn('[EventContext] preMembers claim failed', e);
      }
    })();
  }, [eventId, auth?.currentUser?.uid, auth?.currentUser?.email]);

  // ───────────────────────────────────────────────
  // ★★★ Admin↔Player 양방향 브리지
  // 1) Admin → Player : scores 서브컬렉션 업서트
  // 2) Player → Admin : scores 구독 → participants에 즉시 머지
  // ───────────────────────────────────────────────
  const upsertScores = async (payload = []) => {
    if (!eventId || !Array.isArray(payload) || payload.length === 0) return;
    try {
      await Promise.all(
        payload.map(({ id, score, room }) => {
          const ref  = doc(db, 'events', eventId, 'scores', String(id));
          const body = { updatedAt: serverTimestamp() };
          if (Object.prototype.hasOwnProperty.call({ score }, 'score')) body.score = score ?? null;
          if (Object.prototype.hasOwnProperty.call({ room },  'room'))  body.room  = room  ?? null;
          return setDoc(ref, body, { merge: true });
        })
      );
    } catch (e) {
      console.warn('[EventContext] upsertScores failed:', e);
    }
  };

  // ★ ADD: scores → participants 실시간 머지 (원본 유지)
  useEffect(() => {
    if (!eventId) return;
    const colRef = collection(db, 'events', eventId, 'scores');
    const unsub  = onSnapshot(colRef, snap => {
      const baseList = (lastEventDataRef.current?.participants) || [];
      if (!Array.isArray(baseList) || baseList.length === 0) return;

      const scoresMap = {};
      snap.forEach(d => {
        const s = d.data() || {};
        scoresMap[String(d.id)] = {
          score: (Object.prototype.hasOwnProperty.call(s, 'score') ? s.score : undefined),
          room:  (Object.prototype.hasOwnProperty.call(s, 'room')  ? s.room  : undefined)
        };
      });

      const merged = baseList.map(p => {
        const s = scoresMap[String(p.id)];
        if (!s) return p;
        let next = p;
        if (Object.prototype.hasOwnProperty.call(s, 'score')) next = { ...next, score: (s.score ?? null) };
        if (Object.prototype.hasOwnProperty.call(s, 'room'))  next = { ...next, room:  (s.room  ?? null) };
        return next;
      });

      if (!deepEqual(baseList, merged)) {
        updateEventImmediate({ participants: merged, participantsUpdatedAt: serverTimestamp() }).catch(() => {});
      }
    });
    return unsub;
  }, [eventId]);

  // ───────────────────────────────────────────────
  // ★ ADD: 모드별 업로드 파일명 유지(이벤트 문서 + 로컬 미러)
  //  - STEP4에서 호출: rememberUploadFilename(mode, fileName)
  //  - STEP4/5/7/8에서 조회: getUploadFilename(mode)
  // ───────────────────────────────────────────────
  const uploadNameKey = (mode, id = eventId) => `uploadFileName:${id || ''}:${mode || 'stroke'}`;
  const getUploadFilename = (mode = (lastEventDataRef.current?.mode || 'stroke')) => {
    const ed = lastEventDataRef.current || {};
    const fromDoc =
      mode === 'fourball' ? ed.uploadFileNameFourball :
      /* else */             ed.uploadFileNameStroke;
    if (fromDoc) return fromDoc;
    try {
      const raw = localStorage.getItem(uploadNameKey(mode));
      return raw || '';
    } catch { return ''; }
  };
  const rememberUploadFilename = async (mode = (lastEventDataRef.current?.mode || 'stroke'), fileName = '') => {
    try {
      localStorage.setItem(uploadNameKey(mode), fileName || '');
    } catch {}
    const partial =
      mode === 'fourball'
        ? { uploadFileNameFourball: fileName || '' }
        : { uploadFileNameStroke: fileName || '' };
    await updateEventImmediate(partial, false);
  };

  // ───────────────────────────────────────────────
  // ★ ADD: 참가자 명단 신규 적용(엑셀 업로드 후)
  //  - scores 서브컬렉션을 null로 비우고
  //  - participants/participantsSeed/participantsUpdatedAt/업로드파일명까지 한 번에 커밋
  //  - STEP4에서 이 함수 하나로 처리하면 STEP5/7 플리커 없이 안정
  // ───────────────────────────────────────────────
  const resetScores = async () => {
    if (!eventId) return;
    try {
      const snap = await getDocs(collection(db, 'events', eventId, 'scores'));
      const jobs = snap.docs.map(d =>
        setDoc(d.ref, { score: null, room: null, updatedAt: serverTimestamp() }, { merge: true })
      );
      if (jobs.length) await Promise.all(jobs);
    } catch (e) {
      console.warn('[EventContext] resetScores failed:', e);
    }
  };

  const applyNewRoster = async ({
    participants: roster = [],
    mode = (lastEventDataRef.current?.mode || 'stroke'),
    uploadFileName = '',
    clearScores = true,
  } = {}) => {
    try {
      if (clearScores) await resetScores();
      // participants + 파생필드(Seed/UpdatedAt) 자동 포함
      await updateEventImmediate({
        participants: roster || [],
      }, false);
      if (uploadFileName) await rememberUploadFilename(mode, uploadFileName);
    } catch (e) {
      console.warn('[EventContext] applyNewRoster failed:', e);
    }
  };

  return (
    <EventContext.Provider value={{
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
        timeEnd   = null
      }) => {
        const colRef = collection(db, 'events');
        const docRef = id ? doc(db, 'events', id) : doc(colRef);
        await setDoc(docRef, {
          title,
          mode,
          roomCount: 4,
          roomNames: Array(4).fill(''),
          uploadMethod: '',
          // ★ FIX: 업로드 파일명 모드별 보관 필드 초기화
          uploadFileNameStroke: '',
          uploadFileNameFourball: '',
          participants: [],
          dateStart,
          dateEnd,
          allowDuringPeriodOnly,
          accessStartAt,
          accessEndAt,
          accessUpdatedAt,
          timeStart: timeStart ?? null,
          timeEnd:   timeEnd   ?? null,
          publicView: {
            hiddenRooms: [],
            score: true,
            banddang: true,
            stroke:   { hiddenRooms: [], visibleMetrics: { score: true, banddang: true } },
            fourball: { hiddenRooms: [], visibleMetrics: { score: true, banddang: true } }
          },
          playerGate: defaultPlayerGate,
          events: [],
          eventInputs: {}
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
      upsertScores,
      // ★ ADD: 업로드 파일명/명단 적용 유틸 노출
      getUploadFilename,
      rememberUploadFilename,
      applyNewRoster,
      resetScores,
    }}>
      {children}
    </EventContext.Provider>
  );
}
