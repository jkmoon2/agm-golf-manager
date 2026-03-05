// src/contexts/EventContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
<<<<<<< Updated upstream
  deleteDoc
=======
  deleteDoc,
  serverTimestamp,
  getDoc,
  getDocs,
  writeBatch,
>>>>>>> Stashed changes
} from 'firebase/firestore';
import { db } from '../firebase';

export const EventContext = createContext();

export function EventProvider({ children }) {
  const [allEvents, setAllEvents]   = useState([]);
  const [eventId, setEventId]       = useState(localStorage.getItem('eventId') || null);
  const [eventData, setEventData]   = useState(null);

<<<<<<< Updated upstream
  // 1) 전체 이벤트 목록 구독
=======
  const [allEvents, setAllEvents] = useState([]);
  const __storedEventId = (() => {
    try {
      const v = localStorage.getItem('eventId');
      if (!v || v === 'null' || v === 'undefined') return null;
      return v;
    } catch {
      return null;
    }
  })();
  const [eventId, setEventId] = useState(__storedEventId);
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
>>>>>>> Stashed changes
  useEffect(() => {
    const colRef = collection(db, 'events');
    const unsub  = onSnapshot(colRef, snap => {
      const evts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllEvents(evts);
    });
    return unsub;
  }, []);

  // 2) 선택된 이벤트(eventId) 구독 (pendingWrites 무시)
  useEffect(() => {
    if (!eventId) {
      setEventData(null);
      return;
    }
<<<<<<< Updated upstream
    const docRef = doc(db, 'events', eventId);
    const unsub  = onSnapshot(
      docRef,
      { includeMetadataChanges: true },
      snap => {
        // 클라이언트에서 아직 서버에 반영되지 않은 쓰기는 무시
        if (snap.metadata.hasPendingWrites) return;
        setEventData(snap.data());
      }
    );
    return unsub;
  }, [eventId]);

  // 3) 이벤트 불러오기
  const loadEvent = async id => {
    setEventId(id);
    localStorage.setItem('eventId', id);
    return id;
=======
    let unsub = null,
      cancelled = false;
    ensureAuthed().then(() => {
      if (cancelled) return;
      const docRef = doc(db, 'events', eventId);
      unsub = onSnapshot(docRef, { includeMetadataChanges: true }, (snap) => {

        // ✅ 문서가 삭제되었는데(또는 존재하지 않는데) eventId가 남아있으면
        //    이후 setDoc(merge) 호출로 문서가 '부활'하거나,
        //    콘솔에 '유령 문서(하위 컬렉션 잔존)'가 계속 남는 문제로 오해될 수 있습니다.
        //    → 문서 미존재 시 즉시 선택 해제 및 로컬스토리지 정리
        if (!snap.exists()) {
          try { console.warn('[EventContext] selected event doc missing. clear selection:', eventId); } catch {}
          setEventData(null);
          lastEventDataRef.current = null;
          try { if (localStorage.getItem('eventId') === eventId) localStorage.removeItem('eventId'); } catch {}
          setEventId(null);
          return;
        }
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
    const nextId = id || null;
    setEventId(nextId);
    try {
      if (nextId) localStorage.setItem('eventId', nextId);
      else localStorage.removeItem('eventId');
    } catch {}
    return nextId;
>>>>>>> Stashed changes
  };

  // 4) 새 이벤트 생성
  const createEvent = async ({ title, mode, id }) => {
    const colRef = collection(db, 'events');
    const docRef = id
      ? doc(db, 'events', id)
      : doc(colRef);
    await setDoc(docRef, {
      title,
      mode,
      roomCount:    4,
      roomNames:    Array(4).fill(''),
      uploadMethod: '',
      participants: []
    });
    return docRef.id;
  };

  // 5) 이벤트 업데이트
  const updateEvent = async updates => {
    if (!eventId) return;
    const docRef = doc(db, 'events', eventId);
    await updateDoc(docRef, updates);
  };

<<<<<<< Updated upstream
  // 6) 이벤트 삭제
  const deleteEvent = async id => {
    await deleteDoc(doc(db, 'events', id));
    if (eventId === id) {
      setEventId(null);
      localStorage.removeItem('eventId');
=======
  const updateEventById = async (id, updates) => {
    await ensureAuthed();
    await updateDoc(doc(db, 'events', id), updates);
  };

  const deleteEvent = async (id) => {
    await ensureAuthed();

    // ✅ Firestore는 '문서 삭제'가 하위 컬렉션까지 자동으로 지워주지 않습니다.
    // 그래서 events/{id} 루트만 지우면, rooms/scores/memberships 등 하위 컬렉션이 남아
    // 콘솔에서 문서ID가 '다시 살아난 것처럼(유령 문서)' 보이는 현상이 발생합니다.
    // → 운영자 삭제 버튼에서도 하위 컬렉션까지 최대한 함께 정리합니다.
    const eid = id;
    try {
      const subCols = [
        'participants',
        'rooms',
        'fourballRooms',
        'scores',
        'eventInputs',
        'memberships',
        'preMembers',
        'players',
        'playerStates',
      ];

      for (const sub of subCols) {
        try {
          const snap = await getDocs(collection(db, 'events', eid, sub));
          if (!snap.empty) {
            let batch = writeBatch(db);
            let n = 0;
            for (const d of snap.docs) {
              batch.delete(d.ref);
              n += 1;
              // Firestore batch limit(500) 여유 있게 끊기
              if (n >= 450) {
                await batch.commit();
                batch = writeBatch(db);
                n = 0;
              }
            }
            if (n > 0) await batch.commit();
          }
        } catch (e) {
          console.warn('[EventContext] deleteEvent subcollection cleanup failed:', eid, sub, e);
        }
      }
    } catch (e) {
      console.warn('[EventContext] deleteEvent deep cleanup failed:', eid, e);
>>>>>>> Stashed changes
    }

    // 루트 문서 삭제
    await deleteDoc(doc(db, 'events', eid));

    // 삭제 대상이 현재 선택된 이벤트면 선택 해제
    if (eventId === eid) {
      setEventId(null);
      try { localStorage.removeItem('eventId'); } catch {}
      setEventData(null);
      lastEventDataRef.current = null;
    }

    // 디바운스 큐/타이머 정리(삭제 후 잔여 저장으로 문서가 재생성되는 것 방지)
    try {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      queuedUpdatesRef.current = null;
    } catch {}
  };

  return (
    <EventContext.Provider value={{
      allEvents,
      eventId,
      eventData,
      loadEvent,
      createEvent,
      updateEvent,
      deleteEvent
    }}>
      {children}
    </EventContext.Provider>
  );
}
