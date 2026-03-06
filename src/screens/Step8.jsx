// /src/screens/Step8.jsx

import React, { useState, useRef, useMemo, useContext, useEffect } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import styles from './Step8.module.css';
import usePersistRoomTableSelection from '../hooks/usePersistRoomTableSelection';
import { EventContext } from '../contexts/EventContext';
import { StepContext } from '../flows/StepFlow';
// [PATCH] EventContext가 이미 events/{eventId} 문서를 onSnapshot으로 구독하므로
//         Step8에서 추가 구독(useEventLiveQuery)은 제거(읽기 횟수/중복 리스너 감소)

// [PATCH] scores 구독은 EventContext에서 단일 수행(중복 리스너/읽기 감소)

export default function Step8() {
  const {
    participants,
    roomCount,
    roomNames,
    goPrev,
    goNext,
    setStep
  } = useContext(StepContext);

  const { eventId, eventData, updateEventImmediate, scoresMap, overlayScoresToParticipants } = useContext(EventContext) || {};
  // [PATCH] eventData는 EventContext에서 실시간으로 갱신됨

  const MAX_PER_ROOM = 4; // 한 방에 최대 4명

  // ───────────────────────────────────────────────────────────
  // [NEW] 하단 고정 버튼을 위한 안전영역/여백 계산 (STEP5/7과 동일 패턴)
  // ───────────────────────────────────────────────────────────
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
  const __FOOTER_H   = 56; // 하단 버튼 영역 높이(대략)
  const __safeBottom = `calc(env(safe-area-inset-bottom, 0px) + ${__bottomGap}px)`;
  const __pageStyle  = {
    minHeight: '100dvh',
    boxSizing: 'border-box',
    paddingBottom: `calc(${__FOOTER_H}px + ${__safeBottom})`, // 컨텐츠가 버튼 뒤로 숨지 않게
  };
  // ───────────────────────────────────────────────────────────

  // ── 1) UI 상태 ───────────────────────────────────────────
  // ※ hiddenRooms를 **1-based(방번호)** 세트로 유지합니다.
  const [hiddenRooms, setHiddenRooms]       = useState(new Set());
  const [selectMenuOpen, setSelectMenuOpen] = useState(false);
  const [visibleMetrics, setVisibleMetrics] = useState({
    score: true,
    banddang: true
  });
  const showScore    = visibleMetrics.score;
  const setShowScore = (v) => setVisibleMetrics((m) => ({ ...m, score: v }));
  const showHalved   = visibleMetrics.banddang;
  const setShowHalved = (v) => setVisibleMetrics((m) => ({ ...m, banddang: v }));

  // ─────────────────────────────────────────────────────────────
  // ✅ [WIDTH TUNING] STEP8 표(방배정표/최종결과표/팀결과표) 컬럼 폭 조정
  // - 아래 숫자(px)만 바꾸면 바로 폭이 바뀝니다. (CSS는 그대로 유지)
  // - 닉네임/G핸디/점수/반땅/결과 + 팀결과표(방/총점/순위)까지 컬럼별로 각각 조정 가능
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
    // [EDIT HERE] 팀결과표(방/닉네임/G핸디/점수/결과/총점/순위)
    team: {
      room: 58,
      nick: 110,
      ghandi: 50,
      score: 50,
      result: 50,
      total: 52,
      rank: 55,
    },
  };
  const __W = (n) => ({ width: `${n}px`, minWidth: `${n}px`, maxWidth: `${n}px` });
  const __COL = {
    // allocation
    allocNick: __W(__COL_W.alloc.nick),
    allocGhandi: __W(__COL_W.alloc.ghandi),
    // result
    resultNick: __W(__COL_W.result.nick),
    resultGhandi: __W(__COL_W.result.ghandi),
    resultScore: __W(__COL_W.result.score),
    resultBanddang: __W(__COL_W.result.banddang),
    resultResult: __W(__COL_W.result.result),
    // team
    teamRoom: __W(__COL_W.team.room),
    teamNick: __W(__COL_W.team.nick),
    teamGhandi: __W(__COL_W.team.ghandi),
    teamScore: __W(__COL_W.team.score),
    teamResult: __W(__COL_W.team.result),
    teamTotal: __W(__COL_W.team.total),
    teamRank: __W(__COL_W.team.rank),
  };


  // 외부 클릭으로 드롭다운 닫기
  const menuRef = useRef(null);
  const menuBtnRef = useRef(null);
  useEffect(() => {
    if (!selectMenuOpen) return;
    const onDoc = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      if (menuBtnRef.current && menuBtnRef.current.contains(e.target)) return;
      setSelectMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [selectMenuOpen]);

  // 공통 헬퍼(인덱스 → 1-based Set 판정)
  const isHiddenIdx = (i) => hiddenRooms.has(i + 1);

  // Firestore/로컬 동기화 훅(저장은 1-based로 처리됨)
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

  // 🔒 Admin 값 고정: Firestore publicView를 **권위 소스**로 복원(과거 0-based도 자동 보정)
  useEffect(() => {
    const pv = eventData?.publicView;
    if (!pv) return;
    const nums = (pv.hiddenRooms || []).map(Number).filter(Number.isFinite);
    const looksZeroBased = nums.some(v => v === 0);
    const toOneBased = looksZeroBased ? nums.map(v => v + 1) : nums;
    const nextHidden = new Set(
      toOneBased.filter(n => n >= 1 && n <= roomCount)
    );
    setHiddenRooms(nextHidden);

    const vm = pv.visibleMetrics || pv.metrics || {};
    setVisibleMetrics({
      score: typeof vm.score === 'boolean' ? vm.score : true,
      banddang: typeof vm.banddang === 'boolean' ? vm.banddang : true
    });
  }, [eventData?.publicView, roomCount]);

  // 운영자 즉시 저장(홈으로 나가지 않아도 Player 반영)
  const persistPublicViewNow = async (nextHiddenRoomsSet = hiddenRooms, nextVisible = visibleMetrics) => {
    if (!updateEventImmediate) return;
    try {
      const hiddenArr = Array.from(nextHiddenRoomsSet).map(Number).sort((a,b)=>a-b); // 1-based
      await updateEventImmediate({
        publicView: {
          hiddenRooms: hiddenArr,
          visibleMetrics: { score: !!nextVisible.score, banddang: !!nextVisible.banddang },
          metrics: { score: !!nextVisible.score, banddang: !!nextVisible.banddang }
        }
      });
    } catch (e) {
      console.warn('[Step8] persistPublicViewNow failed:', e);
    }
  };

  const toggleRoom = idx => {
    const s = new Set(hiddenRooms);
    const roomNo = idx + 1; // 1-based
    s.has(roomNo) ? s.delete(roomNo) : s.add(roomNo);
    setHiddenRooms(s);
    // 즉시 반영
    persistPublicViewNow(s, visibleMetrics);
    setSelectMenuOpen(false);
  };
  const toggleMetric = key => {
    const next = { ...visibleMetrics, [key]: !visibleMetrics[key] };
    setVisibleMetrics(next);
    // 즉시 반영
    persistPublicViewNow(hiddenRooms, next);
    setSelectMenuOpen(false);
  };

  // ── 2) 캡처용 refs ───────────────────────────────────────
  const allocRef       = useRef();
  const resultRef      = useRef();
  const teamCaptureRef = useRef(); // 오프스크린 캡처용

  // ── 3) 테이블 다운로드 헬퍼 (JPG / PDF 단일 페이지) ─────────────────────
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
      scrollX:      0,
      scrollY:      0,
      width:        elem.scrollWidth,
      height:       elem.scrollHeight,
      windowWidth:  elem.scrollWidth,
      windowHeight: elem.scrollHeight
    });

    elem.style.overflow = origOverflow;
    elem.style.width    = origWidth;

    if (type === 'jpg') {
      const link = document.createElement('a');
      link.download = `${name}.jpg`;
      link.href     = canvas.toDataURL('image/jpeg');
      link.click();
    } else {
      const imgData    = canvas.toDataURL('image/png');
      const pdf        = new jsPDF({ orientation: 'landscape' });
      const pageWidth  = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const canvasW    = canvas.width;
      const canvasH    = canvas.height;
      const ratioW     = pageWidth  / canvasW;
      const ratioH     = pageHeight / canvasH;
      const scale      = Math.min(ratioW, ratioH);
      const imgWidth   = canvasW * scale;
      const imgHeight  = canvasH * scale;
      const xOffset    = (pageWidth  - imgWidth ) / 2;
      const yOffset    = (pageHeight - imgHeight) / 2;
      pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidth, imgHeight);
      pdf.save(`${name}.pdf`);
    }
  };

  // ── 4) “방 이름” 배열 (없으면 “N번방”) ────────────────────
  const headers = Array.from({ length: roomCount }, (_, i) =>
    roomNames[i]?.trim() ? roomNames[i] : `${i + 1}번방`
  );

  // ── 5) participants를 방별로 묶은 2차원 배열 ─────────────────────
  const sourceParticipants = (participants && participants.length)
    ? participants
    : ((eventData?.participants && eventData.participants.length) ? eventData.participants : []);

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

  // ── 6) 1조/2조 짝 → slot[0,1], slot[2,3] 고정 ─────────────
  const orderedByRoom = useMemo(() => {
    return byRoom.map((roomArr) => {
      // 네 칸 slot 초기화
      const slot = [null, null, null, null];
      const used = new Set();

      // ① “방에 속한 1조와 그 파트너(2조)”를 순서대로 pairs 배열에 저장
      const pairs = [];
      roomArr
        .filter(p => Number(p?.group) === 1)
        .forEach(p1 => {
          if (used.has(p1.id)) return;
          const partner = roomArr.find(x => String(x.id) === String(p1.partner));
          if (partner && !used.has(partner.id)) {
            pairs.push([p1, partner]);
            used.add(p1.id);
            used.add(partner.id);
          }
        });

      // ② “pairs[0] → slot[0],slot[1], pairs[1] → slot[2],slot[3]”
      pairs.forEach((pair, idx) => {
        if (idx === 0) {
          slot[0] = pair[0];
          slot[1] = pair[1];
        } else if (idx === 1) {
          slot[2] = pair[0];
          slot[3] = pair[1];
        }
      });

      // ③ 남은 사람들(used가 아닌)은 빈칸에 순서대로 채우기
      roomArr.forEach(p => {
        if (!used.has(p.id)) {
          const emptyIdx = slot.findIndex(x => x === null);
          if (emptyIdx >= 0) {
            slot[emptyIdx] = p;
            used.add(p.id);
          }
        }
      });

      // 렌더링 편의를 위해 null 제거
      return slot.map(p => (p ? p : { nickname: '', handicap: 0, score: 0 }));
    });
  }, [byRoom]);

  // ── 7) 방배정표 Rows 생성 ─────────────────────────────────
  const allocRows = Array.from({ length: MAX_PER_ROOM }, (_, ri) =>
    orderedByRoom.map(room => room[ri])
  );

  // ── 8) 최종결과 계산 (반땅 로직 포함) ───────────────────────
  const resultByRoom = useMemo(() => {
    return orderedByRoom.map(roomArr => {
      let maxIdx = 0, maxVal = -Infinity;
      roomArr.forEach((p, i) => {
        const sc = p.score || 0;
        if (sc > maxVal) {
          maxVal = sc;
          maxIdx = i;
        }
      });

      let sumHd = 0, sumSc = 0, sumBd = 0, sumRs = 0;
      const detail = roomArr.map((p, i) => {
        const hd = p.handicap || 0;
        const sc = p.score    || 0;
        const bd = i === maxIdx ? Math.floor(sc / 2) : sc;
        const used = visibleMetrics.banddang ? bd : sc;
        const rs = used - hd;
        sumHd += hd;
        sumSc += sc;
        sumBd += bd;
        sumRs += rs;
        return { ...p, score: sc, banddang: bd, result: rs };
      });
      return { detail, sumHandicap: sumHd, sumScore: sumSc, sumBanddang: sumBd, sumResult: sumRs };
    });
  }, [orderedByRoom, visibleMetrics]);

  // ── 9) 방별 최종결과 순위 계산 ─────────────────────────────
  const rankMap = useMemo(() => {
    const arr = resultByRoom
      .map((r, i) => ({ idx: i, tot: r.sumResult, hd: r.sumHandicap }))
      .filter(x => !isHiddenIdx(x.idx)) // ← 1-based 세트로 판정
      .sort((a, b) => {
        if (a.tot !== b.tot) return a.tot - b.tot;
        return a.hd - b.hd;
      });
    return Object.fromEntries(arr.map((x, i) => [x.idx, i + 1]));
  }, [resultByRoom, hiddenRooms]);

  // ── 10) 팀결과표용: 방별 2인씩 팀A/팀B ─────────────────────
  const teamsByRoom = useMemo(() => {
    const list = [];
    orderedByRoom.forEach((roomArr, roomIdx) => {
      const [p0, p1, p2, p3] = roomArr;
      // 팀 A
      const rA0 = (p0?.score || 0) - (p0?.handicap || 0);
      const rA1 = (p1?.score || 0) - (p1?.handicap || 0);
      const sumResA = rA0 + rA1;
      const sumHdA  = (p0?.handicap || 0) + (p1?.handicap || 0);
      list.push({
        roomIdx,
        teamIdx: 0,
        members: [p0, p1],
        sumResult:   sumResA,
        sumHandicap: sumHdA,
        roomName:    headers[roomIdx],
        originalIndex: list.length
      });
      // 팀 B
      const rB0 = (p2?.score || 0) - (p2?.handicap || 0);
      const rB1 = (p3?.score || 0) - (p3?.handicap || 0);
      const sumResB = rB0 + rB1;
      const sumHdB  = (p2?.handicap || 0) + (p3?.handicap || 0);
      list.push({
        roomIdx,
        teamIdx: 1,
        members: [p2, p3],
        sumResult:   sumResB,
        sumHandicap: sumHdB,
        roomName:    headers[roomIdx],
        originalIndex: list.length
      });
    });
    return list;
  }, [orderedByRoom, headers]);

  // ── 11) 모든 팀 중 “낮은 합산점수=1등” 순위 계산 ─────────────────
  const teamRankMap = useMemo(() => {
    const mapWithIdx   = teamsByRoom.map((t, idx) => ({ ...t, idxInOriginal: idx }));
    const visibleTeams = mapWithIdx.filter(t => !isHiddenIdx(t.roomIdx));

    visibleTeams.sort((a, b) => {
      if (a.sumResult !== b.sumResult) return a.sumResult - b.sumResult;
      return a.sumHandicap - b.sumHandicap;
    });

    const rankMapObj = {};
    visibleTeams.forEach((t, i) => {
      const duplicates = visibleTeams
        .map((x, j) =>
          x.roomIdx === t.roomIdx &&
          x.sumResult === t.sumResult &&
          x.sumHandicap === t.sumHandicap
            ? j
            : -1
        )
        .filter(j => j >= 0);
      duplicates.forEach(j => {
        rankMapObj[ visibleTeams[j].idxInOriginal ] = i + 1;
      });
    });

    return rankMapObj;
  }, [teamsByRoom, hiddenRooms]);

  return (
    <div className={styles.step} style={__pageStyle}>
      {/* ─── “선택” 버튼 + 드롭다운 ─── */}
      <div className={styles.selectWrapper}>
        <button
          ref={menuBtnRef}
          className={styles.selectButton}
          onClick={() => setSelectMenuOpen(o => !o)}
        >
          선택
        </button>
        {selectMenuOpen && (
          <div ref={menuRef} className={styles.dropdownMenu}>
            {headers.map((h, i) => (
              <label key={`toggle-room-${i}`}>
                <input
                  type="checkbox"
                  checked={!isHiddenIdx(i)}
                  onChange={() => toggleRoom(i)}
                />
                {h}
              </label>
            ))}
            <hr />
            <label key="toggle-score">
              <input
                type="checkbox"
                checked={visibleMetrics.score}
                onChange={() => toggleMetric('score')}
              /> 점수
            </label>
            <label key="toggle-banddang">
              <input
                type="checkbox"
                checked={visibleMetrics.banddang}
                onChange={() => toggleMetric('banddang')}
              /> 반땅
            </label>
          </div>
        )}
      </div>

      {/* ─── 중간 컨텐츠(스크롤) ─── */}
      <div
        className={styles.contentWrapper}
        style={{
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          overscrollBehavior: 'contain'
        }}
      >

        {/* ── [Allocation Table] 방배정표 ── */}
        <div ref={allocRef} className={styles.tableContainer}>
          <h4 className={styles.tableTitle}>🏠 방배정표</h4>
          <table className={styles.table}>
            <thead>
              <tr>
                {headers.map((h, i) =>
                  !isHiddenIdx(i) && (
                    <th key={`header-room-${i}`} colSpan={2} className={styles.header}>
                      {h}
                    </th>
                  )
                )}
              </tr>
              <tr>
                {headers.map((_, i) =>
                  !isHiddenIdx(i) && (
                    <React.Fragment key={`subhdr-room-${i}`}>
                      <th className={styles.header} style={__COL.allocNick}>닉네임</th>
                      <th className={styles.header} style={__COL.allocGhandi}>G핸디</th>
                    </React.Fragment>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {allocRows.map((row, ri) => (
                <tr key={`slot-${ri}`}>
                  {row.map((c, ci) =>
                    !isHiddenIdx(ci) && (
                      <React.Fragment key={`room-${ci}-slot-${ri}`}>
                        <td className={styles.cell} style={__COL.allocNick}>{c.nickname}</td>
                        <td className={styles.cell} style={{ ...__COL.allocGhandi, color: 'blue' }}>
                          {c.handicap}
                        </td>
                      </React.Fragment>
                    )
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                {byRoom.map((room, ci) =>
                  !isHiddenIdx(ci) && (
                    <React.Fragment key={`footer-room-${ci}`}>
                      <td
                        className={styles.footerLabel}
                        style={{ ...__COL.allocNick, background: '#f7f7f7' }}
                      >
                        합계
                      </td>
                      <td
                        className={styles.footerValue}
                        style={{ ...__COL.allocGhandi, color: 'blue', background: '#f7f7f7' }}
                      >
                        {room.reduce((s, p) => s + (p.handicap || 0), 0)}
                      </td>
                    </React.Fragment>
                  )
                )}
              </tr>
            </tfoot>
          </table>
        </div>
        <div className={styles.actionButtons}>
          <button onClick={() => downloadTable(allocRef, 'allocation', 'jpg')}>
            JPG로 저장
          </button>
          <button onClick={() => downloadTable(allocRef, 'allocation', 'pdf')}>
            PDF로 저장
          </button>
        </div>

        {/* ── [Result Table] 최종결과표 ── */}
        <div
          ref={resultRef}
          className={`${styles.tableContainer} ${styles.resultContainer}`}
        >
          <h4 className={styles.tableTitle}>📊 최종결과표</h4>
          <table className={styles.table}>
            <thead>
              <tr>
                {headers.map((h, i) =>
                  !isHiddenIdx(i) && (
                    <th
                      key={`res-header-room-${i}`}
                      colSpan={
                        2
                        + (visibleMetrics.score    ? 1 : 0)
                        + (visibleMetrics.banddang ? 1 : 0)
                        + 1
                      }
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
                    <React.Fragment key={`res-subhdr-room-${i}`}>
                      <th className={styles.header} style={__COL.resultNick}>닉네임</th>
                      <th className={styles.header} style={__COL.resultGhandi}>G핸디</th>
                      {visibleMetrics.score    && <th className={styles.header} style={__COL.resultScore}>점수</th>}
                      {visibleMetrics.banddang && <th className={styles.header} style={__COL.resultBanddang}>반땅</th>}
                      <th className={styles.header} style={__COL.resultResult}>결과</th>
                    </React.Fragment>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: MAX_PER_ROOM }).map((_, ri) => (
                <tr key={`res-slot-${ri}`}>
                  {resultByRoom.map((room, ci) =>
                    !isHiddenIdx(ci) && (
                      <React.Fragment key={`res-room-${ci}-slot-${ri}`}>
                        <td className={styles.cell} style={__COL.resultNick}>{room.detail[ri].nickname}</td>
                        <td className={styles.cell} style={__COL.resultGhandi}>{room.detail[ri].handicap}</td>
                        {visibleMetrics.score    && (
                          <td className={styles.cell} style={__COL.resultScore}>{room.detail[ri].score}</td>
                        )}
                        {visibleMetrics.banddang && (
                          <td className={styles.cell} style={{ ...__COL.resultBanddang, color: 'blue' }}>
                            {room.detail[ri].banddang}
                          </td>
                        )}
                        <td className={styles.cell} style={{ ...__COL.resultResult, color: 'red' }}>
                          {room.detail[ri].result}
                        </td>
                      </React.Fragment>
                    )
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                {resultByRoom.map((room, ci) =>
                  !isHiddenIdx(ci) && (
                    <React.Fragment key={`res-footer-room-${ci}`}>
                      <td
                        className={styles.footerLabel}
                        style={{ ...__COL.resultNick, background: '#f7f7f7' }}
                      >
                        합계
                      </td>
                      <td
                        className={styles.footerValue}
                        style={{ ...__COL.resultGhandi, color: 'black', background: '#f7f7f7' }}
                      >
                        {room.sumHandicap}
                      </td>
                      {visibleMetrics.score    && (
                        <td
                          className={styles.footerValue}
                          style={{ ...__COL.resultScore, color: 'black', background: '#f7f7f7' }}
                        >
                          {room.sumScore}
                        </td>
                      )}
                      {visibleMetrics.banddang && (
                        <td
                          className={styles.footerBanddang}
                          style={{ ...__COL.resultBanddang, background: '#f7f7f7' }}
                        >
                          {room.sumBanddang}
                        </td>
                      )}
                      <td
                        className={styles.footerResult}
                        style={{ ...__COL.resultResult, background: '#f7f7f7' }}
                      >
                        {room.sumResult}
                      </td>
                    </React.Fragment>
                  )
                )}
              </tr>
              <tr>
                {headers.map((_, i) =>
                  !isHiddenIdx(i) && (
                    <React.Fragment key={`res-rank-room-${i}`}>
                      <td
                        colSpan={
                          2
                          + (visibleMetrics.score    ? 1 : 0)
                          + (visibleMetrics.banddang ? 1 : 0)
                        }
                        className={styles.footerBlank}
                        style={{ background: '#f7f7f7' }}
                      />
                      <td className={styles.footerRankFinal}>
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
          <button onClick={() => downloadTable(resultRef, 'results', 'jpg')}>
            JPG로 저장
          </button>
          <button onClick={() => downloadTable(resultRef, 'results', 'pdf')}>
            PDF로 저장
          </button>
        </div>

        {/* ── [Team Result Table - 화면용] ── */}
        <div className={styles.teamContainer}>
          <h4 className={styles.tableTitle}>📋 팀결과표</h4>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.header} style={__COL.teamRoom}>방</th>
                  <th className={styles.header} style={__COL.teamNick}>닉네임</th>
                  <th className={styles.header} style={__COL.teamGhandi}>G핸디</th>
                  <th className={styles.header} style={__COL.teamScore}>점수</th>
                  <th className={styles.header} style={__COL.teamResult}>결과</th>
                  <th className={styles.header} style={__COL.teamTotal}>총점</th>
                  <th className={styles.header} style={__COL.teamRank}>순위</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: roomCount }).map((_, roomIdx) => {
                  if (isHiddenIdx(roomIdx)) return null;

                  const idxA = teamsByRoom.findIndex(
                    t => t.roomIdx === roomIdx && t.teamIdx === 0
                  );
                  const idxB = teamsByRoom.findIndex(
                    t => t.roomIdx === roomIdx && t.teamIdx === 1
                  );
                  const teamA = teamsByRoom[idxA];
                  const teamB = teamsByRoom[idxB];
                  const rankA = teamRankMap[idxA] || '-';
                  const rankB = teamRankMap[idxB] || '-';

                  return (
                    <React.Fragment key={`team-room-${roomIdx}`}>
                      {/* ① “방” 셀을 rowSpan=4 로 병합 */}
                      <tr key={`team-room-${roomIdx}-A0`}>
                        <td rowSpan={4} className={styles.cell} style={__COL.teamRoom}>
                          {teamA.roomName}
                        </td>
                        <td className={styles.cell} style={__COL.teamNick}>{teamA.members[0]?.nickname}</td>
                        <td className={styles.cell} style={__COL.teamGhandi}>{teamA.members[0]?.handicap}</td>
                        <td className={styles.cell} style={{ ...__COL.teamScore, color: 'blue' }}>
                          {teamA.members[0]?.score}
                        </td>
                        <td className={styles.cell} style={{ ...__COL.teamResult, color: 'red' }}>
                          {(teamA.members[0]?.score || 0) - (teamA.members[0]?.handicap || 0)}
                        </td>
                        <td rowSpan={2} className={styles.footerResult} style={__COL.teamTotal}>
                          {teamA.sumResult}
                        </td>
                        <td rowSpan={2} className={styles.footerRank} style={__COL.teamRank}>
                          {rankA}등
                        </td>
                      </tr>
                      <tr key={`team-room-${roomIdx}-A1`}>
                        <td className={styles.cell} style={__COL.teamNick}>{teamA.members[1]?.nickname}</td>
                        <td className={styles.cell} style={__COL.teamGhandi}>{teamA.members[1]?.handicap}</td>
                        <td className={styles.cell} style={{ ...__COL.teamScore, color: 'blue' }}>
                          {teamA.members[1]?.score}
                        </td>
                        <td className={styles.cell} style={{ ...__COL.teamResult, color: 'red' }}>
                          {(teamA.members[1]?.score || 0) - (teamA.members[1]?.handicap || 0)}
                        </td>
                      </tr>
                      <tr key={`team-room-${roomIdx}-B0`}>
                        <td className={styles.cell} style={__COL.teamNick}>{teamB.members[0]?.nickname}</td>
                        <td className={styles.cell} style={__COL.teamGhandi}>{teamB.members[0]?.handicap}</td>
                        <td className={styles.cell} style={{ ...__COL.teamScore, color: 'blue' }}>
                          {teamB.members[0]?.score}
                        </td>
                        <td className={styles.cell} style={{ ...__COL.teamResult, color: 'red' }}>
                          {(teamB.members[0]?.score || 0) - (teamB.members[0]?.handicap || 0)}
                        </td>
                        <td rowSpan={2} className={styles.footerResult} style={__COL.teamTotal}>
                          {teamB.sumResult}
                        </td>
                        <td rowSpan={2} className={styles.footerRank} style={__COL.teamRank}>
                          {rankB}등
                        </td>
                      </tr>
                      <tr key={`team-room-${roomIdx}-B1`}>
                        <td className={styles.cell} style={__COL.teamNick}>{teamB.members[1]?.nickname}</td>
                        <td className={styles.cell} style={__COL.teamGhandi}>{teamB.members[1]?.handicap}</td>
                        <td className={styles.cell} style={{ ...__COL.teamScore, color: 'blue' }}>
                          {teamB.members[1]?.score}
                        </td>
                        <td className={styles.cell} style={{ ...__COL.teamResult, color: 'red' }}>
                          {(teamB.members[1]?.score || 0) - (teamB.members[1]?.handicap || 0)}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── [Team Result Table - 캡처용(off‐screen)] ── */}
        <div
          ref={teamCaptureRef}
          style={{
            position: 'absolute',
            top: '-9999px',
            left: '-9999px',
            background: '#fff',
            border: '1px solid #ddd'
          }}
        >
          {/* (1) 제목 */}
          <h4
            style={{
              background: '#fff',
              padding: '6px 8px',
              fontSize: '16px',
              textAlign: 'left',
              margin: 0,
              borderBottom: '1px solid #bbb'
            }}
          >
            📋 팀결과표
          </h4>

          {/* (2) 표 전체(숨겨진 열 포함) */}
          <table
            style={{
              borderCollapse: 'collapse',
              width: 'auto',
              minWidth: 'max-content'
            }}
          >
            <thead>
              <tr>
                <th style={{ ...captureHeaderStyle, ...__COL.teamRoom }}>방</th>
                <th style={{ ...captureHeaderStyle, ...__COL.teamNick }}>닉네임</th>
                <th style={{ ...captureHeaderStyle, ...__COL.teamGhandi }}>G핸디</th>
                <th style={{ ...captureHeaderStyle, ...__COL.teamScore }}>점수</th>
                <th style={{ ...captureHeaderStyle, ...__COL.teamResult }}>결과</th>
                <th style={{ ...captureHeaderStyle, ...__COL.teamTotal }}>총점</th>
                <th style={{ ...captureHeaderStyle, ...__COL.teamRank }}>순위</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: roomCount }).map((_, roomIdx) => {
                if (isHiddenIdx(roomIdx)) return null;

                const idxA = teamsByRoom.findIndex(
                  t => t.roomIdx === roomIdx && t.teamIdx === 0
                );
                const idxB = teamsByRoom.findIndex(
                  t => t.roomIdx === roomIdx && t.teamIdx === 1
                );
                const teamA = teamsByRoom[idxA];
                const teamB = teamsByRoom[idxB];
                const rankA = teamRankMap[idxA] || '-';
                const rankB = teamRankMap[idxB] || '-';

                return (
                  <React.Fragment key={`offscreen-team-room-${roomIdx}`}>
                    <tr key={`offscreen-team-room-${roomIdx}-A0`}>
                      <td
                        rowSpan={4}
                        style={{ ...captureCellStyle, ...__COL.teamRoom }}
                      >
                        {teamA.roomName}
                      </td>
                      <td style={{ ...captureCellStyle, ...__COL.teamNick }}>{teamA.members[0]?.nickname}</td>
                      <td style={{ ...captureCellStyle, ...__COL.teamGhandi }}>{teamA.members[0]?.handicap}</td>
                      <td style={{ ...captureCellStyle, ...__COL.teamScore, color: 'blue' }}>
                        {teamA.members[0]?.score}
                      </td>
                      <td style={{ ...captureCellStyle, ...__COL.teamResult, color: 'red' }}>
                        {(teamA.members[0]?.score || 0) - (teamA.members[0]?.handicap || 0)}
                      </td>
                      <td rowSpan={2} style={{ ...captureFooterResultStyle, ...__COL.teamTotal }}>
                        {teamA.sumResult}
                      </td>
                      <td rowSpan={2} style={{ ...captureFooterRankStyle, ...__COL.teamRank }}>
                        {rankA}등
                      </td>
                    </tr>
                    <tr key={`offscreen-team-room-${roomIdx}-A1`}>
                      <td style={{ ...captureCellStyle, ...__COL.teamNick }}>{teamA.members[1]?.nickname}</td>
                      <td style={{ ...captureCellStyle, ...__COL.teamGhandi }}>{teamA.members[1]?.handicap}</td>
                      <td style={{ ...captureCellStyle, ...__COL.teamScore, color: 'blue' }}>
                        {teamA.members[1]?.score}
                      </td>
                      <td style={{ ...captureCellStyle, ...__COL.teamResult, color: 'red' }}>
                        {(teamA.members[1]?.score || 0) - (teamA.members[1]?.handicap || 0)}
                      </td>
                    </tr>
                    <tr key={`offscreen-team-room-${roomIdx}-B0`}>
                      <td style={{ ...captureCellStyle, ...__COL.teamNick }}>{teamB.members[0]?.nickname}</td>
                      <td style={{ ...captureCellStyle, ...__COL.teamGhandi }}>{teamB.members[0]?.handicap}</td>
                      <td style={{ ...captureCellStyle, ...__COL.teamScore, color: 'blue' }}>
                        {teamB.members[0]?.score}
                      </td>
                      <td style={{ ...captureCellStyle, ...__COL.teamResult, color: 'red' }}>
                        {(teamB.members[0]?.score || 0) - (teamB.members[0]?.handicap || 0)}
                      </td>
                      <td rowSpan={2} style={{ ...captureFooterResultStyle, ...__COL.teamTotal }}>
                        {teamB.sumResult}
                      </td>
                      <td rowSpan={2} style={{ ...captureFooterRankStyle, ...__COL.teamRank }}>
                        {rankB}등
                      </td>
                    </tr>
                    <tr key={`offscreen-team-room-${roomIdx}-B1`}>
                      <td style={{ ...captureCellStyle, ...__COL.teamNick }}>{teamB.members[1]?.nickname}</td>
                      <td style={{ ...captureCellStyle, ...__COL.teamGhandi }}>{teamB.members[1]?.handicap}</td>
                      <td style={{ ...captureCellStyle, ...__COL.teamScore, color: 'blue' }}>
                        {teamB.members[1]?.score}
                      </td>
                      <td style={{ ...captureCellStyle, ...__COL.teamResult, color: 'red' }}>
                        {(teamB.members[1]?.score || 0) - (teamB.members[1]?.handicap || 0)}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 팀결과표 다운로드 버튼 (off‐screen 복제본을 캡처) */}
        <div className={styles.actionButtons}>
          <button onClick={() => downloadTable(teamCaptureRef, 'team-results', 'jpg')}>
            JPG로 저장
          </button>
          <button onClick={() => downloadTable(teamCaptureRef, 'team-results', 'pdf')}>
            PDF로 저장
          </button>
        </div>
      </div>

      {/* ─── 하단 버튼 (고정 + 좌/우/하단 여백) ─── */}
      <div
        className={styles.stepFooter}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: __safeBottom,          // 아이폰 홈바/탭바 위로 안전하게
          zIndex: 20,
          boxSizing: 'border-box',
          padding: '12px 16px',          // 좌/우 여백 STEP1~7과 동일
          background: '#fff',
          borderTop: '1px solid #e5e5e5'
        }}
      >
        <button onClick={goPrev}>← 이전</button>
        <button onClick={() => { try{localStorage.setItem('homeViewMode','fourball')}catch{}; setStep(0); }}>홈</button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// off-screen 캡처용 인라인 스타일
// ──────────────────────────────────────────────────────────────────
const captureHeaderStyle = {
  border: '1px solid #ddd',
  background: '#f7f7f7',
  padding: '4px 8px',
  fontWeight: 600,
  textAlign: 'center',
  whiteSpace: 'nowrap'
};

const captureCellStyle = {
  border: '1px solid #ddd',
  padding: '4px 8px',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};

const captureFooterResultStyle = {
  border: '1px solid #ddd',
  padding: '4px 8px',
  textAlign: 'center',
  fontWeight: 'bold',
  color: '#cc0000',
  background: '#f7f7f7'
};

const captureFooterRankStyle = {
  border: '1px solid #ddd',
  padding: '4px 8px',
  textAlign: 'center',
  fontWeight: 'bold',
  color: 'blue',
  backgroundColor: 'rgba(255, 255, 0, 0.1)'
};
