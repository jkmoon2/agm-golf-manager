// /src/screens/Step6.jsx

import React, { useState, useRef, useMemo, useContext, useEffect, useLayoutEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import styles from './Step6.module.css';
import usePersistRoomTableSelection from '../hooks/usePersistRoomTableSelection';
import { StepContext } from '../flows/StepFlow';
import { EventContext } from '../contexts/EventContext';
import { useEventLiveQuery } from '../live/useEventLiveQuery';

export default function Step6() {
  const {
    participants = [],
    roomCount,
    roomNames = [],
    goPrev,
    setStep
  } = useContext(StepContext);

  const { eventId, eventData, updateEventImmediate } = useContext(EventContext) || {};
  const { eventData: liveEvent } = useEventLiveQuery(eventId);
  const effectiveEventData = liveEvent || eventData;

  const [hiddenRooms, setHiddenRooms]       = useState(new Set());
  const [visibleMetrics, setVisibleMetrics] = useState({ score: true, banddang: true });
  const [menuOpen, setMenuOpen]             = useState(false);

  const showScore     = !!visibleMetrics.score;
  const setShowScore  = (v) => setVisibleMetrics(m => ({ ...m, score: !!v }));
  const showHalved    = !!visibleMetrics.banddang;
  const setShowHalved = (v) => setVisibleMetrics(m => ({ ...m, banddang: !!v }));

  // ───────────────────────────────────────────
  // 하단/스크롤 영역 공통 처리
  // ───────────────────────────────────────────
  const [__bottomGap, __setBottomGap] = useState(64);
  const footerRef   = useRef(null);
  const scrollRef   = useRef(null);

  // [NEW] 테이블을 터치해도 상위 스크롤러가 움직이도록 하는 드래그 프록시
  const dragAllocRef  = useRef(null);
  const dragResultRef = useRef(null);

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

  const __FOOTER_H    = 56;
  const __safeBottom  = `calc(env(safe-area-inset-bottom, 0px) + ${__bottomGap}px)`;

  const __pageStyle = {
    minHeight: '100dvh',
    boxSizing: 'border-box',
    paddingBottom: `calc(${__FOOTER_H}px + ${__safeBottom})`,
    display: 'flex',
    flexDirection: 'column'
  };

  const __scrollAreaBaseStyle = {
    flex: '1 1 auto',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    touchAction: 'pan-y',
    overscrollBehavior: 'contain'
  };

  const recalcScrollHeight = () => {
    try {
      const viewportH =
        (window.visualViewport && window.visualViewport.height) || window.innerHeight;
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      const topY    = scrollEl.getBoundingClientRect().top;
      const footerH = (footerRef.current && footerRef.current.offsetHeight) || __FOOTER_H;
      const bottomGap = __bottomGap;
      const available = Math.max(120, Math.floor(viewportH - topY - footerH - bottomGap - 6));
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
  }, [__bottomGap]);

  // [NEW] 드래그 프록시: 내부(테이블)에서 터치/휠 → 상위 스크롤러로 전달
  useEffect(() => {
    const scroller = scrollRef.current;
    const attach = (el) => {
      if (!el || !scroller) return;
      let active = false;
      let startY = 0;
      let startTop = 0;

      const onTouchStart = (e) => {
        if (!e.touches || !e.touches[0]) return;
        active   = true;
        startY   = e.touches[0].clientY;
        startTop = scroller.scrollTop;
      };
      const onTouchMove = (e) => {
        if (!active || !e.touches || !e.touches[0]) return;
        const dy = e.touches[0].clientY - startY;
        scroller.scrollTop = startTop - dy;
        // iOS에서 상위로 터치 이동이 먹도록 기본 스크롤 방지
        e.preventDefault();
      };
      const onTouchEnd = () => { active = false; };

      // 마우스/트랙패드 휠도 상위로 전달
      const onWheel = (e) => {
        scroller.scrollTop += e.deltaY;
      };

      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchmove',  onTouchMove,  { passive: false });
      el.addEventListener('touchend',   onTouchEnd,   { passive: true });
      el.addEventListener('wheel',      onWheel,      { passive: true });

      return () => {
        el.removeEventListener('touchstart', onTouchStart);
        el.removeEventListener('touchmove',  onTouchMove);
        el.removeEventListener('touchend',   onTouchEnd);
        el.removeEventListener('wheel',      onWheel);
      };
    };

    const cleanA = attach(dragAllocRef.current);
    const cleanB = attach(dragResultRef.current);
    return () => {
      cleanA && cleanA();
      cleanB && cleanB();
    };
  }, []);

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

  const persistPublicViewNow = async (nextHiddenRoomsSet = hiddenRooms, nextVisible = visibleMetrics) => {
    if (!updateEventImmediate) return;
    try {
      const hiddenArr = Array.from(nextHiddenRoomsSet).map(Number).sort((a, b) => a - b);
      await updateEventImmediate({
        publicView: {
          hiddenRooms: hiddenArr,
          visibleMetrics: { score: !!nextVisible.score, banddang: !!nextVisible.banddang },
          metrics: { score: !!nextVisible.score, banddang: !!nextVisible.banddang }
        }
      });
    } catch (e) {
      console.warn('[Step6] persistPublicViewNow failed:', e);
    }
  };

  useEffect(() => {
    const pv = effectiveEventData?.publicView;
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
  }, [effectiveEventData?.publicView, roomCount]);

  const toggleMenu = (e) => { e.stopPropagation(); setMenuOpen(o => !o); };
  useEffect(() => {
    const close = () => setMenuOpen(false);
    if (menuOpen) document.addEventListener('click', close, true);
    return () => document.removeEventListener('click', close, true);
  }, [menuOpen]);

  const isHiddenIdx = (idx) => hiddenRooms.has(idx + 1);
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

  const allocRef  = useRef();
  const resultRef = useRef();

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

  const headers = Array.from({ length: roomCount }, (_, i) =>
    roomNames[i]?.trim() ? roomNames[i] : `${i + 1}번방`
  );

  const sourceParticipants = (participants && participants.length)
    ? participants
    : ((effectiveEventData && Array.isArray(effectiveEventData.participants)) ? effectiveEventData.participants : []);

  const byRoom = useMemo(() => {
    const arr = Array.from({ length: roomCount }, () => []);
    (sourceParticipants || []).forEach(p => {
      if (p.room != null && p.room >= 1 && p.room <= roomCount) {
        arr[p.room - 1].push(p);
      }
    });
    return arr;
  }, [sourceParticipants, roomCount]);

  const MAX = 4;
  const allocRows = Array.from({ length: MAX }, (_, ri) =>
    byRoom.map(roomArr => roomArr[ri] || { nickname: '', handicap: '' })
  );

  const resultByRoom = useMemo(() => {
    return byRoom.map(roomArr => {
      const filled = Array.from({ length: MAX }, (_, i) =>
        roomArr[i] || { nickname: '', handicap: 0, score: 0 }
      );

      let maxIdx = 0, maxVal = -Infinity;
      filled.forEach((p, i) => {
        const sc = p.score || 0;
        if (sc > maxVal) { maxVal = sc; maxIdx = i; }
      });

      let sumHd = 0, sumSc = 0, sumBd = 0, sumRs = 0;
      const detail = filled.map((p, i) => {
        const hd = p.handicap || 0;
        const sc = p.score    || 0;
        const bd = i === maxIdx ? Math.floor(sc / 2) : sc;
        const used = showHalved ? bd : sc;

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

  const rankMap = useMemo(() => {
    const arr = resultByRoom
      .map((r, i) => ({ idx: i, tot: r.sumResult, hd: r.sumHandicap }))
      .filter(x => !isHiddenIdx(x.idx))
      .sort((a, b) => a.tot - b.tot || a.hd - b.hd);
    return Object.fromEntries(arr.map((x, i) => [x.idx, i + 1]));
  }, [resultByRoom, hiddenRooms]);

  // 드래그 프록시 영역 스타일(시각 변화 없이 이벤트만 받도록)
  const __dragAreaStyle = { touchAction: 'none' };

  return (
    <div className={styles.step} style={__pageStyle}>
      {/* 스크롤 본문 */}
      <div ref={scrollRef} style={__scrollAreaBaseStyle}>
        {/* 선택 메뉴 */}
        <div className={styles.selectWrapper}>
          <button className={styles.selectButton} onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}>선택</button>
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

        {/* 방배정표 — 드래그 프록시 래퍼 */}
        <div ref={dragAllocRef} style={__dragAreaStyle}>
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
                        <th className={styles.header}>닉네임</th>
                        <th className={styles.header}>G핸디</th>
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
                          <td className={styles.cell}>{c.nickname}</td>
                          <td className={styles.cell} style={{ color: 'blue' }}>{c.handicap}</td>
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
                        <td className={styles.footerLabel}>합계</td>
                        <td className={styles.footerValue} style={{ color: 'blue' }}>
                          {roomArr.reduce((sum, p) => sum + (p.handicap || 0), 0)}
                        </td>
                      </React.Fragment>
                    )
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className={styles.actionButtons}>
          <button onClick={() => downloadTable(allocRef, 'allocation', 'jpg')}>JPG로 저장</button>
          <button onClick={() => downloadTable(allocRef, 'allocation', 'pdf')}>PDF로 저장</button>
        </div>

        {/* 최종결과표 — 드래그 프록시 래퍼 */}
        <div ref={dragResultRef} style={__dragAreaStyle}>
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
                        <th className={styles.header}>닉네임</th>
                        <th className={styles.header}>G핸디</th>
                        {showScore   && <th className={styles.header}>점수</th>}
                        {showHalved  && <th className={styles.header}>반땅</th>}
                        <th className={styles.header}>결과</th>
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
                          <td className={styles.cell}>{roomObj.detail[ri].nickname}</td>
                          <td className={styles.cell}>{roomObj.detail[ri].handicap}</td>
                          {showScore  && <td className={styles.cell}>{roomObj.detail[ri].score}</td>}
                          {showHalved && <td className={styles.cell} style={{ color: 'blue' }}>
                            {roomObj.detail[ri].banddang}
                          </td>}
                          <td className={styles.cell} style={{ color: 'red' }}>{roomObj.detail[ri].result}</td>
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
                        <td className={styles.footerLabel}>합계</td>
                        <td className={styles.footerValue}>{roomObj.sumHandicap}</td>
                        {showScore  && <td className={styles.footerValue}>{roomObj.sumScore}</td>}
                        {showHalved && <td className={styles.footerBanddang}>{roomObj.sumBanddang}</td>}
                        <td className={styles.footerResult}>{roomObj.sumResult}</td>
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
                        <td className={styles.footerRank} style={{ background: '#fff8d1' }}>
                          {rankMap[i]}등
                        </td>
                      </React.Fragment>
                    )
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className={styles.actionButtons}>
          <button onClick={() => downloadTable(resultRef, 'results', 'jpg')}>JPG로 저장</button>
          <button onClick={() => downloadTable(resultRef, 'results', 'pdf')}>PDF로 저장</button>
        </div>
      </div>

      {/* 하단 버튼 */}
      <div
        ref={footerRef}
        className={styles.stepFooter}
        style={{
          position: 'fixed',
          left: 0, right: 0,
          bottom: __safeBottom,
          zIndex: 20,
          boxSizing: 'border-box',
          padding: '12px 16px',
          background: '#fff',
          borderTop: '1px solid #e5e5e5'
        }}
      >
        <button onClick={goPrev}>← 이전</button>
        <button onClick={() => { try { localStorage.setItem('homeViewMode', 'stroke'); } catch {} setStep(0); }}>홈</button>
      </div>
    </div>
  );
}
