// src/contexts/EventContext.jsx

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

export const EventContext = createContext();

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
        // 로컬 pendingWrites는 무시 → 깜빡임/무한반복 방지
        if (snap.metadata.hasPendingWrites) return;
        const data = snap.data();
        setEventData(data || null);
        lastEventDataRef.current = data || null;
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
      publicView: {
        hiddenRooms: [],
        score: true,
        banddang: true
      }
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

  // 즉시 업데이트가 꼭 필요한 경우(디바운스 없이 바로)
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

  // ★ patch: unmount flush — 라우팅/언마운트 직전에 디바운스 큐를 즉시 기록
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
  }, [eventId]);

  // ────────────────────────────────────────────────────────────────
  // publicView 편의 헬퍼
  const updatePublicView = async (partial, opts = {}) => {
    const curr = (lastEventDataRef.current && lastEventDataRef.current.publicView) || {};
    const next = { ...curr, ...partial };
    if (deepEqual(curr, next)) return;
    await updateEvent({ publicView: next }, opts);
  };

  // 로컬스토리지 키(이벤트별)
  const publicViewStorageKey = (id) => `roomTableSel:${id || eventId || ''}`;

  // 로컬 저장/복원 유틸
  const savePublicViewToLocal = (pv) => {
    try { localStorage.setItem(publicViewStorageKey(), JSON.stringify(pv || {})); } catch {}
  };
  const loadPublicViewFromLocal = () => {
    try {
      const raw = localStorage.getItem(publicViewStorageKey());
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  // 컨텍스트 값
  return (
    <EventContext.Provider
      value={{
        allEvents,
        eventId,
        eventData,
        loadEvent,
        createEvent,
        updateEvent,               // 안전(디바운스) 업데이트
        updateEventImmediate,      // 즉시 업데이트
        updateEventById,
        deleteEvent,
        // publicView 관련
        updatePublicView,
        savePublicViewToLocal,
        loadPublicViewFromLocal
      }}
    >
      {children}
    </EventContext.Provider>
  );
}
