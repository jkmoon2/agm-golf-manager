// hooks/usePersistRoomTableSelection.js
// 기존 코드를 최대한 유지하며, 'eventId is not defined' 오류를 유발하던
// 파일 상단 전역 참조(=함수 바깥의 eventId 사용)를 전부 제거했습니다.
// 이제 반드시 훅 인자로 eventId를 받아 사용합니다. eventId가 없으면
// Firestore 저장은 건너뛰고, 로컬스토리지에만 저장합니다.

import { useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/** 안전한 JSON 비교(키 정렬) */
function stableStringify(obj) {
  try {
    return JSON.stringify(obj, Object.keys(obj || {}).sort());
  } catch (e) {
    try { return JSON.stringify(obj); } catch { return String(obj); }
  }
}

/** 디바운서 */
function useDebouncedCallback(fn, delay = 300) {
  const timerRef = useRef(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return (...args) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fn(...args), delay);
  };
}

/**
 * 선택 상태(숨김 방 + 점수/반땅 표시)를 로컬/원격에 유지합니다.
 * @param {Object} opt
 * @param {string} opt.eventId - Firestore events/{eventId}
 * @param {Set<number>} opt.hiddenRooms
 * @param {Function} opt.setHiddenRooms
 * @param {boolean} opt.showScore
 * @param {Function} opt.setShowScore
 * @param {boolean} opt.showHalved
 * @param {Function} opt.setShowHalved
 * @param {boolean} [opt.syncToFirestore] - true이면 Firestore에도 저장(기본 false)
 * @param {boolean} [opt.saveToFirestore] - 과거 옵션 호환
 */
export default function usePersistRoomTableSelection(opt = {}) {
  const {
    eventId,
    hiddenRooms,
    setHiddenRooms,
    showScore,
    setShowScore,
    showHalved,
    setShowHalved,
    syncToFirestore = false,
    saveToFirestore = false, // 구 옵션 호환
  } = opt;

  // 전역이 아닌, 훅 내부에서만 키를 계산 → 전역 eventId 참조 금지
  const lsKey = eventId ? `pv:${eventId}` : `pv:__no_event__`;

  const prevJsonRef = useRef('');
  const firstRunRef = useRef(true);

  const debouncedSaveRemote = useDebouncedCallback(async (payload) => {
    if (!eventId) {
      console.log('[usePersistRoomTableSelection] skip remote: no eventId');
      return;
    }
    try {
      const docRef = doc(db, 'events', eventId);
      // metrics(구키)와 visibleMetrics(신키) 동시 갱신
      const vm = payload.visibleMetrics || { score: false, banddang: false };
      const update = {
        publicView: {
          hiddenRooms: payload.hiddenRooms || [],
          visibleMetrics: vm,
          metrics: vm,
        }
      };
      await updateDoc(docRef, update);
      console.log('[usePersistRoomTableSelection] remote saved:', update);
    } catch (err) {
      console.warn('[usePersistRoomTableSelection] remote save failed:', err);
    }
  }, 300);

  // 외부에서 상태를 바꿀 때마다 로컬/원격 저장
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!setHiddenRooms || !setShowScore || !setShowHalved) {
      // 필수 세터가 없으면 아무 것도 하지 않음
      return;
    }

    // 현재 스냅샷(정규화)
    const rooms = Array.isArray(hiddenRooms)
      ? hiddenRooms.map(Number)
      : (hiddenRooms && typeof hiddenRooms.size === 'number'
          ? Array.from(hiddenRooms).map(Number)
          : []);
    rooms.sort((a, b) => a - b);

    const visibleMetrics = { score: !!showScore, banddang: !!showHalved };
    const snapshot = { hiddenRooms: rooms, visibleMetrics };

    const json = stableStringify(snapshot);
    if (json === prevJsonRef.current) return;
    prevJsonRef.current = json;

    // 최초 1회는 기준값만 맞추고 원격 쓰기 생략(루프 방지)
    if (firstRunRef.current) {
      firstRunRef.current = false;
      try {
        localStorage.setItem(lsKey, json);
      } catch {}
      console.log('[usePersistRoomTableSelection] first cache only:', snapshot);
      return;
    }

    // 항상 로컬은 저장
    try {
      localStorage.setItem(lsKey, json);
    } catch {}

    // 필요 시 원격 저장(디바운스)
    const shouldRemote = !!(syncToFirestore || saveToFirestore);
    if (shouldRemote) debouncedSaveRemote(snapshot);
  }, [
    eventId,
    hiddenRooms,
    showScore,
    showHalved,
    syncToFirestore,
    saveToFirestore,
    setHiddenRooms,
    setShowScore,
    setShowHalved
  ]);

  // (선택) 마운트 시 로컬에서 복원 – 원래 코드가 이미 하고 있다면 이 블록은 생략해도 됩니다.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.hiddenRooms) && setHiddenRooms) {
        setHiddenRooms(new Set(parsed.hiddenRooms.map(Number)));
      }
      if (parsed && parsed.visibleMetrics) {
        if (typeof parsed.visibleMetrics.score === 'boolean' && setShowScore) {
          setShowScore(parsed.visibleMetrics.score);
        }
        if (typeof parsed.visibleMetrics.banddang === 'boolean' && setShowHalved) {
          setShowHalved(parsed.visibleMetrics.banddang);
        }
      }
      console.log('[usePersistRoomTableSelection] restored from localStorage:', parsed);
    } catch (e) {
      // noop
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]); // 이벤트 변경 시에만 복원
}
