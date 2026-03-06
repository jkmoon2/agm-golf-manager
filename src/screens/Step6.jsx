// src/screens/Step6.jsx

import React, { useState, useRef, useMemo, useContext, useEffect, useLayoutEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import styles from './Step6.module.css';
import usePersistRoomTableSelection from '../hooks/usePersistRoomTableSelection';
import { StepContext } from '../flows/StepFlow';
import { EventContext } from '../contexts/EventContext';
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
  const persistPublicViewNow = async (nextHiddenRoomsSet = hiddenRooms, nextVisible = visibleMetrics) => {
    if (!updateEventImmediate) return;
    try {
      const hiddenArr = Array.from(nextHiddenRoomsSet).map(Number).sort((a, b) => a - b); // 1-based 저장
      await updateEventImmediate({
        publicView: {
          hiddenRooms: hiddenArr,
          visibleMetrics: { score: !!nextVisible.score, banddang: !!nextVisible.banddang },
          // 구버전 호환 키
          metrics: { score: !!nextVisible.score, banddang: !!nextVisible.banddang }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventData?.publicView, roomCount]);

  // 메뉴 토글 + 바깥 클릭 닫기
  const toggleMenu = (e) => { e.stopPropagation(); setMenuOpen(o => !o); };
  useEffect(() => {
    const close = () => setMenuOpen(false);
    if (menuOpen) document.addEventListener('click', close, true);
    return () => document.removeEventListener('click', close, true);
  }, [menuOpen]);

  // 헬퍼: 내부 인덱스(0-based) → 숨김 여부(1-based Set)
  const isHiddenIdx = (idx) => hiddenRooms.has(idx + 1);

  // 선택 토글들(즉시 저장 포함) — **1-based** 토글
  const toggleRoom = (idx) => {
    const roomNo = idx + 1;
    const s = new Set(hiddenRooms);
    s.has(roomNo) ? s.delete(roomNo) : s.add(roomNo);
    setHiddenRooms(s);
    persistPublicViewNow(s, visibleMetrics);
  };
  const toggleMetric = (key) => {
    const next = { ...visibleMetrics, [key]: !visibleMetrics[key] };
    setVisibleMetrics(next);
    persistPublicViewNow(hiddenRooms, next);
  };

  // 캡처용 refs
  const allocRef  = useRef();
  const resultRef = useRef();

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
      const link = document.createElement('a');
      link.download = `${name}.jpg`;
      link.href     = canvas.toDataURL('image/jpeg');
      link.click();
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
      const rRaw = (p?.roomNumber ?? p?.room);
      if (rRaw == null || rRaw === '') return;
      const r = Number(rRaw);
      if (Number.isFinite(r) && r >= 1 && r <= roomCount) {
        arr[r - 1].push(p);
      }
    });
    return arr;
  }, [participantsWithScore, roomCount]);

  // 방배정표 rows
  const MAX = 4;
  const allocRows = Array.from({ length: MAX }, (_, ri) =>
    byRoom.map(roomArr => roomArr[ri] || { nickname: '', handicap: '' })
  );

  // 최종결과 계산(반땅만 결과에 영향)
  const resultByRoom = useMemo(() => {
    return byRoom.map(roomArr => {
      const filled = Array.from({ length: MAX }, (_, i) =>
        roomArr[i] || { nickname: '', handicap: 0, score: 0 }
      );

      // 반땅 대상(최고 점수)
      let maxIdx = 0, maxVal = -Infinity;
      filled.forEach((p, i) => {
        const sc = p.score || 0;
        if (sc > maxVal) { maxVal = sc; maxIdx = i; }
      });

      let sumHd = 0, sumSc = 0, sumBd = 0, sumRs = 0;
      const detail = filled.map((p, i) => {
        const hd = p.handicap || 0;
        const sc = p.score    || 0;
        const bd = i === maxIdx ? Math.floor(sc / 2) : sc; // 반땅
        const used = showHalved ? bd : sc;                  // 결과 계산은 반땅만 영향

        sumHd += hd;
        sumSc += sc;
        sumBd += bd;
        sumRs += (used - hd);

        return { ...p, score: sc, banddang: bd, result: (used - hd) };
      });

      return {
        detail,
        sumHandicap: sumHd,
        sumScore:    sumSc,
        sumBanddang: sumBd,
        sumResult:   sumRs
      };
    });
  }, [byRoom, showHalved]);

  // 등수(낮을수록 1등), 동점 시 합계핸디 낮은 쪽 우선
  const rankMap = useMemo(() => {
    const arr = resultByRoom
      .map((r, i) => ({ idx: i, tot: r.sumResult, hd: r.sumHandicap }))
      .filter(x => !isHiddenIdx(x.idx))
      .sort((a, b) => a.tot - b.tot || a.hd - b.hd);
    return Object.fromEntries(arr.map((x, i) => [x.idx, i + 1]));
  }, [resultByRoom, hiddenRooms]);

  return (
    <div className={styles.step} style={__pageStyle}>
      {/* ──────────────── 스크롤 본문 래퍼 시작 ──────────────── */}
      <div ref={scrollRef} style={__scrollAreaBaseStyle}>
        {/* 선택 메뉴 */}
        <div className={styles.selectWrapper}>
          <button className={styles.selectButton} onClick={toggleMenu}>선택</button>
          {menuOpen && (
            <div className="dropdownMenu" onClick={e => e.stopPropagation()}>
              {headers.map((h, i) => (
                <label key={i} className="dropdownItem">
                  <input
                    type="checkbox"
                    checked={!isHiddenIdx(i)}
                    onChange={() => { toggleRoom(i); setMenuOpen(false); }}
                  />
                  {h}
                </label>
              ))}
              <hr className="dropdownDivider" />
              <label className="dropdownItem">
                <input
                  type="checkbox"
                  checked={visibleMetrics.score}
                  onChange={() => { toggleMetric('score'); setMenuOpen(false); }}
                />
                점수
              </label>
              <label className="dropdownItem">
                <input
                  type="checkbox"
                  checked={visibleMetrics.banddang}
                  onChange={() => { toggleMetric('banddang'); setMenuOpen(false); }}
                />
                반땅
              </label>
            </div>
          )}
        </div>

        {/* 방배정표 */}
        <div ref={allocRef} className={styles.tableContainer}>
          <h4 className={styles.tableTitle}>🏠 방배정표</h4>
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
          <h4 className={styles.tableTitle}>📊 최종결과표</h4>
          <table className={`${styles.table} ${styles.fixedRows}`}>
            <thead>
              <tr>
                {headers.map((h, i) =>
                  !isHiddenIdx(i) && (
                    <th
                      key={i}
                      colSpan={2 + (showScore ? 1 : 0) + (showHalved ? 1 : 0) + 1}
                      className={styles.header}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
              <tr>
                {headers.map((_, i) =>
                  !isHiddenIdx(i) && (
                    <React.Fragment key={i}>
                      <th className={styles.header} style={__COL.resultNick}>닉네임</th>
                      <th className={styles.header} style={__COL.resultGhandi}>G핸디</th>
                      {showScore   && <th className={styles.header} style={__COL.resultScore}>점수</th>}
                      {showHalved  && <th className={styles.header} style={__COL.resultBanddang}>반땅</th>}
                      <th className={styles.header} style={__COL.resultResult}>결과</th>
                    </React.Fragment>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: MAX }).map((_, ri) => (
                <tr key={ri}>
                  {resultByRoom.map((roomObj, ci) =>
                    !isHiddenIdx(ci) && (
                      <React.Fragment key={ci}>
                        <td className={styles.cell} style={__COL.resultNick}>{roomObj.detail[ri].nickname}</td>
                        <td className={styles.cell} style={__COL.resultGhandi}>{roomObj.detail[ri].handicap}</td>
                        {showScore  && <td className={styles.cell} style={__COL.resultScore}>{roomObj.detail[ri].score}</td>}
                        {showHalved && (
                          <td className={styles.cell} style={{ ...__COL.resultBanddang, color: 'blue' }}>
                            {roomObj.detail[ri].banddang}
                          </td>
                        )}
                        <td className={styles.cell} style={{ ...__COL.resultResult, color: 'red' }}>
                          {roomObj.detail[ri].result}
                        </td>
                      </React.Fragment>
                    )
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                {resultByRoom.map((roomObj, ci) =>
                  !isHiddenIdx(ci) && (
                    <React.Fragment key={ci}>
                      <td className={styles.footerLabel} style={__COL.resultNick}>합계</td>
                      <td className={styles.footerValue} style={__COL.resultGhandi}>{roomObj.sumHandicap}</td>
                      {showScore  && <td className={styles.footerValue} style={__COL.resultScore}>{roomObj.sumScore}</td>}
                      {showHalved && <td className={styles.footerBanddang} style={__COL.resultBanddang}>{roomObj.sumBanddang}</td>}
                      <td className={styles.footerResult} style={__COL.resultResult}>{roomObj.sumResult}</td>
                    </React.Fragment>
                  )
                )}
              </tr>
              <tr>
                {headers.map((_, i) =>
                  !isHiddenIdx(i) && (
                    <React.Fragment key={i}>
                      <td
                        colSpan={2 + (showScore ? 1 : 0) + (showHalved ? 1 : 0)}
                        className={styles.footerBlank}
                      />
                      <td className={styles.footerRank} style={{ ...__COL.resultResult, background: '#fff8d1' }}>
                        {rankMap[i]}등
                      </td>
                    </React.Fragment>
                  )
                )}
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
