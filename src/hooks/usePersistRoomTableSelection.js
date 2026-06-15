// src/hooks/usePersistRoomTableSelection.js

// - 저장 표준: hiddenRooms는 1-based(방번호) 배열로 저장/복원
// - 최초 마운트 시 "절대 쓰지 않고" 로컬/원격을 덮어쓰는 문제 수정(restore 이후부터 저장)
// - 디바운스 원격 저장 유지

import { useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

function stableStringify(obj) {
  try { return JSON.stringify(obj, Object.keys(obj || {}).sort()); }
  catch { try { return JSON.stringify(obj); } catch { return String(obj); } }
}

function useDebounced(delay = 300) {
  const timer = useRef(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (fn) => (...args) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  };
}

export default function usePersistRoomTableSelection({
  eventId,
  hiddenRooms,
  setHiddenRooms,
  showScore,
  setShowScore,
  showHalved,
  setShowHalved,
  syncToFirestore = false,
  saveToFirestore = false,
} = {}) {
  const lsKey = eventId ? `pv:${eventId}` : 'pv:__no_event__';
  const hydratedRef = useRef(false);       // 로컬 복원 완료 여부
  const prevJsonRef = useRef('');

  // 원격 저장(디바운스)
  const debouncedSave = useDebounced(300)((payload) => saveRemote(eventId, payload));

  async function saveRemote(eid, payload) {
    if (!eid) return;
    const vm = payload.visibleMetrics || { score: false, banddang: false };
    try {
      const docRef = doc(db, 'events', eid);
      // publicView 전체를 덮어쓰면 STEP8 팀결과표 정렬값(fourballTeamSort)이 사라질 수 있으므로
      // 필요한 하위 필드만 점 표기법으로 갱신합니다.
      await updateDoc(docRef, {
        'publicView.hiddenRooms': payload.hiddenRooms || [], // 1-based
        'publicView.visibleMetrics': vm,
        'publicView.metrics': vm,
      });
    } catch (e) {
      console.warn('[usePersistRoomTableSelection] remote save failed:', e);
    }
  }

  // 🚫 초기 렌더 시 저장 금지. 복원 이후부터 저장 허용.
  useEffect(() => {
    if (!hydratedRef.current) return;

    // 정상화: 내부 hiddenRooms는 Set<number> (0-based/1-based 혼용 가능)
    // 저장 시에는 항상 1-based로 변환
    const rawRooms = Array.isArray(hiddenRooms)
      ? hiddenRooms
      : (hiddenRooms && typeof hiddenRooms.size === 'number'
          ? Array.from(hiddenRooms)
          : []);
    const rooms1 = rawRooms.map((n) => Number(n)).filter(Number.isFinite).map((n) => (n >= 1 ? n : n + 1)).sort((a,b)=>a-b);

    const snapshot = {
      hiddenRooms: rooms1,
      visibleMetrics: { score: !!showScore, banddang: !!showHalved },
    };
    const json = stableStringify(snapshot);
    if (json === prevJsonRef.current) return;
    prevJsonRef.current = json;

    // 항상 로컬 저장
    try { localStorage.setItem(lsKey, json); } catch {}

    // 선택적 원격 저장
    const shouldRemote = !!(syncToFirestore || saveToFirestore);
    if (shouldRemote) debouncedSave(snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, hiddenRooms, showScore, showHalved, syncToFirestore, saveToFirestore]);

  // 🔄 로컬에서 복원(없으면 패스)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.hiddenRooms) && setHiddenRooms) {
          setHiddenRooms(new Set(parsed.hiddenRooms.map(Number).filter(Number.isFinite)));
        }
        const vm = parsed?.visibleMetrics || {};
        if (typeof vm.score === 'boolean' && setShowScore) setShowScore(vm.score);
        if (typeof vm.banddang === 'boolean' && setShowHalved) setShowHalved(vm.banddang);
        prevJsonRef.current = stableStringify(parsed || {});
      }
    } catch {}
    hydratedRef.current = true; // 이제부터 저장 허용
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);
}
