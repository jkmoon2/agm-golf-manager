// src/screens/Dashboard.jsx

import React, { useMemo, useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Dashboard.module.css';

// 기존 컨텍스트/로직 재사용
import { EventContext } from '../contexts/EventContext'; // publicView, participants, roomCount 등 :contentReference[oaicite:9]{index=9}

export default function Dashboard() {
  // 기존 h2 유지 (요구사항: 기존 코드 100% 유지)
  // 이전에는 h2만 반환했지만, 이제 전체 레이아웃 안에 포함해 사용합니다.
  const preservedTitle = <h2 className={styles.visuallyHidden}>대시보드 화면</h2>;

  const navigate = useNavigate();
  const { eventId, eventData, updatePublicView } = useContext(EventContext) || {};
  const mode        = eventData?.mode || 'stroke';
  const title       = eventData?.title || 'Untitled Event';
  const roomCount   = eventData?.roomCount || 0;
  const roomNames   = eventData?.roomNames || [];
  const participants = Array.isArray(eventData?.participants) ? eventData.participants : [];
  const pv          = eventData?.publicView || {};
  const hiddenRooms = Array.isArray(pv.hiddenRooms) ? pv.hiddenRooms.map(Number) : [];
  const showScore   = (pv.visibleMetrics?.score ?? pv.score ?? true);
  const showBand    = (pv.visibleMetrics?.banddang ?? pv.banddang ?? true);

  const capacity = roomCount * 4;
  const assignedCount = useMemo(
    () => participants.filter(p => Number.isFinite(p?.room)).length,
    [participants]
  );
  const scoreCount = useMemo(
    () => participants.filter(p => p?.score != null).length,
    [participants]
  );

  // 포볼(2인1팀)일 때 페어 수 계산(중복 제거)
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
  const expectedPairs = useMemo(() => {
    if (mode !== 'fourball') return 0;
    return Math.floor(participants.length / 2);
  }, [participants.length, mode]);

  // 방별 묶기
  const byRoom = useMemo(() => {
    const arr = Array.from({ length: roomCount }, () => []);
    participants.forEach(p => {
      const r = Number(p?.room);
      if (Number.isFinite(r) && r >= 1 && r <= roomCount) {
        arr[r - 1].push(p);
      }
    });
    return arr;
  }, [participants, roomCount]);

  // 방별 G핸디 합(파란색)
  const roomHandiSum = useMemo(
    () => byRoom.map(list => list.reduce((s, p) => s + (Number(p?.handicap) || 0), 0)),
    [byRoom]
  );
  const maxHandiSum = Math.max(1, ...roomHandiSum);

  // 방별 “결과 합계/순위” (Step6/8 동일 규칙)
  const resultByRoom = useMemo(() => {
    return byRoom.map(roomArr => {
      // 반땅 대상(최고 점수) 인덱스
      let maxIdx = 0, maxVal = -Infinity;
      const filled = Array.from({ length: 4 }, (_, i) => roomArr[i] || { handicap: 0, score: 0 });
      filled.forEach((p, i) => {
        const sc = Number(p?.score) || 0;
        if (sc > maxVal) { maxVal = sc; maxIdx = i; }
      });

      let sumHd = 0, sumSc = 0, sumBd = 0, sumRs = 0;
      filled.forEach((p, i) => {
        const hd = Number(p?.handicap) || 0;
        const sc = Number(p?.score) || 0;
        const bd = (i === maxIdx) ? Math.floor(sc / 2) : sc; // 반땅 룰(소수점 절사) :contentReference[oaicite:10]{index=10}
        const used = showScore ? (showBand ? bd : sc) : bd;  // Step6 보이는 항목 규칙과 일치 :contentReference[oaicite:11]{index=11}
        const rs = used - hd;
        sumHd += hd; sumSc += sc; sumBd += bd; sumRs += rs;
      });

      return { sumHandicap: sumHd, sumScore: sumSc, sumBanddang: sumBd, sumResult: sumRs };
    });
  }, [byRoom, showScore, showBand]);

  const rankMap = useMemo(() => {
    const arr = resultByRoom
      .map((r, i) => ({ idx: i, tot: r.sumResult, hd: r.sumHandicap }))
      .filter(x => !hiddenRooms.includes(x.idx))
      .sort((a, b) => a.tot - b.tot || a.hd - b.hd); // 낮은 점수 우선, 동점 시 핸디합 낮은 방 우선 :contentReference[oaicite:12]{index=12}
    const map = {};
    arr.forEach((x, i) => { map[x.idx] = i + 1; });
    return map;
  }, [resultByRoom, hiddenRooms]);

  // 조 중복(같은 방에 같은 조 2명 이상) 탐지
  const roomHasGroupDup = useMemo(() => {
    return byRoom.map(list => {
      const cnt = {};
      list.forEach(p => {
        const g = String(p?.group ?? '');
        cnt[g] = (cnt[g] || 0) + 1;
      });
      return Object.values(cnt).some(n => n > 1);
    });
  }, [byRoom]);

  // publicView 토글
  const toggleHiddenRoom = async (idx) => {
    const set = new Set(hiddenRooms);
    set.has(idx) ? set.delete(idx) : set.add(idx);
    const next = Array.from(set).sort((a, b) => a - b);
    try {
      await updatePublicView?.({ hiddenRooms: next }); // 안전 병합/디바운스 헬퍼 :contentReference[oaicite:13]{index=13}
    } catch {}
  };
  const toggleMetric = async (key) => {
    const next = {
      score: key === 'score' ? !showScore : showScore,
      banddang: key === 'banddang' ? !showBand : showBand,
    };
    try {
      // 구/신 키 동시 갱신(호환): visibleMetrics + (score/banddang)
      await updatePublicView?.({ visibleMetrics: next, ...next }); // :contentReference[oaicite:14]{index=14}
    } catch {}
  };

  // 네비
  const goStep = (n) => navigate(`/admin/home/${n}`);

  return (
    <div className={styles.page}>
      {preservedTitle}

      {/* 헤더 */}
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <div className={styles.eventTitle}>{title}</div>
          <span className={`${styles.modeBadge} ${mode === 'fourball' ? styles.fourball : styles.stroke}`}>
            {mode === 'fourball' ? 'AGM 포볼' : '스트로크'}
          </span>
        </div>
        <div className={styles.meta}>
          <div>이벤트ID: <b>{eventId || '-'}</b></div>
          <div>기간: <b>{eventData?.dateStart || '-'}</b> ~ <b>{eventData?.dateEnd || '-'}</b></div>
          <div>방 수: <b>{roomCount}</b></div>
        </div>
      </header>

      {/* KPI 도넛 */}
      <section className={styles.kpiGrid}>
        <KpiCard label="참가자" value={participants.length} total={capacity} />
        <KpiCard label="방배정" value={assignedCount} total={participants.length || 1} />
        <KpiCard label="점수입력" value={scoreCount} total={participants.length || 1} />
        {mode === 'fourball' && <KpiCard label="팀결성" value={pairCount} total={expectedPairs || 1} />}
      </section>

      {/* 표시 옵션 (PublicView) */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>표시 옵션(공유 뷰)</div>
        <div className={styles.flexRow}>
          <div className={styles.toggleGroup}>
            <span className={styles.toggleLabel}>항목</span>
            <button
              className={`${styles.pill} ${showScore ? styles.on : ''}`}
              onClick={() => toggleMetric('score')}
            >
              점수
            </button>
            <button
              className={`${styles.pill} ${showBand ? styles.on : ''}`}
              onClick={() => toggleMetric('banddang')}
            >
              반땅
            </button>
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

      {/* 방별 G핸디 합계 (막대) */}
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
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width }} />
                </div>
                <div className={styles.barValue} style={{ color: 'blue' }}>{sum}</div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 방별 결과 & 순위 (요약) */}
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
                  <td className={styles.rankCell}>
                    <span className={styles.rankBadge}>{rankMap[i] ?? '-'}</span>
                  </td>
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

/* ───────────────────────────────────────────── */
/* 내부 컴포넌트: KPI 카드(도넛 그래프)          */
/* ───────────────────────────────────────────── */
function KpiCard({ label, value, total }) {
  const pct = Math.max(0, Math.min(1, total ? value / total : 0));
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>{label}</div>
      <Donut percent={pct} />
      <div className={styles.cardValue}>
        <b>{value}</b> / {total || 0}
      </div>
    </div>
  );
}

function Donut({ percent = 0 }) {
  const size = 64;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * percent;
  return (
    <svg width={size} height={size} className={styles.donut}>
      <circle cx={size/2} cy={size/2} r={r} stroke="#eee" strokeWidth={stroke} fill="none" />
      <circle
        cx={size/2}
        cy={size/2}
        r={r}
        stroke="#4f46e5"
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className={styles.donutText}>
        {Math.round(percent * 100)}%
      </text>
    </svg>
  );
}
