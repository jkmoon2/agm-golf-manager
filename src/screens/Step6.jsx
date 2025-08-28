// src/screens/Step6.jsx

import React, { useState, useRef, useMemo, useContext } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import styles from './Step6.module.css';
import usePersistRoomTableSelection from '../hooks/usePersistRoomTableSelection';
import { StepContext } from '../flows/StepFlow';
import { EventContext } from '../contexts/EventContext';   // ★ 추가: 이벤트 문서 접근용

export default function Step6() {
  // Context로부터 상태와 내비게이션 함수 가져오기
  const {
    participants = [], // [{ id, group, nickname, handicap, score, room, partner }, …]
    roomCount,         // 총 방 개수
    roomNames = [],    // [ "1번방 이름", "2번방 이름", … ]
    goPrev,            // 이전 단계로 돌아가는 함수
    setStep            // 특정 단계로 이동 (홈은 1)
  } = useContext(StepContext);

  // ★ 추가: 이벤트 문서 / 업데이트 함수
  const { eventId, eventData } = useContext(EventContext);

  // ★ patch: Step6는 편집 직후에도 최신 참가자 목록을 표시해야 함.
  // participants(컨텍스트)가 비어있으면 Firestore eventData.participants를 폴백으로 사용
  const srcParticipants = (participants && participants.length)
    ? participants
    : ((eventData && Array.isArray(eventData.participants)) ? eventData.participants : []);

  const maxRows = 4; // 한 방당 최대 4명

  // ───── UI 상태 ─────
  const [hiddenRooms, setHiddenRooms]       = useState(new Set());
  const [visibleMetrics, setVisibleMetrics] = useState({ score: true, banddang: true });
  // ★ selection sync (remote-first + debounce)
  const showScore = !!visibleMetrics.score;
  const setShowScore = (v) => setVisibleMetrics(m => ({ ...m, score: !!v }));
  const showHalved = !!visibleMetrics.banddang;
  const setShowHalved = (v) => setVisibleMetrics(m => ({ ...m, banddang: !!v }));
  usePersistRoomTableSelection({ eventId, hiddenRooms, setHiddenRooms, showScore, setShowScore, showHalved, setShowHalved, syncToFirestore: true });

  const [menuOpen, setMenuOpen]             = useState(false);

  // ★ 추가: 관리자 페이지를 다시 왔다 갔다 해도 유지되도록, 문서의 publicView → 상태 초기화
  React.useEffect(() => {
    const pv = eventData?.publicView;
    if (!pv) return;
    if (Array.isArray(pv.hiddenRooms)) {
      setHiddenRooms(new Set(pv.hiddenRooms.map(Number).filter(n => Number.isFinite(n))));
    }
    if (pv.visibleMetrics && typeof pv.visibleMetrics === 'object') {
      setVisibleMetrics(prev => ({ ...prev, ...pv.visibleMetrics }));
    }
  }, [eventData]);

  /* ★ hook에서 저장하므로 비활성화
    React.useEffect(() => {
      if (!eventId || typeof updateEvent !== 'function') return;
      const pv = {
        hiddenRooms: Array.from(hiddenRooms),
        visibleMetrics,
      };
      updateEvent({ publicView: pv });
    }, [eventId, hiddenRooms, visibleMetrics, updateEvent]); }
  */

  // “선택” 메뉴: 방 숨기기 토글, 점수·반땅 토글
  const toggleRoom   = idx => {
    const s = new Set(hiddenRooms);
    s.has(idx) ? s.delete(idx) : s.add(idx);
    setHiddenRooms(s);
  };
  const toggleMetric = key => {
    setVisibleMetrics(vm => ({ ...vm, [key]: !vm[key] }));
  };

  const toggleMenu = e => { e.stopPropagation(); setMenuOpen(o => !o); };
  const handleOuterClick = () => { if (menuOpen) setMenuOpen(false); };

  // ───── 캡처용 refs ─────
  const allocRef  = useRef();
  const resultRef = useRef();

  // ───── 다운로드 헬퍼 (JPG / PDF) ─────
  const downloadTable = async (ref, name, type) => {
    const elem = ref.current;
    if (!elem) return;

    // 1) 원본 스타일 저장
    const origOverflow = elem.style.overflow;
    const origWidth    = elem.style.width;

    // 2) 전체 영역 보이도록 overflow 해제 + width 확장
    elem.style.overflow = 'visible';
    elem.style.width    = `${elem.scrollWidth}px`;

    // 3) 스크롤 초기화
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

    // 4) 스타일 복구
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
      const w   = pdf.internal.pageSize.getWidth();
      const h   = (canvas.height * w) / canvas.width;
      pdf.addImage(img, 'PNG', 0, 0, w, h);
      pdf.save(`${name}.pdf`);
    }
  };

  // ───── “방 이름” 배열 생성 ─────
  const headers = Array.from({ length: roomCount }, (_, i) =>
    roomNames[i]?.trim() ? roomNames[i] : `${i + 1}번방`
  );

  // ───── participants → 방별로 묶기 ─────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const byRoom = useMemo(() => {
    const arr = Array.from({ length: roomCount }, () => []);
    srcParticipants.forEach(p => {
      if (p.room != null && p.room >= 1 && p.room <= roomCount) {
        arr[p.room - 1].push(p);
      }
    });
    return arr;
  }, [srcParticipants, roomCount]); // ✅ 핵심: srcParticipants를 직접 의존

  // ───── 배정표 row 생성 ─────
  const allocRows = Array.from({ length: maxRows }, (_, ri) =>
    byRoom.map(roomArr => roomArr[ri] || { nickname: '', handicap: '' })
  );

  // ───── 최종결과 계산 (반땅 로직 포함) ─────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resultByRoom = useMemo(() => {
    return byRoom.map(roomArr => {
      // (1) 빈칸 포함
      const filled = Array.from({ length: maxRows }, (_, i) =>
        roomArr[i] || { nickname: '', handicap: 0, score: 0 }
      );

      // (2) 반땅 대상 인덱스 찾기
      let maxIdx = 0, maxVal = -Infinity;
      filled.forEach((p, i) => {
        const sc = p.score || 0;
        if (sc > maxVal) {
          maxVal = sc;
          maxIdx = i;
        }
      });

      // (3) 합계·detail 계산
      let sumHd = 0, sumSc = 0, sumBd = 0, sumRs = 0;
      const detail = filled.map((p, i) => {
        const hd = p.handicap || 0;
        const sc = p.score    || 0;
        sumHd += hd;
        sumSc += sc;

        const bd = i === maxIdx ? Math.floor(sc / 2) : sc;
        sumBd += bd;

        // 점수/반땅 표시 여부에 따른 실제 사용값
        const used = visibleMetrics.score
          ? (visibleMetrics.banddang ? bd : sc)
          : bd;
        const rs = used - hd;
        sumRs += rs;

        return { ...p, score: sc, banddang: bd, result: rs };
      });

      return {
        detail,
        sumHandicap: sumHd,
        sumScore:    sumSc,
        sumBanddang: sumBd,
        sumResult:   sumRs
      };
    });
  }, [byRoom, visibleMetrics]);

  // ───── 등수 재계산 ─────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rankMap = useMemo(() => {
    const arr = resultByRoom
      .map((r, i) => ({ idx: i, tot: r.sumResult, hd: r.sumHandicap }))
      .filter(x => !hiddenRooms.has(x.idx))
      .sort((a, b) => a.tot - b.tot || a.hd - b.hd);
    return Object.fromEntries(arr.map((x, i) => [x.idx, i + 1]));
  }, [resultByRoom, hiddenRooms]);

  return (
    <div className={styles.step} onClick={handleOuterClick}>

      {/* ─── 선택 메뉴 ─── */}
      <div className={styles.selectWrapper}>
        <button className={styles.selectButton} onClick={toggleMenu}>
          선택
        </button>
        {menuOpen && (
          <div className="dropdownMenu" onClick={e => e.stopPropagation()}>
            {/* 방 숨기기 */}
            {headers.map((h, i) => (
              <label key={i} className="dropdownItem">
                <input
                  type="checkbox"
                  checked={!hiddenRooms.has(i)}
                  onChange={() => { toggleRoom(i); setMenuOpen(false); }}
                />
                {h}
              </label>
            ))}
            <hr className="dropdownDivider" />
            {/* 점수/반땅 토글 */}
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

      {/* ─── 방배정표 ─── */}
      <div ref={allocRef} className={styles.tableContainer}>
        <h4 className={styles.tableTitle}>🏠 방배정표</h4>
        {/* ✅ 고정 행높이 & 빈칸 NBSP 주입을 위한 클래스 추가 */}
        <table className={`${styles.table} ${styles.fixedRows}`}>
          <thead>
            <tr>
              {headers.map((h, i) => 
                !hiddenRooms.has(i) && (
                  <th key={i} colSpan={2} className={styles.header}>
                    {h}
                  </th>
                )
              )}
            </tr>
            <tr>
              {headers.map((_, i) => 
                !hiddenRooms.has(i) && (
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
                  !hiddenRooms.has(ci) && (
                    <React.Fragment key={ci}>
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
              {byRoom.map((roomArr, ci) => 
                !hiddenRooms.has(ci) && (
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

      {/* ─── 최종결과표 ─── */}
      <div ref={resultRef} className={`${styles.tableContainer} ${styles.resultContainer}`}>
        <h4 className={styles.tableTitle}>📊 최종결과표</h4>
        {/* ✅ 동일 클래스 부여로 두 표의 행높이 완전 동일 */}
        <table className={`${styles.table} ${styles.fixedRows}`}>
          <thead>
            <tr>
              {headers.map((h, i) => 
                !hiddenRooms.has(i) && (
                  <th
                    key={i}
                    colSpan={2 + (visibleMetrics.score ? 1 : 0) + (visibleMetrics.banddang ? 1 : 0) + 1}
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
                  <React.Fragment key={i}>
                    <th className={styles.header}>닉네임</th>
                    <th className={styles.header}>G핸디</th>
                    {visibleMetrics.score && <th className={styles.header}>점수</th>}
                    {visibleMetrics.banddang && <th className={styles.header}>반땅</th>}
                    <th className={styles.header}>결과</th>
                  </React.Fragment>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }).map((_, ri) => (
              <tr key={ri}>
                {resultByRoom.map((roomObj, ci) => 
                  !hiddenRooms.has(ci) && (
                    <React.Fragment key={ci}>
                      <td className={styles.cell}>{roomObj.detail[ri].nickname}</td>
                      <td className={styles.cell}>{roomObj.detail[ri].handicap}</td>
                      {visibleMetrics.score && <td className={styles.cell}>{roomObj.detail[ri].score}</td>}
                      {visibleMetrics.banddang && (
                        <td className={styles.cell} style={{ color: 'blue' }}>
                          {roomObj.detail[ri].banddang}
                        </td>
                      )}
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
                !hiddenRooms.has(ci) && (
                  <React.Fragment key={ci}>
                    <td className={styles.footerLabel}>합계</td>
                    <td className={styles.footerValue}>{roomObj.sumHandicap}</td>
                    {visibleMetrics.score && <td className={styles.footerValue}>{roomObj.sumScore}</td>}
                    {visibleMetrics.banddang && <td className={styles.footerBanddang}>{roomObj.sumBanddang}</td>}
                    <td className={styles.footerResult}>{roomObj.sumResult}</td>
                  </React.Fragment>
                )
              )}
            </tr>
            <tr>
              {headers.map((_, i) => 
                !hiddenRooms.has(i) && (
                  <React.Fragment key={i}>
                    <td
                      colSpan={2 + (visibleMetrics.score ? 1 : 0) + (visibleMetrics.banddang ? 1 : 0)}
                      className={styles.footerBlank}
                    />
                    <td className={styles.footerRank} style={{ color: 'blue' }}>{rankMap[i]}등</td>
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

      {/* ─── 하단 버튼 ─── */}
      <div className={styles.stepFooter}>
        <button onClick={goPrev}>← 이전</button>
        <button onClick={() => { try { localStorage.setItem('homeViewMode','stroke'); } catch(e){}; setStep(0); }}>홈</button>
      </div>
    </div>
  );
}