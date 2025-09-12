// src/screens/Dashboard.jsx
import React, { useMemo, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Dashboard.module.css';
import { EventContext } from '../contexts/EventContext';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';

export default function Dashboard() {
  const preservedTitle = <h2 className={styles.visuallyHidden}>대시보드 화면</h2>;

  const navigate = useNavigate();
  const ctx = useContext(EventContext) || {};
  const { eventId: ctxEventId, eventData: ctxEventData, updatePublicView: ctxUpdatePublicView } = ctx;

  // 대회 목록
  const [events, setEvents] = useState([]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'events'));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => String(b.dateStart || '').localeCompare(String(a.dateStart || '')));
        if (mounted) setEvents(list);
      } catch (e) { console.warn('[Dashboard] events load failed:', e); }
    })();
    return () => { mounted = false; };
  }, []);

  // 선택된 대회
  const [selectedId, setSelectedId] = useState(ctxEventId || '');
  useEffect(() => { if (ctxEventId && !selectedId) setSelectedId(ctxEventId); }, [ctxEventId, selectedId]);

  const [selectedData, setSelectedData] = useState(ctxEventData || null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (selectedId && ctxEventId && selectedId === ctxEventId) {
          if (mounted) setSelectedData(ctxEventData || null);
          return;
        }
        if (selectedId) {
          const ds = await getDoc(doc(db, 'events', selectedId));
          if (mounted) setSelectedData(ds.exists() ? ds.data() : null);
        } else {
          if (mounted) setSelectedData(ctxEventData || null);
        }
      } catch (e) { console.warn('[Dashboard] event load failed:', e); }
    })();
    return () => { mounted = false; };
  }, [selectedId, ctxEventId, ctxEventData]);

  // 파생값
  const mode         = selectedData?.mode || 'stroke';
  const title        = selectedData?.title || 'Untitled Event';
  const roomCount    = Number(selectedData?.roomCount) || 0;
  const roomNames    = Array.isArray(selectedData?.roomNames) ? selectedData.roomNames : [];
  const participants = Array.isArray(selectedData?.participants) ? selectedData.participants : [];
  const pv           = selectedData?.publicView || {};
  const hiddenRooms  = Array.isArray(pv.hiddenRooms) ? pv.hiddenRooms.map(Number) : [];
  const showScore    = (pv.visibleMetrics?.score ?? pv.score ?? true);
  const showBand     = (pv.visibleMetrics?.banddang ?? pv.banddang ?? true);
  const capacity     = roomCount * 4;

  // KPI
  const assignedCount = useMemo(
    () => participants.filter(p => Number.isFinite(Number(p?.room))).length,
    [participants]
  );
  const scoreCount = useMemo(
    () => participants.filter(p => p?.score != null && p?.score !== '').length,
    [participants]
  );
  const pairCount = useMemo(() => {
    if (mode !== 'fourball') return 0;
    const seen = new Set();
    participants.forEach(p => {
      if (p?.partner != null) {
        const a = Number(p.id); const b = Number(p.partner);
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        seen.add(key);
      }
    });
    return seen.size;
  }, [participants, mode]);
  const expectedPairs = useMemo(() => (mode !== 'fourball' ? 0 : Math.floor(participants.length / 2)), [participants.length, mode]);

  // 방별
  const byRoom = useMemo(() => {
    const arr = Array.from({ length: roomCount }, () => []);
    participants.forEach(p => {
      const r = Number(p?.room);
      if (Number.isFinite(r) && r >= 1 && r <= roomCount) arr[r - 1].push(p);
    });
    return arr;
  }, [participants, roomCount]);

  const roomHandiSum = useMemo(
    () => byRoom.map(list => list.reduce((s, p) => s + (Number(p?.handicap) || 0), 0)),
    [byRoom]
  );
  const maxHandiSum = Math.max(1, ...roomHandiSum);

  const roomHasGroupDup = useMemo(() => {
    return byRoom.map(list => {
      const cnt = {};
      list.forEach(p => { const g = String(p?.group ?? ''); cnt[g] = (cnt[g] || 0) + 1; });
      return Object.values(cnt).some(n => n > 1);
    });
  }, [byRoom]);

  const resultByRoom = useMemo(() => {
    return byRoom.map(roomArr => {
      const filled = Array.from({ length: 4 }, (_, i) => roomArr[i] || { handicap: 0, score: 0 });
      let maxIdx = 0, maxVal = -Infinity;
      filled.forEach((p, i) => { const sc = Number(p?.score) || 0; if (sc > maxVal) { maxVal = sc; maxIdx = i; } });
      let sumHd = 0, sumRs = 0;
      filled.forEach((p, i) => {
        const hd = Number(p?.handicap) || 0;
        const sc = Number(p?.score) || 0;
        const bd = (i === maxIdx) ? Math.floor(sc / 2) : sc;
        const used = showScore ? (showBand ? bd : sc) : bd;
        const rs = used - hd;
        sumHd += hd; sumRs += rs;
      });
      return { sumHandicap: sumHd, sumResult: sumRs };
    });
  }, [byRoom, showScore, showBand]);

  const rankMap = useMemo(() => {
    const arr = resultByRoom
      .map((r, i) => ({ idx: i, tot: r.sumResult, hd: r.sumHandicap }))
      .filter(x => !hiddenRooms.includes(x.idx))
      .sort((a, b) => a.tot - b.tot || a.hd - b.hd);
    const map = {}; arr.forEach((x, i) => { map[x.idx] = i + 1; });
    return map;
  }, [resultByRoom, hiddenRooms]);

  // publicView 갱신
  const writePublicView = async (patch) => {
    const targetId = selectedId || ctxEventId;
    if (!targetId) return;
    if (ctxUpdatePublicView && targetId === ctxEventId) { await ctxUpdatePublicView(patch); return; }
    const prev = selectedData?.publicView || {};
    const next = { ...prev, ...patch };
    try {
      await updateDoc(doc(db, 'events', targetId), { publicView: next });
      setSelectedData(d => ({ ...(d || {}), publicView: next }));
    } catch (e) { console.warn('[Dashboard] publicView update failed:', e); }
  };

  const toggleHiddenRoom = async (idx) => {
    const set = new Set(hiddenRooms);
    set.has(idx) ? set.delete(idx) : set.add(idx);
    const next = Array.from(set).sort((a, b) => a - b);
    await writePublicView({ hiddenRooms: next });
  };
  const toggleMetric = async (key) => {
    const next = { score: key === 'score' ? !showScore : showScore, banddang: key === 'banddang' ? !showBand : showBand };
    await writePublicView({ visibleMetrics: next, ...next });
  };

  const goStep = (n) => navigate(`/admin/home/${n}`);

  return (
    <div className={styles.page}>
      {preservedTitle}

      {/* 상단: 대회 선택 + 모드 뱃지 */}
      <div className={styles.topRow}>
        <div className={styles.selectWrap} title={title}>
          <select
            className={styles.select}
            value={selectedId || ctxEventId || ''}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {(selectedId || ctxEventId) && !events.find(ev => ev.id === (selectedId || ctxEventId)) && (
              <option value={selectedId || ctxEventId}>
                {title} ({selectedId || ctxEventId})
              </option>
            )}
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.title || ev.id}
              </option>
            ))}
          </select>
        </div>
        <span className={`${styles.modeBadge} ${mode === 'fourball' ? styles.fourball : styles.stroke}`}>
          {mode === 'fourball' ? 'AGM 포볼' : '스트로크'}
        </span>
      </div>

      {/* 메타 정보(한 줄, 가로 스크롤/툴팁로 생략 방지) */}
      <div className={styles.metaStrip}>
        <div className={`${styles.metaItem} ${styles.metaLeft}`}>
          <b>ID</b>
          <span title={selectedId || ctxEventId || '-'}>
            {selectedId || ctxEventId || '-'}
          </span>
        </div>
        <div className={`${styles.metaItem} ${styles.metaCenter}`}>
          <b>기간</b>
          <span title={`${selectedData?.dateStart || '-'} ~ ${selectedData?.dateEnd || '-'}`}>
            {selectedData?.dateStart || '-'} ~ {selectedData?.dateEnd || '-'}
          </span>
        </div>
        <div className={`${styles.metaItem} ${styles.metaRight}`}>
          <b>방 수</b>
          <span title={String(roomCount)}>{roomCount}</span>
        </div>
      </div>

      {/* KPI */}
      <section className={styles.kpiGrid}>
        <KpiCard label="참가자" value={participants.length} total={capacity || 0} />
        <KpiCard label="방배정" value={assignedCount} total={participants.length || 1} />
        <KpiCard label="점수입력" value={scoreCount} total={participants.length || 1} />
        {mode === 'fourball' && <KpiCard label="팀결성" value={pairCount} total={expectedPairs || 1} />}
      </section>

      {/* 표시 옵션 */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>표시 옵션(공유 뷰)</div>
        <div className={styles.flexRow}>
          <div className={styles.toggleGroup}>
            <span className={styles.toggleLabel}>항목</span>
            <button className={`${styles.pill} ${showScore ? styles.on : ''}`} onClick={() => toggleMetric('score')}>점수</button>
            <button className={`${styles.pill} ${showBand ? styles.on : ''}`} onClick={() => toggleMetric('banddang')}>반땅</button>
          </div>
          <div className={styles.toggleGroup}>
            <span className={styles.toggleLabel}>방 숨김</span>
            {Array.from({ length: roomCount }, (_, i) => (
              <button
                key={i}
                className={`${styles.pill} ${hiddenRooms.includes(i) ? '' : styles.on}`}
                onClick={() => toggleHiddenRoom(i)}
                title={roomNames[i]?.trim() || `${i + 1}번방`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 방별 배정 현황 */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>방별 배정 현황</div>
        <ul className={styles.assignList}>
          {byRoom.map((list, i) => {
            const count = list.length;
            const pct = Math.max(0, Math.min(1, count / 4));
            return (
              <li key={i} className={styles.assignRow}>
                <div className={styles.assignLabel}>{roomNames[i]?.trim() || `${i + 1}번방`}</div>
                <div className={styles.assignTrack}>
                  <div className={styles.assignFill} style={{ width: `${Math.round(pct * 100)}%` }} />
                </div>
                <div className={styles.assignVal}>{count} / 4</div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 방별 G핸디 합계 */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>방별 G핸디 합계</div>
        <ul className={styles.bars}>
          {roomHandiSum.map((sum, i) => {
            const width = `${Math.round((sum / maxHandiSum) * 100)}%`;
            const hidden = hiddenRooms.includes(i);
            return (
              <li key={i} className={`${styles.barRow} ${hidden ? styles.dim : ''}`}>
                <div className={styles.barLabel}>
                  {roomNames[i]?.trim() || `${i + 1}번방`}
                  {roomHasGroupDup[i] && <span className={styles.warnDot} title="같은 조 중복 배정 감지" />}
                </div>
                <div className={styles.barTrack}><div className={styles.barFill} style={{ width }} /></div>
                <div className={styles.barValue} style={{ color: 'blue' }}>{sum}</div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 방별 결과 합 & 순위 */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>방별 결과 합 & 순위</div>
        <table className={styles.miniTable}>
          <thead>
            <tr>
              <th>방</th>
              <th>G핸디 합</th>
              <th>결과 합</th>
              <th>순위</th>
            </tr>
          </thead>
          <tbody>
            {resultByRoom.map((r, i) => {
              if (hiddenRooms.includes(i)) return null;
              return (
                <tr key={i}>
                  <td>{roomNames[i]?.trim() || `${i + 1}번방`}</td>
                  <td style={{ color: 'blue' }}>{r.sumHandicap}</td>
                  <td style={{ color: 'red' }}>{r.sumResult}</td>
                  <td className={styles.rankCell}><span className={styles.rankBadge}>{rankMap[i] ?? '-'}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* 빠른 이동 */}
      <section className={styles.quick}>
        <button className={styles.quickBtn} onClick={() => goStep(4)}>참가자 업로드(STEP4)</button>
        <button className={styles.quickBtn} onClick={() => goStep(mode === 'fourball' ? 7 : 5)}>
          방배정 {mode === 'fourball' ? '(STEP7)' : '(STEP5)'}
        </button>
        <button className={styles.quickBtn} onClick={() => goStep(mode === 'fourball' ? 8 : 6)}>
          결과표 {mode === 'fourball' ? '(STEP8)' : '(STEP6)'}
        </button>
      </section>
    </div>
  );
}

/* 내부 컴포넌트: KPI 카드 */
function KpiCard({ label, value, total }) {
  const pct = Math.max(0, Math.min(1, total ? value / total : 0));
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>{label}</div>
      <Donut percent={pct} />
      <div className={styles.cardValue}><b>{value}</b> / {total || 0}</div>
    </div>
  );
}

function Donut({ percent = 0 }) {
  const size = 64, stroke = 8, r = (size - stroke) / 2;
  const c = 2 * Math.PI * r, dash = c * percent;
  return (
    <svg width={size} height={size} className={styles.donut}>
      <circle cx={size/2} cy={size/2} r={r} stroke="#eee" strokeWidth={stroke} fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke="#4f46e5" strokeWidth={stroke} fill="none"
              strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`}
              transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className={styles.donutText}>
        {Math.round(percent * 100)}%
      </text>
    </svg>
  );
}
