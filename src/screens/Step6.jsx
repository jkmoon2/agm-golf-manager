// src/screens/Step6.jsx

import React, { useState, useRef, useMemo, useContext } from 'react';
import { useSwipeable } from 'react-swipeable';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import styles from './Step6.module.css';
import { StepContext } from '../flows/StepFlow';

export default function Step6() {
  // Context로부터 상태와 내비게이션 함수 가져오기
  const {
    participants = [], // [{ id, group, nickname, handicap, score, room, partner }, …]
    roomCount,         // 총 방 개수
    roomNames = [],    // [ "1번방 이름", "2번방 이름", … ]
    goPrev,            // 이전 단계로 돌아가는 함수
    setStep            // 특정 단계로 이동 (홈은 1)
  } = useContext(StepContext);

  // Swipeable 핸들러: 좌 스와이프 무시, 아래로 드래그 시 홈(1) 이동
  const handlers = useSwipeable({
    onSwipedLeft: () => {},       // 좌로 밀어도 반응 없음
    onSwipedDown: () => setStep(1), // 아래로 끌면 1페이지(홈)
    preventScrollOnSwipe: true,
    trackMouse: true
  });

  const maxRows = 4; // 한 방당 최대 4명

  // ───── UI 상태 ─────
  const [hiddenRooms, setHiddenRooms]       = useState(new Set());
  const [visibleMetrics, setVisibleMetrics] = useState({ score: true, banddang: true });
  const [menuOpen, setMenuOpen]             = useState(false);
  const [navOpen, setNavOpen]               = useState(false);

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
  const byRoom = useMemo(() => {
    const arr = Array.from({ length: roomCount }, () => []);
    participants.forEach(p => {
      if (p.room != null && p.room >= 1 && p.room <= roomCount) {
        arr[p.room - 1].push(p);
      }
    });
    return arr;
  }, [participants, roomCount]);

  // ───── 배정표 row 생성 ─────
  const allocRows = Array.from({ length: maxRows }, (_, ri) =>
    byRoom.map(roomArr => roomArr[ri] || { nickname: '', handicap: '' })
  );

  // ───── 최종결과 계산 (반땅 로직 포함) ─────
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
        <table className={styles.table}>
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
        <table className={styles.table}>
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
        <button onClick={() => setStep(1)}>홈</button>
      </div>
    </div>
  );
}
