// /src/screens/Step6.jsx

import React, { useState, useRef, useMemo, useContext, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import styles from './Step6.module.css';
import usePersistRoomTableSelection from '../hooks/usePersistRoomTableSelection';
import { StepContext } from '../flows/StepFlow';
import { EventContext } from '../contexts/EventContext';
// [ADD] 라이브 이벤트 문서 구독(컨텍스트가 실시간이 아닐 때 보조)
import { useEventLiveQuery } from '../live/useEventLiveQuery';

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
  const { eventId, eventData, updateEventImmediate } = useContext(EventContext) || {};
  // [ADD] 라이브 이벤트 데이터(있으면 컨텍스트보다 우선)
  const { eventData: liveEvent } = useEventLiveQuery(eventId);
  const effectiveEventData = liveEvent || eventData;

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
  // ★ 하단 고정/여백을 STEP1~5와 동일화 + 스크롤 컨테이너 추가
  // ─────────────────────────────────────────────────────────────
  const [__bottomGap, __setBottomGap] = useState(64);
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
  const __FOOTER_H    = 56;                              // 버튼 바 높이(공통 추정)
  const __safeBottom  = `calc(env(safe-area-inset-bottom, 0px) + ${__bottomGap}px)`;

  // [CHANGE] 페이지 컨테이너: 플렉스 컬럼 + 바닥 여백(버튼/탭바)
  const __pageStyle   = {
    minHeight: '100dvh',
    boxSizing: 'border-box',
    paddingBottom: `calc(${__FOOTER_H}px + ${__safeBottom})`,
    display: 'flex',
    flexDirection: 'column'
  };

  // [NEW] 중간 본문 스크롤 래퍼: iOS에서 전영역 자연 스크롤
  const __scrollAreaStyle = {
    flex: '1 1 auto',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    touchAction: 'pan-y',
    overscrollBehavior: 'contain'
  };

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

  // 메뉴 토글 + 바깥 클릭 닫기
  const toggleMenu = (e) => { e.stopPropagation(); setMenuOpen(o => !o); };
  useEffect(() => {
    const close = () => setMenuOpen(false);
    if (menuOpen) document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
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

  // 참가자 소스: 컨텍스트 비어있으면 **라이브/컨텍스트 이벤트 문서** 폴백
  const sourceParticipants = (participants && participants.length)
    ? participants
    : ((effectiveEventData && Array.isArray(effectiveEventData.participants)) ? effectiveEventData.participants : []);

  // 방별 그룹
  const byRoom = useMemo(() => {
    const arr = Array.from({ length: roomCount }, () => []);
    (sourceParticipants || []).forEach(p => {
      if (p.room != null && p.room >= 1 && p.room <= roomCount) {
        arr[p.room - 1].push(p);
      }
    });
    return arr;
  }, [sourceParticipants, roomCount]);

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
      <div style={__scrollAreaStyle}>
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
        <div className={styles.actionButtons}>
          <button onClick={() => downloadTable(resultRef, 'results', 'jpg')}>JPG로 저장</button>
          <button onClick={() => downloadTable(resultRef, 'results', 'pdf')}>PDF로 저장</button>
        </div>
      </div>
      {/* ──────────────── 스크롤 본문 래퍼 끝 ──────────────── */}

      {/* 하단 버튼 — STEP1~5와 동일 여백(좌/우 16px, 세로 12px), 탭 위로 고정 */}
      <div
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
        <button
          onClick={() => { try { localStorage.setItem('homeViewMode', 'stroke'); } catch {} setStep(0); }}
        >
          홈
        </button>
      </div>
    </div>
  );
}
