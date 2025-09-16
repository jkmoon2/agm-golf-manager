// /src/contexts/EventContext.jsx

import React, { createContext, useState, useEffect, useRef } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp   // ★ patch
} from 'firebase/firestore';
import { db } from '../firebase';

import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';

/* ★ 추가: Firestore 저장 전 undefined/NaN 정제 */
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

export const EventContext = createContext({});

// ───────────────────────────────────────────────
// 인증 게이팅 (기존 유지)
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

  // 전체 이벤트 구독 (인증 이후 attach)
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

  // 선택 이벤트 구독 (인증 이후 attach)
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
    const before = lastEventDataRef.current || {};
    if (ifChanged) {
      let changed = false;
      for (const k of Object.keys(updates)) {
        if (!deepEqual(before?.[k], updates[k])) { changed = true; break; }
      }
      if (!changed) return;
    }
    queuedUpdatesRef.current = { ...(queuedUpdatesRef.current || {}), ...updates };
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
    const before = lastEventDataRef.current || {};
    if (ifChanged) {
      let changed = false;
      for (const k of Object.keys(updates)) {
        if (!deepEqual(before?.[k], updates[k])) { changed = true; break; }
      }
      if (!changed) return;
    }
    try {
      const ref = doc(db, 'events', eventId);
      await setDoc(ref, sanitizeUndefinedDeep(updates), { merge: true });
      lastEventDataRef.current = { ...(lastEventDataRef.current || {}), ...updates };
      setEventData(prev => prev ? { ...prev, ...updates } : updates);
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

  // 페이지 이탈/가려짐 시 강제 플러시
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

  // 언마운트 플러시(기존 유지)
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
          updateDoc(doc(db, 'events', eventId), sanitizeUndefinedDeep(pending)).catch(() => {});
        }
      } catch (e) {
        console.warn('[EventContext] unmount flush error:', e);
      }
    };
  }, [eventId]);

  // publicView 저장 (로컬 미러 포함)
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

  // 이벤트(미니 이벤트) 정의/입력 (기존 유지)
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

  // ★ patch: playerGate 저장 시 서버 타임스탬프도 함께 저장(최신판 식별)
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
    await updateEventImmediate({ playerGate: next, gateUpdatedAt: serverTimestamp() }, false); // ★ patch: timestamp + 강제 저장
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
        // ★ patch: Step0에서 넘겨주는 접근 구간/타임스탬프도 그대로 저장
        accessStartAt = null,
        accessEndAt = null,
        accessUpdatedAt = null
      }) => {
        const colRef = collection(db, 'events');
        const docRef = id ? doc(db, 'events', id) : doc(colRef);
        await setDoc(docRef, {
          title,
          mode,
          roomCount: 4,
          roomNames: Array(4).fill(''),
          uploadMethod: '',
          participants: [],
          dateStart,
          dateEnd,
          allowDuringPeriodOnly,
          // ★ patch: 접근 허용 절대 구간(ms) 및 갱신 시각도 함께 저장
          accessStartAt,
          accessEndAt,
          accessUpdatedAt,
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
      updatePlayerGate
    }}>
      {children}
    </EventContext.Provider>
  );
}
