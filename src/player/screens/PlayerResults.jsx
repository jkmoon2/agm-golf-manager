// /src/player/screens/PlayerResults.jsx

import React, { useMemo, useRef, useEffect, useContext, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import styles from './PlayerResults.module.css';

import { StepContext as PlayerStepContext } from '../flows/StepFlow';
import { EventContext } from '../../contexts/EventContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import useEffectiveScoresMap from '../hooks/useEffectiveScoresMap';
import useEffectivePlayerEventData from '../hooks/useEffectivePlayerEventData';

/* ★ 게이트 정규화 */
function tsToMillis(ts){
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1e6;
  return Number(ts) || 0;
}
function normalizeGate(raw){
  const base = (raw && typeof raw === 'object') ? raw : {};
  const out = { ...base };
  const steps = out.steps || {};
  const fixed = {};
  for (let i=1;i<=8;i+=1) fixed[i] = steps[i] || 'enabled';
  out.steps = fixed;
  return out;
}
function pickGateByMode(playerGate, mode){
  const isFour = (mode === 'fourball' || mode === 'agm');
  const nested = isFour ? playerGate?.fourball : playerGate?.stroke;
  return normalizeGate(nested || playerGate || {});
}


function getEffectiveParticipants(eventData){
  const safeArr = (v) => (Array.isArray(v) ? v : []);
  const mode = (eventData?.mode === 'fourball' || eventData?.mode === 'agm') ? 'fourball' : 'stroke';
  const field = (mode === 'fourball') ? 'participantsFourball' : 'participantsStroke';
  const primary = safeArr(eventData?.[field]);
  const legacy = safeArr(eventData?.participants);
  if (!primary.length) {
    return legacy.map((p, i) => {
      const obj = (p && typeof p === 'object') ? p : {};
      const room = (obj?.room ?? obj?.roomNumber ?? null);
      return { ...obj, id: obj?.id ?? i, room, roomNumber: room };
    });
  }
  const map = new Map();
  legacy.forEach((p, i) => {
    const obj = (p && typeof p === 'object') ? p : {};
    const id = String(obj?.id ?? i);
    map.set(id, { ...(map.get(id) || {}), ...obj });
  });
  primary.forEach((p, i) => {
    const obj = (p && typeof p === 'object') ? p : {};
    const id = String(obj?.id ?? i);
    map.set(id, { ...(map.get(id) || {}), ...obj });
  });
  return Array.from(map.values()).map((p, i) => {
    const obj = (p && typeof p === 'object') ? p : {};
    const room = (obj?.room ?? obj?.roomNumber ?? null);
    return { ...obj, id: obj?.id ?? i, room, roomNumber: room };
  });
}

const strlen = (s) => Array.from(String(s || '')).length;
const MAX_PER_ROOM = 4;
const TEAM_NICK_WIDTH = null;

function normalizeHiddenRooms(pv, roomCount, viewKey) {
  let arr = [];
  if (pv && Array.isArray(pv.hiddenRooms)) {
    arr = pv.hiddenRooms;
  } else if (pv && pv[viewKey] && Array.isArray(pv[viewKey].hiddenRooms)) {
    arr = pv[viewKey].hiddenRooms;
  }
  const nums = arr.map(Number).filter(Number.isFinite);
  if (!nums.length) return new Set();
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const looksOneBased =
    (min >= 1 && max <= roomCount) || nums.some(v => v === 1 || v === roomCount);
  const idxs = looksOneBased ? nums.map(v => v - 1) : nums.slice();
  const filtered = idxs.filter(i => i >= 0 && i < roomCount);
  return new Set(filtered);
}

function readVisibleMetrics(pv, viewKey) {
  const vmRoot = pv?.visibleMetrics || pv?.metrics;
  if (vmRoot && (typeof vmRoot.score === 'boolean' || typeof vmRoot.banddang === 'boolean')) {
    return {
      score:    typeof vmRoot.score    === 'boolean' ? vmRoot.score    : true,
      banddang: typeof vmRoot.banddang === 'boolean' ? vmRoot.banddang : true,
    };
  }
  const vmMode = pv?.[viewKey]?.visibleMetrics || pv?.[viewKey]?.metrics || {};
  return {
    score:    typeof vmMode.score    === 'boolean' ? vmMode.score    : true,
    banddang: typeof vmMode.banddang === 'boolean' ? vmMode.banddang : true,
  };
}

/** AGM포볼 방 내부 정렬(0,1=A팀 / 2,3=B팀) */
function orderRoomFourball(roomArr = []) {
  const slot = [null, null, null, null];
  const used = new Set();

  const pairs = [];
  roomArr
    .filter(p => Number(p?.group) === 1)
    .forEach(p1 => {
      if (used.has(p1?.id)) return;
      const partner = roomArr.find(x => String(x?.id) === String(p1?.partner));
      if (partner && !used.has(partner?.id)) {
        pairs.push([p1, partner]);
        used.add(p1?.id); used.add(partner?.id);
      }
    });

  pairs.forEach((pair, idx) => {
    if (idx === 0) { slot[0] = pair[0]; slot[1] = pair[1]; }
    else if (idx === 1) { slot[2] = pair[0]; slot[3] = pair[1]; }
  });

  roomArr.forEach(p => {
    if (!used.has(p?.id)) {
      const empty = slot.findIndex(v => v === null);
      if (empty >= 0) slot[empty] = p;
      used.add(p?.id);
    }
  });

  return slot.map(p => p || { nickname: '', handicap: 0, score: 0 });
}

export default function PlayerResults() {
  const { goPrev, goNext } = useContext(PlayerStepContext) || {};
  const { eventData, scoresMap: ctxScoresMap, scoresReady: ctxScoresReady } = useContext(EventContext) || {};
  const effectiveEventData = useEffectivePlayerEventData();
  const params = useParams();
  const routeEventId = params?.eventId || params?.id;
  const eventId = effectiveEventData?.id || effectiveEventData?.eventId || eventData?.id || eventData?.eventId || routeEventId || '';

  const [fallbackGate, setFallbackGate] = useState(null);
  const [fallbackAt, setFallbackAt] = useState(0);
  const { scoresMap: effectiveScoresMap, scoresReady: effectiveScoresReady } = useEffectiveScoresMap(eventId, ctxScoresMap, ctxScoresReady);

  // 게이트 폴백
  useEffect(() => {
    const id = eventId || null;
    if (!id) return;
    const ref = doc(db, 'events', id);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      if (d?.playerGate) {
        setFallbackGate(d.playerGate);
        setFallbackAt(tsToMillis(d?.gateUpdatedAt));
      }
    });
    return unsub;
  }, [eventId]);

  // 게이트 정규화 + nextDisabled
  const nextDisabled = useMemo(() => {
    const sourceEventData = effectiveEventData || eventData;
    const modeKey = (sourceEventData?.mode === 'fourball' ? 'fourball' : 'stroke');
    const ctxAt = tsToMillis(sourceEventData?.gateUpdatedAt);
    const fbAt  = fallbackAt;
    const ctxGate = pickGateByMode(sourceEventData?.playerGate || {}, modeKey);
    const fbGate  = pickGateByMode(fallbackGate || {}, modeKey);
    const gate = (ctxAt >= fbAt ? ctxGate : fbGate);
    return (gate?.steps?.[6] !== 'enabled');
  }, [effectiveEventData?.playerGate, effectiveEventData?.gateUpdatedAt, effectiveEventData?.mode, eventData?.playerGate, eventData?.gateUpdatedAt, eventData?.mode, fallbackGate, fallbackAt]);

  const sourceEventData = effectiveEventData || eventData;
  const mode         = sourceEventData?.mode === 'fourball' ? 'fourball' : 'stroke';
  const roomCount    = sourceEventData?.roomCount || 0;
  const roomNames    = sourceEventData?.roomNames || [];
  const participants = useMemo(
    () => (Array.isArray(sourceEventData?.participants) && sourceEventData.participants.length
      ? sourceEventData.participants
      : getEffectiveParticipants(sourceEventData)),
    [sourceEventData?.participants, sourceEventData?.mode, sourceEventData?.participantsStroke, sourceEventData?.participantsFourball]
  );

  const [hiddenRooms, setHiddenRooms] = useState(new Set());
  const [visibleMetrics, setVisibleMetrics] = useState({ score: true, banddang: true });

  useEffect(() => {
    const pv = sourceEventData?.publicView || {};
    setHiddenRooms(normalizeHiddenRooms(pv, roomCount, mode));
    setVisibleMetrics(readVisibleMetrics(pv, mode));
  }, [sourceEventData?.publicView, roomCount, mode]);

  const headers = useMemo(() =>
    Array.from({ length: roomCount }, (_, i) => (roomNames[i]?.trim() ? roomNames[i] : `${i + 1}번방`))
  , [roomCount, roomNames]);

  // 방별 참가자 (scoresMap 우선 병합)
  const byRoom = useMemo(() => {
    const arr = Array.from({ length: roomCount }, () => []);
    (participants || []).forEach(p => {
      if (p?.room != null && p.room >= 1 && p.room <= roomCount) {
        const pid = String(p.id);
        const merged = (Object.prototype.hasOwnProperty.call(effectiveScoresMap, pid))
          ? { ...p, score: effectiveScoresMap[pid] }
          : (effectiveScoresReady ? { ...p, score: null } : p);
        arr[p.room - 1].push(merged);
      }
    });
    return arr;
  }, [participants, roomCount, effectiveScoresMap]);

  const maxNickCh = useMemo(() => {
    let m = 0;
    (participants || []).forEach(p => { m = Math.max(m, strlen(p.nickname)); });
    return Math.max(6, m);
  }, [participants]);

  const visibleCols = useMemo(() => {
    let cnt = 0;
    for (let i = 0; i < roomCount; i++) if (!hiddenRooms.has(i)) cnt++;
    return Math.max(1, cnt);
  }, [roomCount, hiddenRooms]);

  const resultByRoom = useMemo(() => {
    return byRoom.map(roomArr => {
      const ordered = (mode === 'fourball')
        ? orderRoomFourball(roomArr)
        : Array.from({ length: MAX_PER_ROOM }, (_, i) => roomArr[i] || { nickname: '', handicap: 0, score: 0 });

      let maxIdx = 0, maxVal = -Infinity;
      ordered.forEach((p, i) => {
        const sc = Number(p.score || 0);
        if (sc > maxVal) { maxVal = sc; maxIdx = i; }
      });

      let sumHd = 0, sumSc = 0, sumBd = 0, sumRs = 0;
      const detail = ordered.map((p, i) => {
        const hd = Number(p.handicap || 0);
        const sc = Number(p.score    || 0);
        const bd = (i === maxIdx) ? Math.floor(sc / 2) : sc;
        const used = visibleMetrics.banddang ? bd : sc;
        const rs = used - hd;
        sumHd += hd; sumSc += sc; sumBd += bd; sumRs += rs;
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
  }, [byRoom, visibleMetrics.banddang, mode]);

  const rankMap = useMemo(() => {
    const arr = resultByRoom
      .map((r, i) => ({ idx: i, tot: r.sumResult, hd: r.sumHandicap }))
      .filter(x => !hiddenRooms.has(x.idx))
      .sort((a, b) => a.tot - b.tot || a.hd - b.hd);
    return Object.fromEntries(arr.map((x, i) => [x.idx, i + 1]));
  }, [resultByRoom, hiddenRooms]);

  const teamsByRoom = useMemo(() => {
    if (mode !== 'fourball') return [];
    const list = [];
    resultByRoom.forEach((room, roomIdx) => {
      const [p0, p1, p2, p3] = room.detail; // 0,1 = A팀 / 2,3 = B팀
      const val = (p) => (Number(p?.score||0) - Number(p?.handicap||0));
      const teamA = { roomIdx, roomName: headers[roomIdx], teamIdx: 0, members: [p0, p1], sumResult: val(p0)+val(p1), sumHandicap: Number(p0?.handicap||0)+Number(p1?.handicap||0) };
      const teamB = { roomIdx, roomName: headers[roomIdx], teamIdx: 1, members: [p2, p3], sumResult: val(p2)+val(p3), sumHandicap: Number(p2?.handicap||0)+Number(p3?.handicap||0) };
      list.push(teamA, teamB);
    });
    return list;
  }, [resultByRoom, headers, mode]);

  const teamRankMap = useMemo(() => {
    const vis = teamsByRoom.filter(t => !hiddenRooms.has(t.roomIdx));
    vis.sort((a,b) => (a.sumResult - b.sumResult) || (a.sumHandicap - b.sumHandicap));
    const map = {};
    vis.forEach((t, i) => { map[`${t.roomIdx}:${t.teamIdx}`] = i + 1; });
    return map;
  }, [teamsByRoom, hiddenRooms]);

  const resultRef = useRef(null);
  const teamRef   = useRef(null);

  const captureAndSave = async (ref, file, type='jpg') => {
    const el = ref.current; if (!el) return;
    const ovr = el.style.overflow, ow = el.style.width;
    el.style.overflow  = 'visible';
    el.style.width     = `${el.scrollWidth}px`;
    el.scrollLeft = 0; el.scrollTop = 0;

    const canvas = await html2canvas(el, {
      scrollX: 0, scrollY: 0,
      width: el.scrollWidth, height: el.scrollHeight,
      windowWidth: el.scrollWidth, windowHeight: el.scrollHeight,
      backgroundColor: null,
      scale: window.devicePixelRatio || 2
    });

    el.style.overflow = ovr; el.style.width = ow;

    if (type === 'jpg') {
      const a = document.createElement('a');
      a.download = `${file}.jpg`;
      a.href = canvas.toDataURL('image/jpeg', 0.92);
      a.click();
      return;
    }

    const imgData = canvas.toDataURL('image/png');
    const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait';
    const pdf = new jsPDF({
      orientation,
      unit: 'px',
      format: [canvas.width, canvas.height],
      compress: true
    });
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height, undefined, 'FAST');
    pdf.save(`${file}.pdf`);
  };

  if (!roomCount) return <div className={styles.empty}>표시할 데이터가 없습니다.</div>;

  const metricsPerRoom = 2 + (visibleMetrics.score ? 1 : 0) + (visibleMetrics.banddang ? 1 : 0);

  /* ★ fix: STEP2와 동일한 정렬·밑줄 제거를 강제하는 공통 스타일 */
  const navLinkBaseStyle = {               // 기존 스타일은 그대로 유지하면서 최소 보강
    textDecoration: 'none',                // 밑줄 제거
    textAlign: 'center',                   // 가운데 정렬
    display: 'inline-flex',                // 정중앙 배치
    justifyContent: 'center',
    alignItems: 'center'
  };

  return (
    <div
      className={styles.page}
      style={{
        '--nick-ch': maxNickCh,
        '--cols':    visibleCols,
        ...(TEAM_NICK_WIDTH ? { ['--team-nick-w']: TEAM_NICK_WIDTH } : {})
      }}
    >
      <div className={styles.content}>
        {/* 📊 최종결과표 */}
        <div className={styles.card} style={{ marginTop: 4 }}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>📊 최종결과표</div>
          </div>

          <div ref={resultRef} className={styles.tableWrap}>
            <table
              className={styles.roomTable}
              style={{ minWidth: `calc(var(--cols) * ( var(--nick-w) + ${metricsPerRoom} * var(--metric-w) + 12px ))` }}
            >
              <colgroup>
                {Array.from({length: roomCount}).map((_, i) => !hiddenRooms.has(i) && (
                  <React.Fragment key={`colgrp-${i}`}>
                    <col style={{ width: 'var(--nick-w)' }} />
                    <col style={{ width: 'var(--metric-w)' }} />
                    {visibleMetrics.score    && <col style={{ width: 'var(--metric-w)' }} />}
                    {visibleMetrics.banddang && <col style={{ width: 'var(--metric-w)' }} />}
                    <col style={{ width: 'var(--metric-w)' }} />
                  </React.Fragment>
                ))}
              </colgroup>

              <thead>
                <tr>
                  {Array.from({length: roomCount}).map((_, i) => !hiddenRooms.has(i) && (
                    <th key={`res-h-${i}`} colSpan={2 + (visibleMetrics.score?1:0) + (visibleMetrics.banddang?1:0) + 1} className={styles.th}>
                      {roomNames[i]?.trim() ? roomNames[i] : `${i + 1}번방`}
                    </th>
                  ))}
                </tr>
                <tr>
                  {Array.from({length: roomCount}).map((_, i) => !hiddenRooms.has(i) && (
                    <React.Fragment key={`res-sub-${i}`}>
                      <th className={`${styles.subTh} ${styles.nickCol}`}>닉네임</th>
                      <th className={`${styles.subTh} ${styles.metricCol} ${styles.gHead}`}>G핸디</th>
                      <th className={`${styles.subTh} ${styles.metricCol}`}>점수</th>
                      {visibleMetrics.banddang && <th className={`${styles.subTh} ${styles.metricCol}`}>반땅</th>}
                      <th className={`${styles.subTh} ${styles.metricCol}`}>결과</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>

              <tbody>
                {Array.from({ length: MAX_PER_ROOM }).map((_, ri) => (
                  <tr key={`res-row-${ri}`}>
                    {Array.from({length: roomCount}).map((_, ci) => !hiddenRooms.has(ci) && (
                      <React.Fragment key={`res-${ci}-${ri}`}>
                        <td className={`${styles.td} ${styles.nickCell}`}><span className={styles.nick}>{(resultByRoom[ci]||{}).detail?.[ri]?.nickname || ''}</span></td>
                        <td className={`${styles.td} ${styles.metricCol}`}>{(resultByRoom[ci]||{}).detail?.[ri]?.handicap || 0}</td>
                        {visibleMetrics.score    && <td className={`${styles.td} ${styles.metricCol}`}>{(resultByRoom[ci]||{}).detail?.[ri]?.score || 0}</td>}
                        {visibleMetrics.banddang && <td className={`${styles.td} ${styles.metricCol}`} style={{ color: '#0b61da' }}>{(resultByRoom[ci]||{}).detail?.[ri]?.banddang || 0}</td>}
                        <td className={`${styles.td} ${styles.metricCol}`} style={{ color:'red', fontWeight:600 }}>{(resultByRoom[ci]||{}).detail?.[ri]?.result || 0}</td>
                      </React.Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr>
                  {Array.from({length: roomCount}).map((_, ci) => !hiddenRooms.has(ci) && (
                    <React.Fragment key={`res-sum-${ci}`}>
                      <td className={`${styles.td} ${styles.totalLabel}`}>합계</td>
                      <td className={`${styles.td} ${styles.totalValue} ${styles.metricCol}`} style={{ color: 'black' }}>{(resultByRoom[ci]||{}).sumHandicap || 0}</td>
                      {visibleMetrics.score    && <td className={`${styles.td} ${styles.totalValue} ${styles.metricCol}`} style={{ color: 'black' }}>{(resultByRoom[ci]||{}).sumScore || 0}</td>}
                      <td className={`${styles.td} ${styles.totalValue} ${styles.metricCol}`} style={{ color: visibleMetrics.banddang ? '#0b61da' : 'black' }}>
                        {visibleMetrics.banddang ? (resultByRoom[ci]||{}).sumBanddang : 0}
                      </td>
                      <td className={`${styles.td} ${styles.totalValue} ${styles.metricCol}`} style={{ color:'#cc0000' }}>{(resultByRoom[ci]||{}).sumResult || 0}</td>
                    </React.Fragment>
                  ))}
                </tr>
                <tr>
                  {Array.from({length: roomCount}).map((_, i) => !hiddenRooms.has(i) && (
                    <React.Fragment key={`res-rank-${i}`}>
                      <td colSpan={metricsPerRoom} className={styles.td} />
                      <td className={`${styles.td} ${styles.metricCol} ${styles.rankCell}`}>{rankMap[i]}등</td>
                    </React.Fragment>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className={styles.cardFooterRight}>
            <button className={`${styles.dlBtn} ${styles.btnPrev}`} onClick={() => captureAndSave(resultRef, 'results', 'jpg')}>JPG로 저장</button>
            <button className={`${styles.dlBtn} ${styles.btnNext}`} onClick={() => captureAndSave(resultRef, 'results', 'pdf')}>PDF로 저장</button>
          </div>
        </div>

        {/* 📋 팀결과표(포볼 전용) */}
        {mode === 'fourball' && (
          <div className={styles.card} style={{ marginTop: 12 }}>
            <div className={styles.cardHeader}><div className={styles.cardTitle}>📋 팀결과표</div></div>
            <div ref={teamRef} className={styles.tableWrap}>
              <table className={`${styles.roomTable} ${styles.teamTable}`}>
                <colgroup>
                  <col style={{ width: 'var(--team-room-w)' }} />
                  <col style={{ width: 'var(--team-nick-w)' }} />
                  <col style={{ width: 'var(--team-hand-w)' }} />
                  <col style={{ width: 'var(--team-score-w)' }} />
                  <col style={{ width: 'var(--team-result-w)' }} />
                  <col style={{ width: 'var(--team-total-w)' }} />
                  <col style={{ width: 'var(--team-rank-w)' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className={styles.subTh}>방</th>
                    <th className={styles.subTh}>닉네임</th>
                    <th className={styles.subTh}>G핸디</th>
                    <th className={styles.subTh}>점수</th>
                    <th className={styles.subTh}>결과</th>
                    <th className={styles.subTh}>총점</th>
                    <th className={styles.subTh}>순위</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: roomCount }).map((_, roomIdx) => {
                    if (hiddenRooms.has(roomIdx)) return null;
                    const room = resultByRoom[roomIdx];
                    if (!room) return null;
                    const [p0, p1, p2, p3] = room.detail; // 0,1 = A팀 / 2,3 = B팀
                    const r = (p) => (Number(p?.score||0) - Number(p?.handicap||0));
                    const sumA = r(p0) + r(p1);
                    const sumB = r(p2) + r(p3);
                    const rankA = teamRankMap[`${roomIdx}:0`] || '-';
                    const rankB = teamRankMap[`${roomIdx}:1`] || '-';

                    return (
                      <React.Fragment key={`team-room-${roomIdx}`}>
                        <tr>
                          <td className={styles.td} rowSpan={4}>{roomNames[roomIdx]?.trim() ? roomNames[roomIdx] : `${roomIdx + 1}번방`}</td>
                          <td className={styles.td}>{p0?.nickname || ''}</td>
                          <td className={styles.td}>{p0?.handicap || 0}</td>
                          <td className={styles.td} style={{ color:'#0b61da' }}>{p0?.score || 0}</td>
                          <td className={styles.td} style={{ color:'red' }}>{r(p0)}</td>
                          <td className={styles.td} rowSpan={2} style={{ fontWeight:700 }}>{sumA}</td>
                          <td className={styles.td} rowSpan={2} style={{ background:'#fff8d1', color:'blue', fontWeight:700 }}>{rankA}등</td>
                        </tr>
                        <tr>
                          <td className={styles.td}>{p1?.nickname || ''}</td>
                          <td className={styles.td}>{p1?.handicap || 0}</td>
                          <td className={styles.td} style={{ color:'#0b61da' }}>{p1?.score || 0}</td>
                          <td className={styles.td} style={{ color:'red' }}>{r(p1)}</td>
                        </tr>
                        <tr>
                          <td className={styles.td}>{p2?.nickname || ''}</td>
                          <td className={styles.td}>{p2?.handicap || 0}</td>
                          <td className={styles.td} style={{ color:'#0b61da' }}>{p2?.score || 0}</td>
                          <td className={styles.td} style={{ color:'red' }}>{r(p2)}</td>
                          <td className={styles.td} rowSpan={2} style={{ fontWeight:700 }}>{sumB}</td>
                          <td className={styles.td} rowSpan={2} style={{ background:'#fff8d1', color:'blue', fontWeight:700 }}>{rankB}등</td>
                        </tr>
                        <tr>
                          <td className={styles.td}>{p3?.nickname || ''}</td>
                          <td className={styles.td}>{p3?.handicap || 0}</td>
                          <td className={styles.td} style={{ color:'#0b61da' }}>{p3?.score || 0}</td>
                          <td className={styles.td} style={{ color:'red' }}>{r(p3)}</td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.cardFooterRight}>
              <button className={`${styles.dlBtn} ${styles.btnPrev}`} onClick={() => captureAndSave(teamRef, 'team-results', 'jpg')}>JPG로 저장</button>
              <button className={`${styles.dlBtn} ${styles.btnNext}`} onClick={() => captureAndSave(teamRef, 'team-results', 'pdf')}>PDF로 저장</button>
            </div>
          </div>
        )}
      </div>

      {/* ★ fix: STEP2와 동일한 하단 버튼 속성 + 정렬/밑줄 제거 통일 */}
      <div className={styles.footerNav}>
        <Link
          to={`/player/home/${eventId}/4`}
          className={`${styles.navBtn} ${styles.navPrev}`}
          onClick={(e)=>{ if (typeof goPrev==='function'){ e.preventDefault(); goPrev(); } }}
          style={navLinkBaseStyle}        // ★ fix
        >
          ← 이전
        </Link>

        <Link
          to={nextDisabled ? '#' : `/player/home/${eventId}/6`}
          className={`${styles.navBtn} ${styles.navNext}`}
          onClick={(e)=>{ 
            if (nextDisabled){ e.preventDefault(); return; }
            if (typeof goNext==='function'){ e.preventDefault(); goNext(); }
          }}
          aria-disabled={nextDisabled}
          style={ nextDisabled             // ★ fix: 공통 스타일 + 비활성 처리 병합
            ? { ...navLinkBaseStyle, opacity: 0.5, pointerEvents: 'none' }
            : navLinkBaseStyle
          }
        >
          다음 →
        </Link>
      </div>
    </div>
  );
}
