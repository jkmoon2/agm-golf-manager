// src/screens/Step8.jsx

import React, { useState, useRef, useMemo, useContext } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import styles from './Step8.module.css';
import { StepContext } from '../flows/StepFlow';
<<<<<<< Updated upstream

export default function Step8() {
const {
  participants,
  roomCount,
  roomNames,
  goPrev,
  goNext
} = useContext(StepContext);

  const MAX_PER_ROOM = 4; // 한 방에 최대 4명

=======
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

>>>>>>> Stashed changes
  // ── 1) UI 상태 ───────────────────────────────────────────
  const [hiddenRooms, setHiddenRooms]       = useState(new Set());
  const [selectMenuOpen, setSelectMenuOpen] = useState(false);
  const [visibleMetrics, setVisibleMetrics] = useState({
    score: true,
    banddang: true
  });

  const toggleRoom = idx => {
    const s = new Set(hiddenRooms);
    s.has(idx) ? s.delete(idx) : s.add(idx);
    setHiddenRooms(s);
  };
  const toggleMetric = key =>
    setVisibleMetrics(vm => ({ ...vm, [key]: !vm[key] }));

  // ── 2) 캡처용 refs ───────────────────────────────────────
  const allocRef       = useRef();
  const resultRef      = useRef();
  const teamCaptureRef = useRef(); // 오프스크린 캡처용

  // ── 3) 테이블 다운로드 헬퍼 (JPG / PDF 단일 페이지) ─────────────────────
  const downloadTable = async (ref, name, type) => {
    const elem = ref.current;
    if (!elem) return;

    // (1) 원본 overflow, width 백업
    const origOverflow = elem.style.overflow;
    const origWidth    = elem.style.width;

    // (2) 숨겨진 영역까지 보이도록 강제
    elem.style.overflow = 'visible';
    elem.style.width    = `${elem.scrollWidth}px`;
    elem.scrollLeft = 0;
    elem.scrollTop  = 0;

    // (3) html2canvas로 전체 영역 캡처
    const canvas = await html2canvas(elem, {
      scrollX:      0,
      scrollY:      0,
      width:        elem.scrollWidth,
      height:       elem.scrollHeight,
      windowWidth:  elem.scrollWidth,
      windowHeight: elem.scrollHeight
    });

    // (4) 스타일 복원
    elem.style.overflow = origOverflow;
    elem.style.width    = origWidth;

    if (type === 'jpg') {
      const link = document.createElement('a');
      link.download = `${name}.jpg`;
      link.href     = canvas.toDataURL('image/jpeg');
      link.click();
    } else {
      // PDF 저장: 한 페이지에 모두 들어가도록 축소
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
<<<<<<< Updated upstream
=======
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

>>>>>>> Stashed changes
  const byRoom = useMemo(() => {
    const arr = Array.from({ length: roomCount }, () => []);
    (participants || []).forEach(p => {
      if (p.room != null && p.room >= 1 && p.room <= roomCount) {
        arr[p.room - 1].push(p);
      }
    });
    return arr;
  }, [participants, roomCount]);

  // ── 6) “1조=slot[0,2], 2조=slot[1,3]” 규칙 → 4칸 확보 ─────────────
  //      + 콘솔 로그로 순서 확인 가능
  const orderedByRoom = useMemo(() => {
    const half = participants.length / 2;
    return byRoom.map((roomArr, roomIdx) => {
      console.group(`📂 orderedByRoom: roomIdx = ${roomIdx}`);
      console.log("roomArr =", JSON.stringify(roomArr, null, 2));

      // 네 칸 slot 초기화
      const slot = [null, null, null, null];
      const used = new Set();

      // ① “방에 속한 1조(p.id < half)와 짝(p.partner) → pairs 배열에 저장”
      const pairs = [];
      roomArr.filter(p => p.id < half).forEach(p1 => {
        if (used.has(p1.id)) return;
        const partner = roomArr.find(x => x.id === p1.partner);
        if (partner && !used.has(partner.id)) {
          pairs.push([p1, partner]);
          used.add(p1.id);
          used.add(partner.id);
        }
      });
      console.log("→ pairs =", pairs.map(pair => pair.map(x => x.nickname)));

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
      console.log("→ after placing pairs:", slot.map(p => (p ? p.nickname : null)));

      // ③ “나머지(used에 없는) 한 사람씩 빈 slot[]에 순서대로 채우기”
      roomArr.forEach(p => {
        if (!used.has(p.id)) {
          const emptyIdx = slot.findIndex(x => x === null);
          if (emptyIdx >= 0) {
            slot[emptyIdx] = p;
            used.add(p.id);
          }
        }
      });
      console.log("→ final slot array:", slot.map(p => (p ? p.nickname : null)));
      console.groupEnd();

      // slot 내에 null 없이 객체만 들어가게(렌더링 편의)
      return slot.map(p => (p ? p : { nickname: '', handicap: 0, score: 0 }));
    });
  }, [byRoom, participants]);

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
      .filter(x => !hiddenRooms.has(x.idx))
      .sort((a, b) => {
        if (a.tot !== b.tot) return a.tot - b.tot;
        return a.hd - b.hd;
      });
    return Object.fromEntries(arr.map((x, i) => [x.idx, i + 1]));
  }, [resultByRoom, hiddenRooms]);

  // ── 10) 팀결과표용: 방별 2인씩 팀A/팀B 로 묶어서 합산 ───────────
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
    const visibleTeams = mapWithIdx.filter(t => !hiddenRooms.has(t.roomIdx));

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
    <div className={styles.step}>

      {/* ─── “선택” 버튼 + 드롭다운 ─── */}
      <div className={styles.selectWrapper}>
        <button
          className={styles.selectButton}
          onClick={() => setSelectMenuOpen(o => !o)}
        >
          선택
        </button>
        {selectMenuOpen && (
          <div className={styles.dropdownMenu}>
            {headers.map((h, i) => (
              <label key={`toggle-room-${i}`}>
                <input
                  type="checkbox"
                  checked={!hiddenRooms.has(i)}
                  onChange={() => {
                    toggleRoom(i);
                    setSelectMenuOpen(false);
                  }}
                />
                {h}
              </label>
            ))}
            <hr />
            <label key="toggle-score">
              <input
                type="checkbox"
                checked={visibleMetrics.score}
                onChange={() => {
                  toggleMetric('score');
                  setSelectMenuOpen(false);
                }}
              /> 점수
            </label>
            <label key="toggle-banddang">
              <input
                type="checkbox"
                checked={visibleMetrics.banddang}
                onChange={() => {
                  toggleMetric('banddang');
                  setSelectMenuOpen(false);
                }}
              /> 반땅
            </label>
          </div>
        )}
      </div>

      {/* ─── 중간 컨텐츠(스크롤) ─── */}
      <div className={styles.contentWrapper}>

        {/* ── [Allocation Table] 방배정표 ── */}
        <div ref={allocRef} className={styles.tableContainer}>
          <h4 className={styles.tableTitle}>🏠 방배정표</h4>
          <table className={styles.table}>
            <thead>
              <tr>
                {headers.map((h, i) =>
                  !hiddenRooms.has(i) && (
                    <th key={`header-room-${i}`} colSpan={2} className={styles.header}>
                      {h}
                    </th>
                  )
                )}
              </tr>
              <tr>
                {headers.map((_, i) =>
                  !hiddenRooms.has(i) && (
                    <React.Fragment key={`subhdr-room-${i}`}>
                      <th className={styles.header}>닉네임</th>
                      <th className={styles.header}>G핸디</th>
                    </React.Fragment>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {allocRows.map((row, ri) => (
                <tr key={`slot-${ri}`}>
                  {row.map((c, ci) =>
                    !hiddenRooms.has(ci) && (
                      <React.Fragment key={`room-${ci}-slot-${ri}`}>
                        <td className={styles.cell}>{c.nickname}</td>
                        <td className={styles.cell} style={{ color: 'blue' }}>
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
                  !hiddenRooms.has(ci) && (
                    <React.Fragment key={`footer-room-${ci}`}>
                      <td
                        className={styles.footerLabel}
                        style={{ background: '#f7f7f7' }}
                      >
                        합계
                      </td>
                      <td
                        className={styles.footerValue}
                        style={{ color: 'blue', background: '#f7f7f7' }}
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
                  !hiddenRooms.has(i) && (
                    <th
                      key={`res-header-room-${i}`}
                      colSpan={
                        2 // 닉네임+G핸디
                        + (visibleMetrics.score    ? 1 : 0)
                        + (visibleMetrics.banddang ? 1 : 0)
                        + 1 // 결과
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
                  !hiddenRooms.has(i) && (
                    <React.Fragment key={`res-subhdr-room-${i}`}>
                      <th className={styles.header}>닉네임</th>
                      <th className={styles.header}>G핸디</th>
                      {visibleMetrics.score    && <th className={styles.header}>점수</th>}
                      {visibleMetrics.banddang && <th className={styles.header}>반땅</th>}
                      <th className={styles.header}>결과</th>
                    </React.Fragment>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: MAX_PER_ROOM }).map((_, ri) => (
                <tr key={`res-slot-${ri}`}>
                  {resultByRoom.map((room, ci) =>
                    !hiddenRooms.has(ci) && (
                      <React.Fragment key={`res-room-${ci}-slot-${ri}`}>
                        <td className={styles.cell}>{room.detail[ri].nickname}</td>
                        <td className={styles.cell}>{room.detail[ri].handicap}</td>
                        {visibleMetrics.score    && (
                          <td className={styles.cell}>{room.detail[ri].score}</td>
                        )}
                        {visibleMetrics.banddang && (
                          <td className={styles.cell} style={{ color: 'blue' }}>
                            {room.detail[ri].banddang}
                          </td>
                        )}
                        <td className={styles.cell} style={{ color: 'red' }}>
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
                  !hiddenRooms.has(ci) && (
                    <React.Fragment key={`res-footer-room-${ci}`}>
                      <td
                        className={styles.footerLabel}
                        style={{ background: '#f7f7f7' }}
                      >
                        합계
                      </td>
                      <td
                        className={styles.footerValue}
                        style={{ color: 'black', background: '#f7f7f7' }}
                      >
                        {room.sumHandicap}
                      </td>
                      {visibleMetrics.score    && (
                        <td
                          className={styles.footerValue}
                          style={{ color: 'black', background: '#f7f7f7' }}
                        >
                          {room.sumScore}
                        </td>
                      )}
                      {visibleMetrics.banddang && (
                        <td
                          className={styles.footerBanddang}
                          style={{ background: '#f7f7f7' }}
                        >
                          {room.sumBanddang}
                        </td>
                      )}
                      <td
                        className={styles.footerResult}
                        style={{ background: '#f7f7f7' }}
                      >
                        {room.sumResult}
                      </td>
                    </React.Fragment>
                  )
                )}
              </tr>
              <tr>
                {headers.map((_, i) =>
                  !hiddenRooms.has(i) && (
                    <React.Fragment key={`res-rank-room-${i}`}>
                      <td
                        colSpan={
                          2 // 닉네임+G핸디
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
                  <th className={styles.header}>방</th>
                  <th className={styles.header}>닉네임</th>
                  <th className={styles.header}>G핸디</th>
                  <th className={styles.header}>점수</th>
                  <th className={styles.header}>결과</th>
                  <th className={styles.header}>총점</th>
                  <th className={styles.header}>순위</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: roomCount }).map((_, roomIdx) => {
                  if (hiddenRooms.has(roomIdx)) return null;

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
                      {/* ① “방” 셀을 rowSpan=4 로 병합합니다. */}
                      <tr key={`team-room-${roomIdx}-A0`}>
                        <td rowSpan={4} className={styles.cell}>
                          {teamA.roomName}
                        </td>
                        <td className={styles.cell}>{teamA.members[0]?.nickname}</td>
                        <td className={styles.cell}>{teamA.members[0]?.handicap}</td>
                        <td className={styles.cell} style={{ color: 'blue' }}>
                          {teamA.members[0]?.score}
                        </td>
                        <td className={styles.cell} style={{ color: 'red' }}>
                          {(teamA.members[0]?.score || 0) - (teamA.members[0]?.handicap || 0)}
                        </td>
                        <td rowSpan={2} className={styles.footerResult}>
                          {teamA.sumResult}
                        </td>
                        <td rowSpan={2} className={styles.footerRank}>
                          {rankA}등
                        </td>
                      </tr>
                      {/* 팀 A 두 번째 행 */}
                      <tr key={`team-room-${roomIdx}-A1`}>
                        <td className={styles.cell}>{teamA.members[1]?.nickname}</td>
                        <td className={styles.cell}>{teamA.members[1]?.handicap}</td>
                        <td className={styles.cell} style={{ color: 'blue' }}>
                          {teamA.members[1]?.score}
                        </td>
                        <td className={styles.cell} style={{ color: 'red' }}>
                          {(teamA.members[1]?.score || 0) - (teamA.members[1]?.handicap || 0)}
                        </td>
                      </tr>
                      {/* 팀 B 첫 번째 행 */}
                      <tr key={`team-room-${roomIdx}-B0`}>
                        <td className={styles.cell}>{teamB.members[0]?.nickname}</td>
                        <td className={styles.cell}>{teamB.members[0]?.handicap}</td>
                        <td className={styles.cell} style={{ color: 'blue' }}>
                          {teamB.members[0]?.score}
                        </td>
                        <td className={styles.cell} style={{ color: 'red' }}>
                          {(teamB.members[0]?.score || 0) - (teamB.members[0]?.handicap || 0)}
                        </td>
                        <td rowSpan={2} className={styles.footerResult}>
                          {teamB.sumResult}
                        </td>
                        <td rowSpan={2} className={styles.footerRank}>
                          {rankB}등
                        </td>
                      </tr>
                      {/* 팀 B 두 번째 행 */}
                      <tr key={`team-room-${roomIdx}-B1`}>
                        <td className={styles.cell}>{teamB.members[1]?.nickname}</td>
                        <td className={styles.cell}>{teamB.members[1]?.handicap}</td>
                        <td className={styles.cell} style={{ color: 'blue' }}>
                          {teamB.members[1]?.score}
                        </td>
                        <td className={styles.cell} style={{ color: 'red' }}>
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
                <th style={captureHeaderStyle}>방</th>
                <th style={captureHeaderStyle}>닉네임</th>
                <th style={captureHeaderStyle}>G핸디</th>
                <th style={captureHeaderStyle}>점수</th>
                <th style={captureHeaderStyle}>결과</th>
                <th style={captureHeaderStyle}>총점</th>
                <th style={captureHeaderStyle}>순위</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: roomCount }).map((_, roomIdx) => {
                if (hiddenRooms.has(roomIdx)) return null;

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
                        style={captureCellStyle}
                      >
                        {teamA.roomName}
                      </td>
                      <td style={captureCellStyle}>{teamA.members[0]?.nickname}</td>
                      <td style={captureCellStyle}>{teamA.members[0]?.handicap}</td>
                      <td style={{ ...captureCellStyle, color: 'blue' }}>
                        {teamA.members[0]?.score}
                      </td>
                      <td style={{ ...captureCellStyle, color: 'red' }}>
                        {(teamA.members[0]?.score || 0) - (teamA.members[0]?.handicap || 0)}
                      </td>
                      <td rowSpan={2} style={captureFooterResultStyle}>
                        {teamA.sumResult}
                      </td>
                      <td rowSpan={2} style={captureFooterRankStyle}>
                        {rankA}등
                      </td>
                    </tr>
                    <tr key={`offscreen-team-room-${roomIdx}-A1`}>
                      <td style={captureCellStyle}>{teamA.members[1]?.nickname}</td>
                      <td style={captureCellStyle}>{teamA.members[1]?.handicap}</td>
                      <td style={{ ...captureCellStyle, color: 'blue' }}>
                        {teamA.members[1]?.score}
                      </td>
                      <td style={{ ...captureCellStyle, color: 'red' }}>
                        {(teamA.members[1]?.score || 0) - (teamA.members[1]?.handicap || 0)}
                      </td>
                    </tr>
                    <tr key={`offscreen-team-room-${roomIdx}-B0`}>
                      <td style={captureCellStyle}>{teamB.members[0]?.nickname}</td>
                      <td style={captureCellStyle}>{teamB.members[0]?.handicap}</td>
                      <td style={{ ...captureCellStyle, color: 'blue' }}>
                        {teamB.members[0]?.score}
                      </td>
                      <td style={{ ...captureCellStyle, color: 'red' }}>
                        {(teamB.members[0]?.score || 0) - (teamB.members[0]?.handicap || 0)}
                      </td>
                      <td rowSpan={2} style={captureFooterResultStyle}>
                        {teamB.sumResult}
                      </td>
                      <td rowSpan={2} style={captureFooterRankStyle}>
                        {rankB}등
                      </td>
                    </tr>
                    <tr key={`offscreen-team-room-${roomIdx}-B1`}>
                      <td style={captureCellStyle}>{teamB.members[1]?.nickname}</td>
                      <td style={captureCellStyle}>{teamB.members[1]?.handicap}</td>
                      <td style={{ ...captureCellStyle, color: 'blue' }}>
                        {teamB.members[1]?.score}
                      </td>
                      <td style={{ ...captureCellStyle, color: 'red' }}>
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

      {/* ─── 하단 버튼 ─── */}
      <div className={styles.stepFooter}>
        <button onClick={goPrev}>← 이전</button>
        <button onClick={goNext}>홈</button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 아래 스타일 객체들은 “off‐screen 팀결과표 복제본”에 쓰이는 inline 스타일입니다.
// on‐screen CSS와 동일한 테두리·배경을 적용하여, 캡처 시 실선이 보이도록 합니다.
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
