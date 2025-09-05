// /src/contexts/EventContext.jsx

import React, { createContext, useState, useEffect, useRef } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';

// ✅ 기본값을 빈 객체로 지정(Provider 미장착 시 useContext가 {}를 반환)
export const EventContext = createContext({});

export function EventProvider({ children }) {
  const [allEvents, setAllEvents]   = useState([]);
  const [eventId, setEventId]       = useState(localStorage.getItem('eventId') || null);
  const [eventData, setEventData]   = useState(null);

  // 내부: 최신 eventData 보관(깊은 비교/중복 쓰기 방지용)
  const lastEventDataRef            = useRef(null);
  // 내부: updateEvent 디바운스 큐
  const queuedUpdatesRef            = useRef(null);
  const debounceTimerRef            = useRef(null);

  // ────────────────────────────────────────────────────────────────
  // 유틸: 안정적 비교를 위한 키정렬 JSON stringify
  const stableStringify = (v) => JSON.stringify(v, Object.keys(v || {}).sort());
  const deepEqual = (a, b) => {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    try {
      return stableStringify(a) === stableStringify(b);
    } catch {
      return false;
    }
  };

  // ────────────────────────────────────────────────────────────────
  // 🆕 publicView 정규화: 과거 루트 값과 모드별 서브키(stroke/fourball) 공존 지원
  //  - 기존 루트(publicView.hiddenRooms/score/banddang)는 보존(하위호환)
  //  - 누락된 서브키만 기본값으로 채움(덮어쓰지 않음)
  const normalizePublicView = (data) => {
    const d  = data || {};
    const pv = d.publicView || {};
    const base = {
      hiddenRooms: Array.isArray(pv.hiddenRooms) ? pv.hiddenRooms : [],
      visibleMetrics: (pv.visibleMetrics && typeof pv.visibleMetrics === 'object')
        ? pv.visibleMetrics
        : {
            score:    (typeof pv.score    === 'boolean' ? pv.score    : true),
            banddang: (typeof pv.banddang === 'boolean' ? pv.banddang : true)
          }
    };
    const stroke   = (pv.stroke   && typeof pv.stroke   === 'object') ? pv.stroke   : base;
    const fourball = (pv.fourball && typeof pv.fourball === 'object') ? pv.fourball : base;
    return { ...d, publicView: { ...pv, stroke, fourball } };
  };

  // 🆕 playerGate(참가자 홈 8버튼/STEP1 팀확인 제어) 기본값 & 정규화
  const defaultPlayerGate = {
    steps: { 1:'enabled',2:'enabled',3:'enabled',4:'enabled',5:'enabled',6:'enabled',7:'enabled',8:'enabled' },
    step1: { teamConfirmEnabled: true }
  };
  const normalizePlayerGate = (data) => {
    const d = data || {};
    const g = d.playerGate || {};
    const steps = g.steps || {};
    const normSteps = {};
    for (let i = 1; i <= 8; i += 1) {
      normSteps[i] = steps[i] || 'enabled';
    }
    const step1 = { ...(g.step1 || {}) };
    if (typeof step1.teamConfirmEnabled !== 'boolean') step1.teamConfirmEnabled = true;
    return { ...d, playerGate: { steps: normSteps, step1 } };
  };

  // ────────────────────────────────────────────────────────────────
  // 전체 이벤트 구독
  useEffect(() => {
    const colRef = collection(db, 'events');
    const unsub  = onSnapshot(colRef, snap => {
      const evts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllEvents(evts);
    });
    return unsub;
  }, []);

  // 선택 이벤트 구독
  useEffect(() => {
    if (!eventId) { setEventData(null); lastEventDataRef.current = null; return; }
    const docRef = doc(db, 'events', eventId);
    const unsub  = onSnapshot(
      docRef,
      { includeMetadataChanges: true },
      snap => {
        if (snap.metadata.hasPendingWrites) return;
        const data = snap.data();
        // 🆕 정규화 후 세팅(모드 간 충돌/누락 방지)
        const withPV   = normalizePublicView(data || {});
        const withGate = normalizePlayerGate(withPV);
        setEventData(withGate);
        lastEventDataRef.current = withGate;
      }
    );
    return unsub;
  }, [eventId]);

  // 현재 이벤트 선택
  const loadEvent = async (id) => {
    setEventId(id);
    localStorage.setItem('eventId', id);
    return id;
  };

  // 이벤트 생성 (기간/옵션 및 publicView 초기값 포함)
  const createEvent = async ({
    title,
    mode,
    id,
    dateStart = '',
    dateEnd = '',
    allowDuringPeriodOnly = false
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
      // ▶ 운영자 페이지(방배정표 선택/표시 옵션)를 참가자 쪽과 공유할 때 사용하는 저장소
      //    루트 값(하위호환) + 모드별 서브키(stroke/fourball) 병행
      publicView: {
        hiddenRooms: [],
        score: true,
        banddang: true,
        stroke:   { hiddenRooms: [], visibleMetrics: { score: true, banddang: true } },
        fourball: { hiddenRooms: [], visibleMetrics: { score: true, banddang: true } }
      },
      // 🆕 참가자 홈/스텝 게이트 기본값(전부 활성 + 팀확인 가능)
      playerGate: defaultPlayerGate,
      // 🆕 이벤트 정의 & 입력 저장소
      events: [],          // [{id,title,template,params,target,rankOrder,enabled}, ...]
      eventInputs: {}      // { [eventDefId]: { person:{[pid]:num}, room:{[r]:num}, team:{[key]:num} } }
    });
    return docRef.id;
  };

  // ────────────────────────────────────────────────────────────────
  // 안전 업데이트: 값이 실제로 바뀔 때만 쓰기, 그리고 디바운스(기본 400ms)
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
          await setDoc(ref, toWrite, { merge: true });
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
      await setDoc(ref, updates, { merge: true });
      // 🆕 저장 확인 로그(콘솔)
      console.info('[EventContext] saved to events/', eventId, updates); // 🆕
      lastEventDataRef.current = { ...(lastEventDataRef.current || {}), ...updates };
      setEventData(prev => prev ? { ...prev, ...updates } : updates);
    } catch (e) {
      console.warn('[EventContext] updateEventImmediate failed:', e);
      throw e;
    }
  };

  // 특정 id 대상으로 바로 업데이트(기존 API 유지)
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

  // ★ patch: unmount flush
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
          updateDoc(doc(db, 'events', eventId), pending).catch(() => {});
        }
      } catch (e) {
        console.warn('[EventContext] unmount flush error:', e);
      }
    };
  }, [db, eventId]);

  // ────────────────────────────────────────────────────────────────
  // publicView 편의 헬퍼(기존 유지) + 🆕 viewKey 지원
  // - 기존: updatePublicView({ hiddenRooms:[3] })
  // - 신규: updatePublicView({ visibleMetrics:{score:false} }, { viewKey:'fourball' })
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

    // 폴백: 루트 publicView 병합(구버전 호환)
    const nextRoot = { ...currAll, ...partial };
    if (deepEqual(currAll, nextRoot)) return;
    await updateEvent({ publicView: nextRoot }, opts);
    try { savePublicViewToLocal(nextRoot); } catch {}
  };

  const publicViewStorageKey = (id) => `roomTableSel:${id || eventId || ''}`;
  const savePublicViewToLocal = (pv) => { try { localStorage.setItem(publicViewStorageKey(), JSON.stringify(pv || {})); } catch {} };
  const loadPublicViewFromLocal = () => {
    try { const raw = localStorage.getItem(publicViewStorageKey()); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  };

  // ────────────────────────────────────────────────────────────────
  // 🆕 이벤트 정의/입력 헬퍼
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

  /**
   * setEventInput
   * @param {Object} p
   * @param {string} p.eventDefId
   * @param {'person'|'room'|'team'} p.target
   * @param {string|number} p.key - participantId or roomIndex(1-base) or teamKey
   * @param {number|null} p.value
   */
  const setEventInput = async ({ eventDefId, target, key, value }) => {
    const base = lastEventDataRef.current || {};
    const all  = { ...(base.eventInputs || {}) };
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

  // 🆕 playerGate 저장 헬퍼(안전 병합 + 변화 없으면 쓰기 생략) → 즉시 커밋으로 변경
  const updatePlayerGate = async (partialGate) => {
    const before = lastEventDataRef.current?.playerGate || defaultPlayerGate;
    const next = {
      steps: { ...(before.steps || {}), ...(partialGate?.steps || {}) },
      step1: { ...(before.step1 || {}), ...(partialGate?.step1 || {}) },
    };
    if (deepEqual(before, next)) return;
    await updateEventImmediate({ playerGate: next }); // 🆕 즉시 저장
  };

  const ctx = {
    allEvents,
    eventId,
    eventData,
    // ✅ 하위에서 안전하게 비구조화할 수 있도록 setEventId 노출
    setEventId,
    loadEvent,
    createEvent,
    updateEvent,
    updateEventImmediate,
    updateEventById,
    deleteEvent,
    // publicView
    updatePublicView,
    savePublicViewToLocal,
    loadPublicViewFromLocal,
    // 🆕 events
    addEventDef,
    updateEventDef,
    removeEventDef,
    setEventInput,
    // 🆕 playerGate
    updatePlayerGate
  };

  return (
    <EventContext.Provider value={ctx}>
      {children}
    </EventContext.Provider>
  );
}
