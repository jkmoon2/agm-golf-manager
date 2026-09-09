// src/screens/Step6.jsx

import React, { useState, useRef, useMemo, useContext, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import styles from './Step6.module.css';
import usePersistRoomTableSelection from '../hooks/usePersistRoomTableSelection';
import { StepContext } from '../flows/StepFlow';
import { EventContext } from '../contexts/EventContext';
import { getAssignmentRoom } from '../utils/assignmentCompat';
import { getSkillRoomRankExcludedRoomSet } from '../utils/skillRoom';
// [PATCH] EventContext가 이미 events/{eventId} 문서를 onSnapshot으로 구독하므로
//         Step6에서 추가 구독(useEventLiveQuery)은 제거(읽기 횟수/중복 리스너 감소)

// [PATCH] scores 구독은 EventContext에서 단일 수행(중복 리스너/읽기 감소)

export default function Step6() {
  // Step 컨텍스트
  const {
    participants = [],     // [{ id, group, nickname, handicap, score, room }, …]
    roomCount,
    roomNames = [],
    goPrev,
    setStep
  } = useContext(StepContext);

  // 이벤트 컨텍스트
  const { eventId, eventData, updateEventImmediate, scoresMap, overlayScoresToParticipants } = useContext(EventContext) || {};
  // [PATCH] 중복 리스너 제거: eventData는 EventContext onSnapshot으로 실시간 갱신됨
  //         (※ 잘못된 재선언 방지)

  // 표시 옵션 상태
  // ※ hiddenRooms 는 **1-based(방번호)** Set<number>로 유지 (Step8/Player와 동일)
  const [hiddenRooms, setHiddenRooms]       = useState(new Set());
  const [visibleMetrics, setVisibleMetrics] = useState({ score: true, banddang: true });
  const [menuOpen, setMenuOpen]             = useState(false);
  // [PATCH] 선택 메뉴는 tableContainer의 overflow에 잘리지 않도록 body Portal로 표시
  const selectMenuRef = useRef(null);
  const selectMenuBtnRef = useRef(null);
  const [selectMenuPosition, setSelectMenuPosition] = useState({ top: 0, right: 8, maxHeight: 320 });
  // [NEW] 방대방 최종결과 계산에서 제외할 참가자(복수 선택)
  const [resultExcludedIds, setResultExcludedIds] = useState(new Set());
  const [excludeMenuOpen, setExcludeMenuOpen] = useState(false);
  // 최종결과표 정렬: 방(기본) / 오름(1위→N위) / 내림(N위→1위)
  const [resultSortMode, setResultSortMode] = useState('room');
  // ✅ 공유 체크 시에만 Player STEP5에 최종결과표 정렬을 반영(기본: Admin 전용)
  const [resultSortShared, setResultSortShared] = useState(false);
  const [resultSortMenuOpen, setResultSortMenuOpen] = useState(false);
  const resultSortMenuRef = useRef(null);
  const resultSortBtnRef = useRef(null);

  const showScore    = !!visibleMetrics.score;
  const setShowScore = (v) => setVisibleMetrics(m => ({ ...m, score: !!v }));
  const showHalved   = !!visibleMetrics.banddang;
  const setShowHalved = (v) => setVisibleMetrics(m => ({ ...m, banddang: !!v }));

  // ─────────────────────────────────────────────────────────────
  // ✅ [WIDTH TUNING] STEP6 표(방배정표/최종결과표) 컬럼 폭 조정
  // - 아래 숫자(px)만 바꾸면 바로 폭이 바뀝니다. (CSS는 그대로 유지)
  // - 닉네임/G핸디/점수/반땅/결과 컬럼별로 각각 조정 가능
  // ─────────────────────────────────────────────────────────────
  const __COL_W = {
    // [EDIT HERE] 방배정표(닉네임/G핸디)
    alloc: {
      nick: 110,
      ghandi: 50,
    },
    // [EDIT HERE] 최종결과표(닉네임/G핸디/점수/반땅/결과)
    result: {
      nick: 110,
      ghandi: 50,
      score: 50,
      banddang: 50,
      result: 50,
    },
  };
  const __W = (n) => ({ width: `${n}px`, minWidth: `${n}px`, maxWidth: `${n}px` });
  const __COL = {
    allocNick: __W(__COL_W.alloc.nick),
    allocGhandi: __W(__COL_W.alloc.ghandi),
    resultNick: __W(__COL_W.result.nick),
    resultGhandi: __W(__COL_W.result.ghandi),
    resultScore: __W(__COL_W.result.score),
    resultBanddang: __W(__COL_W.result.banddang),
    resultResult: __W(__COL_W.result.result),
  };


  // ─────────────────────────────────────────────────────────────
  // ★ 하단 고정/여백 공통 처리 + 스크롤 컨테이너(실높이 계산) 추가
  // ─────────────────────────────────────────────────────────────
  const [__bottomGap, __setBottomGap] = useState(64);
  const footerRef   = useRef(null);   // [NEW] 하단 버튼 실제 높이 측정
  const scrollRef   = useRef(null);   // [NEW] 스크롤 영역 높이 지정 대상

  useEffect(() => {
    const probe = () => {
      try {
        const el =
          document.querySelector('[data-bottom-nav]') ||
          document.querySelector('#bottomTabBar') ||
          document.querySelector('.bottomTabBar') ||
          document.querySelector('.BottomTabBar');
        __setBottomGap(el && el.offsetHeight ? el.offsetHeight : 64);
      } catch {}
    };
    probe();
    window.addEventListener('resize', probe);
    return () => window.removeEventListener('resize', probe);
  }, []);

  const __FOOTER_H    = 56;                              // 버튼 바 높이(fallback)
  const __safeBottom  = `calc(env(safe-area-inset-bottom, 0px) + ${__bottomGap}px)`;

  // [CHANGE] 페이지 컨테이너: 플렉스 컬럼 + 바닥 여백(버튼/탭바)
  const __pageStyle   = {
    minHeight: '100dvh',
    boxSizing: 'border-box',
    paddingBottom: `calc(${__FOOTER_H}px + ${__safeBottom})`,
    display: 'flex',
    flexDirection: 'column'
  };

  // [NEW] 중간 본문 스크롤 래퍼: iOS 전영역 자연 스크롤 + 실높이(px) 적용
  const __scrollAreaBaseStyle = {
    flex: '1 1 auto',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    touchAction: 'pan-y',
    overscrollBehavior: 'contain'
  };

  // [NEW] 스크롤 영역 실높이 계산(iOS Safari flex-height 버그 회피)
  const recalcScrollHeight = () => {
    try {
      const viewportH =
        (window.visualViewport && window.visualViewport.height) || window.innerHeight;
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;

      // 스크롤영역의 화면상단 위치
      const topY = scrollEl.getBoundingClientRect().top;

      // 하단 버튼 실제 높이(측정 실패 시 fallback)
      const footerH = (footerRef.current && footerRef.current.offsetHeight) || __FOOTER_H;

      // 하단 탭/세이프에어리어 여백(이미 footer bottom에 반영되지만, 실제 뷰포트 차감에도 필요)
      const bottomGap = __bottomGap;

      // 여유 margin 조금(6px) 확보
      const available = Math.max(100, Math.floor(viewportH - topY - footerH - bottomGap - 6));

      scrollEl.style.height = `${available}px`;
    } catch {}
  };

  useLayoutEffect(() => {
    recalcScrollHeight();
    window.addEventListener('resize', recalcScrollHeight);
    window.addEventListener('orientationchange', recalcScrollHeight);
    return () => {
      window.removeEventListener('resize', recalcScrollHeight);
      window.removeEventListener('orientationchange', recalcScrollHeight);
    };
    // __bottomGap이 변해도 재계산
  }, [__bottomGap]);

  // 로컬/원격 동기화(디바운스 저장) — 저장은 1-based로 처리됨
  usePersistRoomTableSelection({
    eventId,
    hiddenRooms,
    setHiddenRooms,
    showScore,
    setShowScore,
    showHalved,
    setShowHalved,
    syncToFirestore: true,
  });

  // 운영자 토글 시 즉시 저장(홈 버튼 없이도 Player 반영)
  // ✅ 정렬은 공유 체크가 켜진 경우에만 publicView에 Player용으로 공개합니다.
  const persistPublicViewNow = async (
    nextHiddenRoomsSet = hiddenRooms,
    nextVisible = visibleMetrics,
    nextResultSort = resultSortMode,
    nextResultShared = resultSortShared
  ) => {
    if (!updateEventImmediate) return;
    try {
      const hiddenArr = Array.from(nextHiddenRoomsSet).map(Number).sort((a, b) => a - b); // 1-based 저장
      const prevPv = eventData?.publicView || {};
      // ✅ Admin 정렬값은 공유 여부와 관계없이 대회 publicView에 저장합니다.
      //    단, Player STEP5는 resultSortShared/finalResultSortShared가 true일 때만 읽습니다.
      const sortPatch = {
        resultSort: nextResultSort,
        finalResultSort: nextResultSort,
        resultSortShared: !!nextResultShared,
        finalResultSortShared: !!nextResultShared,
      };
      await updateEventImmediate({
        publicView: {
          ...prevPv,
          hiddenRooms: hiddenArr,
          visibleMetrics: { score: !!nextVisible.score, banddang: !!nextVisible.banddang },
          // 구버전 호환 키
          metrics: { score: !!nextVisible.score, banddang: !!nextVisible.banddang },
          ...sortPatch,
        }
      });
    } catch (e) {
      console.warn('[Step6] persistPublicViewNow failed:', e);
    }
  };

  // 이벤트 문서의 publicView를 **권위 소스**로 안전 복원(과거 0-based도 자동 보정)
  useEffect(() => {
    const pv = eventData?.publicView;
    if (!pv) return;

    const nums = (pv.hiddenRooms || []).map(Number).filter(Number.isFinite);
    const looksZeroBased = nums.some(v => v === 0);
    const toOneBased = looksZeroBased ? nums.map(v => v + 1) : nums;
    const nextHidden = new Set(
      toOneBased.filter(n => n >= 1 && n <= roomCount)
    );
    const sameRooms  = hiddenRooms.size === nextHidden.size && [...nextHidden].every(n => hiddenRooms.has(n));
    if (!sameRooms) setHiddenRooms(nextHidden);

    const vmRaw = pv.visibleMetrics || pv.metrics || {};
    const nextVM = {
      score:    typeof vmRaw.score    === 'boolean' ? vmRaw.score    : true,
      banddang: typeof vmRaw.banddang === 'boolean' ? vmRaw.banddang : true,
    };
    if (nextVM.score !== visibleMetrics.score || nextVM.banddang !== visibleMetrics.banddang) {
      setVisibleMetrics(nextVM);
    }

    const savedResultShared = pv.resultSortShared === true || pv.finalResultSortShared === true;
    if (resultSortShared !== savedResultShared) setResultSortShared(savedResultShared);
    const savedResultSort = pv.resultSort || pv.finalResultSort;
    // ✅ Admin 정렬값은 대회 기준으로 항상 복원합니다.
    //    공유 체크는 Player STEP5 반영 여부만 결정합니다.
    if (['room', 'asc', 'desc'].includes(savedResultSort)) {
      setResultSortMode(savedResultSort);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventData?.publicView, roomCount]);

  // 방제외 선택은 최종결과표 계산 전용이며 방배정표에는 영향을 주지 않습니다.
  useEffect(() => {
    const arr = Array.isArray(eventData?.resultExcludedParticipantIds)
      ? eventData.resultExcludedParticipantIds
      : [];
    setResultExcludedIds(new Set(arr.map(v => String(v))));
  }, [eventData?.resultExcludedParticipantIds]);

  // 메뉴 토글 + 바깥 클릭 닫기
  // tableContainer는 가로 스크롤(overflow-x:auto)을 사용하므로 내부 absolute 메뉴는
  // z-index와 무관하게 컨테이너 경계에서 잘립니다. 메뉴만 body Portal로 띄워 클리핑을 피합니다.
  const updateSelectMenuPosition = useCallback(() => {
    try {
      const btn = selectMenuBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const viewportH = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 640;
      const top = Math.max(4, Math.round(rect.bottom + 4));
      const right = Math.max(8, Math.round((window.innerWidth || document.documentElement.clientWidth || 360) - rect.right));
      const maxHeight = Math.max(160, Math.floor(viewportH - top - 8));
      setSelectMenuPosition({ top, right, maxHeight });
    } catch {}
  }, []);

  const toggleMenu = (e) => {
    e.stopPropagation();
    if (!menuOpen) updateSelectMenuPosition();
    setMenuOpen(o => !o);
  };

  useLayoutEffect(() => {
    if (!menuOpen) return;
    updateSelectMenuPosition();
    const update = () => updateSelectMenuPosition();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [menuOpen, updateSelectMenuPosition]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (selectMenuRef.current && selectMenuRef.current.contains(e.target)) return;
      if (selectMenuBtnRef.current && selectMenuBtnRef.current.contains(e.target)) return;
      setMenuOpen(false);
      setExcludeMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [menuOpen]);

  useEffect(() => {
    if (!resultSortMenuOpen) return;
    const onDoc = (e) => {
      if (resultSortMenuRef.current && resultSortMenuRef.current.contains(e.target)) return;
      if (resultSortBtnRef.current && resultSortBtnRef.current.contains(e.target)) return;
      setResultSortMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [resultSortMenuOpen]);

  // 헬퍼: 내부 인덱스(0-based) → 숨김 여부(1-based Set)
  const isHiddenIdx = (idx) => hiddenRooms.has(idx + 1);

  // 선택 토글들(즉시 저장 포함) — **1-based** 토글
  const toggleRoom = (idx) => {
    const roomNo = idx + 1;
    const s = new Set(hiddenRooms);
    s.has(roomNo) ? s.delete(roomNo) : s.add(roomNo);
    setHiddenRooms(s);
    persistPublicViewNow(s, visibleMetrics, resultSortMode, resultSortShared);
  };
  const toggleMetric = (key) => {
    const next = { ...visibleMetrics, [key]: !visibleMetrics[key] };
    setVisibleMetrics(next);
    persistPublicViewNow(hiddenRooms, next, resultSortMode, resultSortShared);
  };

  const persistResultExcludedNow = async (nextSet) => {
    if (!updateEventImmediate) return;
    try {
      await updateEventImmediate({
        resultExcludedParticipantIds: Array.from(nextSet).map(String).sort()
      });
    } catch (e) {
      console.warn('[Step6] persistResultExcludedNow failed:', e);
    }
  };

  const toggleResultExcluded = (id) => {
    const key = String(id);
    const next = new Set(resultExcludedIds);
    next.has(key) ? next.delete(key) : next.add(key);
    setResultExcludedIds(next);
    persistResultExcludedNow(next);
  };

  const onResultSortSelect = (nextMode) => {
    setResultSortMode(nextMode);
    setResultSortMenuOpen(false);
    // ✅ 공유 체크가 꺼져 있어도 Admin용 정렬값은 대회 기준으로 저장합니다.
    //    Player 반영 여부는 resultSortShared 값으로만 제어합니다.
    persistPublicViewNow(hiddenRooms, visibleMetrics, nextMode, resultSortShared);
  };

  const onResultSortShareToggle = () => {
    const nextShared = !resultSortShared;
    setResultSortShared(nextShared);
    persistPublicViewNow(hiddenRooms, visibleMetrics, resultSortMode, nextShared);
  };

  // 캡처용 refs
  const allocRef  = useRef();
  const resultRef = useRef();

  // JPG 저장은 data URL 대신 Blob URL을 사용합니다.
  // iOS Safari/PWA에서 긴 data URL + DOM에 붙지 않은 a.click() 조합이
  // 무시되는 경우가 있어, 실제 <a>를 문서에 붙인 뒤 클릭하고 URL을 해제합니다.
  const downloadCanvasAsJpeg = (canvas, filename, quality = 0.92) => new Promise((resolve, reject) => {
    if (!canvas) { resolve(false); return; }

    const clickDataUrlFallback = () => {
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/jpeg', quality);
      link.download = filename;
      link.rel = 'noopener';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      window.setTimeout(() => {
        try { document.body.removeChild(link); } catch {}
        resolve(true);
      }, 0);
    };

    if (typeof canvas.toBlob !== 'function') {
      try { clickDataUrlFallback(); } catch (e) { reject(e); }
      return;
    }

    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          try { clickDataUrlFallback(); } catch (e) { reject(e); }
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        window.setTimeout(() => {
          try { document.body.removeChild(link); } catch {}
          try { URL.revokeObjectURL(url); } catch {}
          resolve(true);
        }, 1500);
      }, 'image/jpeg', quality);
    } catch (e) {
      reject(e);
    }
  });


  // 다운로드 헬퍼 (JPG / PDF)
  const downloadTable = async (ref, name, type) => {
    const elem = ref.current;
    if (!elem) return;

    const origOverflow = elem.style.overflow;
    const origWidth    = elem.style.width;

    elem.style.overflow = 'visible';
    elem.style.width    = `${elem.scrollWidth}px`;
    elem.scrollLeft = 0;
    elem.scrollTop  = 0;

    const canvas = await html2canvas(elem, {
      scrollX: 0, scrollY: 0,
      width: elem.scrollWidth, height: elem.scrollHeight,
      windowWidth: elem.scrollWidth, windowHeight: elem.scrollHeight,
    });

    elem.style.overflow = origOverflow;
    elem.style.width    = origWidth;

    if (type === 'jpg') {
      try {
        await downloadCanvasAsJpeg(canvas, `${name}.jpg`);
      } catch (e) {
        console.warn('[Step6] JPG save failed:', e);
        alert('JPG 저장에 실패했습니다. 다시 시도해 주세요.');
      }
    } else {
      const img = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      pdf.addImage(img, 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h);
      pdf.save(`${name}.pdf`);
    }
  };

  // 방 이름
  const headers = Array.from({ length: roomCount }, (_, i) =>
    roomNames[i]?.trim() ? roomNames[i] : `${i + 1}번방`
  );

  // 참가자 소스: StepContext 비어있으면 eventData.participants 폴백
  const sourceParticipants = (participants && participants.length)
    ? participants
    : ((eventData && Array.isArray(eventData.participants)) ? eventData.participants : []);

  // [PATCH] 점수 오버레이: EventContext의 scoresMap/overlay를 사용(중복 구독 제거)
  const participantsWithScore = useMemo(() => {
    if (typeof overlayScoresToParticipants === 'function') {
      return overlayScoresToParticipants(sourceParticipants || []);
    }
    const map = scoresMap || {};
    return (sourceParticipants || []).map((p) => {
      const key = String(p.id);
      const s = map[key];
      return (s === undefined) ? p : { ...p, score: s };
    });
  }, [sourceParticipants, scoresMap, overlayScoresToParticipants]);

  // 방별 그룹
  const byRoom = useMemo(() => {
    const arr = Array.from({ length: roomCount }, () => []);
    (participantsWithScore || []).forEach(p => {
      const rRaw = getAssignmentRoom(p);
      if (rRaw == null || rRaw === '') return;
      const r = Number(rRaw);
      if (Number.isFinite(r) && r >= 1 && r <= roomCount) {
        arr[r - 1].push(p);
      }
    });
    return arr;
  }, [participantsWithScore, roomCount]);

  const resultExcludeCandidates = useMemo(() => {
    return (participantsWithScore || [])
      .filter(p => p && p.id != null && String(p.nickname || '').trim())
      .map(p => ({ ...p, __roomNo: Number(getAssignmentRoom(p)) || 0 }))
      .sort((a, b) => (a.__roomNo - b.__roomNo) || String(a.nickname || '').localeCompare(String(b.nickname || ''), 'ko'));
  }, [participantsWithScore]);

  // 방배정표 rows
  const MAX = 4;
  const allocRows = Array.from({ length: MAX }, (_, ri) =>
    byRoom.map(roomArr => roomArr[ri] || { nickname: '', handicap: '' })
  );

  // 최종결과 계산(반땅만 결과에 영향)
  // [NEW] 방제외 참가자는 표에는 남기되 합계/순위/반땅 대상 계산에서 제외합니다.
  const resultByRoom = useMemo(() => {
    return byRoom.map(roomArr => {
      const filled = Array.from({ length: MAX }, (_, i) =>
        roomArr[i] || { nickname: '', handicap: 0, score: 0 }
      );

      let maxIdx = -1, maxVal = -Infinity;
      filled.forEach((p, i) => {
        const isReal = p && p.id != null && String(p.nickname || '').trim();
        const excluded = isReal && resultExcludedIds.has(String(p.id));
        if (!isReal || excluded) return;
        const sc = Number(p.score || 0);
        if (sc > maxVal) { maxVal = sc; maxIdx = i; }
      });

      let sumHd = 0, sumSc = 0, sumBd = 0, sumRs = 0, includedCount = 0;
      const detail = filled.map((p, i) => {
        const isReal = p && p.id != null && String(p.nickname || '').trim();
        const excluded = !!(isReal && resultExcludedIds.has(String(p.id)));
        const hd = Number(p.handicap || 0);
        const sc = Number(p.score || 0);
        const bd = i === maxIdx ? Math.floor(sc / 2) : sc;
        const used = showHalved ? bd : sc;
        const rs = used - hd;

        if (isReal && !excluded) {
          includedCount += 1;
          sumHd += hd;
          sumSc += sc;
          sumBd += bd;
          sumRs += rs;
        }

        return { ...p, score: sc, banddang: bd, result: rs, excluded };
      });

      return { detail, sumHandicap: sumHd, sumScore: sumSc, sumBanddang: sumBd, sumResult: sumRs, includedCount };
    });
  }, [byRoom, showHalved, resultExcludedIds]);

  const skillRoomRankExcludedRooms = useMemo(
    () => getSkillRoomRankExcludedRoomSet(
      eventData?.skillRoomConfig,
      { roomCount, participants: sourceParticipants }
    ),
    [eventData?.skillRoomConfig, roomCount, sourceParticipants]
  );

  // 등수(낮을수록 1등), 동점 시 합계핸디 낮은 쪽 우선
  const rankMap = useMemo(() => {
    const arr = resultByRoom
      .map((r, i) => ({ idx: i, tot: r.sumResult, hd: r.sumHandicap }))
      .filter(x => !isHiddenIdx(x.idx) && !skillRoomRankExcludedRooms.has(x.idx + 1) && resultByRoom[x.idx]?.includedCount > 0)
      .sort((a, b) => a.tot - b.tot || a.hd - b.hd);
    return Object.fromEntries(arr.map((x, i) => [x.idx, i + 1]));
  }, [resultByRoom, hiddenRooms, skillRoomRankExcludedRooms]);

  const resultRoomOrder = useMemo(() => {
    const list = Array.from({ length: roomCount }, (_, i) => i).filter(i => !isHiddenIdx(i));
    if (resultSortMode === 'asc') {
      return [...list].sort((a, b) => (rankMap[a] || 9999) - (rankMap[b] || 9999) || a - b);
    }
    if (resultSortMode === 'desc') {
      return [...list].sort((a, b) => (rankMap[b] || 9999) - (rankMap[a] || 9999) || b - a);
    }
    return list;
  }, [roomCount, hiddenRooms, rankMap, resultSortMode]);

  return (
    <div className={styles.step} style={__pageStyle}>
      {/* ──────────────── 스크롤 본문 래퍼 시작 ──────────────── */}
      <div ref={scrollRef} style={__scrollAreaBaseStyle}>
        {/* 방배정표 */}
        <div ref={allocRef} className={`${styles.tableContainer} ${styles.allocContainer}`}>
          <div className={styles.tableToolbar}>
            <h4 className={styles.tableTitle}>🏠 방배정표</h4>
            <div className={styles.selectWrapper}>
              <button ref={selectMenuBtnRef} className={styles.selectButton} onClick={toggleMenu}>선택</button>
              {menuOpen && typeof document !== 'undefined' && createPortal(
                <div
                  ref={selectMenuRef}
                  className={styles.selectMenu}
                  style={{
                    position: 'fixed',
                    top: `${selectMenuPosition.top}px`,
                    right: `${selectMenuPosition.right}px`,
                    maxHeight: `${selectMenuPosition.maxHeight}px`,
                    zIndex: 2147483000
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {headers.map((h, i) => (
                    <label key={i} className={styles.selectMenuItem}>
                      <input type="checkbox" checked={!isHiddenIdx(i)} onChange={() => { toggleRoom(i); setMenuOpen(false); }} />
                      {h}
                    </label>
                  ))}
                  <hr className={styles.selectMenuDivider} />
                  <label className={styles.selectMenuItem}>
                    <input type="checkbox" checked={visibleMetrics.score} onChange={() => { toggleMetric('score'); setMenuOpen(false); }} />
                    점수
                  </label>
                  <label className={styles.selectMenuItem}>
                    <input type="checkbox" checked={visibleMetrics.banddang} onChange={() => { toggleMetric('banddang'); setMenuOpen(false); }} />
                    반땅
                  </label>
                  <hr className={styles.selectMenuDivider} />
                  <button type="button" className={styles.excludeMenuButton} onClick={() => setExcludeMenuOpen(v => !v)}>
                    <span>방제외</span><span>{excludeMenuOpen ? '▲' : '▼'}</span>
                  </button>
                  {excludeMenuOpen && (
                    <div className={styles.excludeParticipantList}>
                      {resultExcludeCandidates.map((p) => (
                        <label key={`exclude-${p.id}`} className={styles.selectMenuItem}>
                          <input type="checkbox" checked={resultExcludedIds.has(String(p.id))} onChange={() => toggleResultExcluded(p.id)} />
                          <span>{p.__roomNo ? (headers[p.__roomNo - 1] || `${p.__roomNo}번방`) : '미배정'} · {p.nickname}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>,
                document.body
              )}
            </div>
          </div>
          <table className={`${styles.table} ${styles.fixedRows}`}>
            <thead>
              <tr>
                {headers.map((h, i) =>
                  !isHiddenIdx(i) && (
                    <th key={i} colSpan={2} className={styles.header}>{h}</th>
                  )
                )}
              </tr>
              <tr>
                {headers.map((_, i) =>
                  !isHiddenIdx(i) && (
                    <React.Fragment key={i}>
                      <th className={styles.header} style={__COL.allocNick}>닉네임</th>
                      <th className={styles.header} style={__COL.allocGhandi}>G핸디</th>
                    </React.Fragment>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {allocRows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((c, ci) =>
                    !isHiddenIdx(ci) && (
                      <React.Fragment key={ci}>
                        <td className={styles.cell} style={__COL.allocNick}>{c.nickname}</td>
                        <td className={styles.cell} style={{ ...__COL.allocGhandi, color: 'blue' }}>{c.handicap}</td>
                      </React.Fragment>
                    )
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                {byRoom.map((roomArr, ci) =>
                  !isHiddenIdx(ci) && (
                    <React.Fragment key={ci}>
                      <td className={styles.footerLabel} style={__COL.allocNick}>합계</td>
                      <td className={styles.footerValue} style={{ ...__COL.allocGhandi, color: 'blue' }}>
                        {roomArr.reduce((sum, p) => sum + (p.handicap || 0), 0)}
                      </td>
                    </React.Fragment>
                  )
                )}
              </tr>
            </tfoot>
          </table>
        </div>
        <div className={styles.actionButtons}>
          <button onClick={() => downloadTable(allocRef, 'allocation', 'jpg')}>JPG로 저장</button>
          <button onClick={() => downloadTable(allocRef, 'allocation', 'pdf')}>PDF로 저장</button>
        </div>

        {/* 최종결과표 */}
        <div ref={resultRef} className={`${styles.tableContainer} ${styles.resultContainer}`}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: 0,
              position: 'sticky',
              left: 0,
              top: 0,
              zIndex: 6,
              background: '#fff',
              padding: '6px 8px',
              borderBottom: '1px solid #bbb',
              boxSizing: 'border-box',
              width: '100%',
              minWidth: '100%',
            }}
          >
            <h4
              className={styles.tableTitle}
              style={{
                margin: 0,
                padding: 0,
                borderBottom: 'none',
                position: 'static',
                width: 'auto',
                minWidth: 0,
                flex: '1 1 auto',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >📊 최종결과표</h4>
            <div style={{ position: 'relative', flex: '0 0 auto' }}>
              <button
                ref={resultSortBtnRef}
                type="button"
                className={styles.selectButton}
                onClick={() => setResultSortMenuOpen(o => !o)}
                style={{ minWidth: 64, width: 64, padding: '7px 8px', fontSize: 13 }}
              >
                정렬
              </button>
              {resultSortMenuOpen && (
                <div
                  ref={resultSortMenuRef}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    right: 0,
                    width: 64,
                    minWidth: 64,
                    zIndex: 30,
                    background: '#fff',
                    border: '1px solid #d6deec',
                    borderRadius: 8,
                    boxShadow: '0 8px 18px rgba(15, 35, 75, 0.15)',
                    overflow: 'hidden'
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      width: '100%',
                      padding: '8px 4px',
                      borderBottom: '1px solid #edf1f7',
                      color: '#0b275a',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={resultSortShared}
                      onChange={onResultSortShareToggle}
                      style={{ margin: 0, width: 13, height: 13 }}
                    />
                    공유
                  </label>
                  {[
                    ['room', '방'],
                    ['asc', '오름'],
                    ['desc', '내림'],
                  ].map(([value, label]) => (
                    <button
                      key={`result-sort-${value}`}
                      type="button"
                      onClick={() => onResultSortSelect(value)}
                      style={{ display: 'block', width: '100%', border: 0, background: resultSortMode === value ? '#eef4ff' : '#fff', color: '#0b275a', textAlign: 'center', padding: '8px 4px', fontSize: 13, fontWeight: resultSortMode === value ? 800 : 600 }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <table className={`${styles.table} ${styles.fixedRows}`}>
            <thead>
              <tr>
                {resultRoomOrder.map((i) => {
                  const h = headers[i];
                  return (
                    <th
                      key={i}
                      colSpan={2 + (showScore ? 1 : 0) + (showHalved ? 1 : 0) + 1}
                      className={styles.header}
                    >
                      {h}
                    </th>
                  );
                })}
              </tr>
              <tr>
                {resultRoomOrder.map((i) => (
                  <React.Fragment key={i}>
                    <th className={styles.header} style={__COL.resultNick}>닉네임</th>
                    <th className={styles.header} style={__COL.resultGhandi}>G핸디</th>
                    {showScore   && <th className={styles.header} style={__COL.resultScore}>점수</th>}
                    {showHalved  && <th className={styles.header} style={__COL.resultBanddang}>반땅</th>}
                    <th className={styles.header} style={__COL.resultResult}>결과</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: MAX }).map((_, ri) => (
                <tr key={ri}>
                  {resultRoomOrder.map((ci) => {
                    const roomObj = resultByRoom[ci];
                    return (
                      <React.Fragment key={ci}>
                        <td className={styles.cell} style={__COL.resultNick}>{roomObj.detail[ri].excluded ? `${roomObj.detail[ri].nickname} (제외)` : roomObj.detail[ri].nickname}</td>
                        <td className={styles.cell} style={__COL.resultGhandi}>{roomObj.detail[ri].handicap}</td>
                        {showScore  && <td className={styles.cell} style={__COL.resultScore}>{roomObj.detail[ri].score}</td>}
                        {showHalved && (
                          <td className={styles.cell} style={{ ...__COL.resultBanddang, color: 'blue' }}>
                            {roomObj.detail[ri].banddang}
                          </td>
                        )}
                        <td className={styles.cell} style={{ ...__COL.resultResult, color: 'red' }}>
                          {roomObj.detail[ri].excluded ? '제외' : roomObj.detail[ri].result}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                {resultRoomOrder.map((ci) => {
                  const roomObj = resultByRoom[ci];
                  return (
                    <React.Fragment key={ci}>
                      <td className={styles.footerLabel} style={__COL.resultNick}>합계</td>
                      <td className={styles.footerValue} style={__COL.resultGhandi}>{roomObj.sumHandicap}</td>
                      {showScore  && <td className={styles.footerValue} style={__COL.resultScore}>{roomObj.sumScore}</td>}
                      {showHalved && <td className={styles.footerBanddang} style={__COL.resultBanddang}>{roomObj.sumBanddang}</td>}
                      <td className={styles.footerResult} style={__COL.resultResult}>{roomObj.sumResult}</td>
                    </React.Fragment>
                  );
                })}
              </tr>
              <tr>
                {resultRoomOrder.map((i) => (
                  <React.Fragment key={i}>
                    <td
                      colSpan={2 + (showScore ? 1 : 0) + (showHalved ? 1 : 0)}
                      className={styles.footerBlank}
                    />
                    <td className={styles.footerRank} style={{ ...__COL.resultResult, background: '#fff8d1', color: 'blue' }}>
                      {rankMap[i] ? `${rankMap[i]}등` : '-'}
                    </td>
                  </React.Fragment>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <div className={styles.actionButtons}>
          <button onClick={() => downloadTable(resultRef, 'results', 'jpg')}>JPG로 저장</button>
          <button onClick={() => downloadTable(resultRef, 'results', 'pdf')}>PDF로 저장</button>
        </div>
      </div>
      {/* ──────────────── 스크롤 본문 래퍼 끝 ──────────────── */}

      {/* 하단 버튼 — STEP1~5와 동일 여백(좌/우 16px, 세로 12px), 탭 위로 고정 */}
      <div
        ref={footerRef}
        className={styles.stepFooter}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: __safeBottom,
          zIndex: 20,
          boxSizing: 'border-box',
          padding: '12px 16px',
          background: '#fff',
          borderTop: '1px solid #e5e5e5'
        }}
      >
        <button onClick={goPrev}>← 이전</button>
        <button
          onClick={() => {
            try {
              localStorage.setItem('homeViewMode', 'stroke');
            } catch {}
            setStep(0);
          }}
        >
          홈
        </button>
      </div>
    </div>
  );
}
