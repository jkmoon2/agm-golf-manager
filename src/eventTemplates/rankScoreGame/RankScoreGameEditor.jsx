// /src/eventTemplates/rankScoreGame/RankScoreGameEditor.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getRankScorePairGroupLabel, normalizeRankScoreGameParams, normalizeRankScorePairGroups } from '../../events/rankScoreGame';

const LONG_PRESS_MS = 450;
const PAIR_GROUP_OPTIONS = [
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 3],
  [2, 4],
  [3, 4],
];

const CALC_METHOD_OPTIONS = [
  { value: 'add', label: '더하기' },
  { value: 'subtract', label: '빼기' },
  { value: 'multiply', label: '곱하기' },
  { value: 'divide', label: '나누기' },
];

const ROOM_RANK_SLOT_OPTIONS = [1, 2, 3, 4];

export default function RankScoreGameEditor({ participants = [], value, onChange }) {
  const safe = normalizeRankScoreGameParams(value);
  const pairGroups = normalizeRankScorePairGroups(safe.pairGroups);
  const participantsSafe = Array.isArray(participants) ? participants : [];
  const minusTimersRef = useRef({});
  const [adjustDraft, setAdjustDraft] = useState({});

  useEffect(() => {
    const next = {};
    Object.entries(safe.adjustments || {}).forEach(([key, val]) => {
      next[String(key)] = String(val ?? '');
    });
    setAdjustDraft(next);
  }, [JSON.stringify(safe.adjustments || {})]);

  useEffect(() => () => {
    try {
      Object.values(minusTimersRef.current || {}).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    } catch {}
  }, []);

  const emit = (patch) => {
    if (typeof onChange !== 'function') return;
    onChange(normalizeRankScoreGameParams({ ...safe, ...patch }));
  };

  const adjustmentRows = useMemo(() => {
    return participantsSafe.map((p, idx) => {
      const id = String(p?.id ?? idx);
      return {
        id,
        name: String(p?.nickname || ''),
        room: p?.room ?? p?.roomNumber ?? '',
        handicap: Number(p?.handicap || 0),
        value: adjustDraft?.[id] ?? '',
      };
    });
  }, [participantsSafe, adjustDraft]);

  const pairGroupValue = pairGroups.A.join(',');

  const onPairGroupChange = (valueText) => {
    const a = String(valueText || '')
      .split(',')
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));
    const b = [1, 2, 3, 4].filter((n) => !a.includes(n));
    emit({ pairGroups: { A: a, B: b } });
  };

  const onRoomRankSlotChange = (idx, valueText) => {
    const next = Array.isArray(safe.roomRankSlots) ? [...safe.roomRankSlots] : [1, 4];
    const n = Number(valueText);
    next[idx] = Number.isFinite(n) ? n : (idx === 0 ? 1 : 4);
    if (Number(next[0]) === Number(next[1])) {
      next[1 - idx] = ROOM_RANK_SLOT_OPTIONS.find((v) => Number(v) !== Number(next[idx])) || (idx === 0 ? 4 : 1);
    }
    emit({ roomRankSlots: next });
  };

  const commitAdjustment = (id, valueText) => {
    const next = { ...(safe.adjustments || {}) };
    const text = String(valueText ?? '').trim();
    if (text === '' || text === '-') {
      delete next[String(id)];
    } else {
      const n = Number(text);
      if (Number.isFinite(n)) next[String(id)] = n;
    }
    emit({ adjustments: next });
  };

  const setAdjustmentDraft = (id, valueText) => {
    const text = String(valueText ?? '');
    if (!/^-?\d*$/.test(text)) return;
    setAdjustDraft((prev) => ({ ...(prev || {}), [String(id)]: text }));
  };

  const setAdjustmentMinus = (id, rawValue) => {
    const current = String(rawValue ?? '').trim();
    const next = current === '' ? '-' : (current.startsWith('-') ? current : `-${current}`);
    setAdjustmentDraft(id, next);
  };

  const cancelMinusTimer = (id) => {
    const key = String(id);
    const timer = minusTimersRef.current?.[key];
    if (timer) clearTimeout(timer);
    if (minusTimersRef.current) delete minusTimersRef.current[key];
  };

  const startMinusTimer = (id, rawValue) => {
    const key = String(id);
    cancelMinusTimer(key);
    minusTimersRef.current[key] = setTimeout(() => {
      setAdjustmentMinus(id, rawValue);
    }, LONG_PRESS_MS);
  };

  return (
    <div style={boxStyle}>
      <div style={titleStyle}>대회 순위 점수 게임 설정</div>

      <div style={gridStyle}>
        <label style={labelStyle}>
          <span style={fieldLabelStyle}>순위 산출 기준</span>
          <select value={safe.rankingSource} onChange={(e) => emit({ rankingSource: e.target.value })} style={selectStyle}>
            <option value="result">결과값 순위(점수-G핸디)</option>
            <option value="adjusted">보정치 반영 순위(점수-G핸디+보정치)</option>
            <option value="manual">참가자 직접 순위 입력</option>
          </select>
        </label>

        <label style={labelStyle}>
          <span style={fieldLabelStyle}>게임 점수 방식</span>
          <select value={safe.pointType} onChange={(e) => emit({ pointType: e.target.value })} style={selectStyle}>
            <option value="converted">환산점수(N-rank+1)</option>
            <option value="rank">순위점수(rank)</option>
          </select>
        </label>

        <label style={labelStyle}>
          <span style={fieldLabelStyle}>게임 방식</span>
          <select value={safe.gameType} onChange={(e) => emit({ gameType: e.target.value })} style={selectStyle}>
            <option value="randomPair">포볼 게임</option>
            <option value="room">방대방 게임</option>
          </select>
        </label>

        <label style={labelStyle}>
          <span style={fieldLabelStyle}>계산 방식</span>
          <select value={safe.calculationMethod} onChange={(e) => emit({ calculationMethod: e.target.value })} style={selectStyle}>
            {CALC_METHOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>

      {safe.gameType === 'room' && (
        <div style={pairBoxStyle}>
          <div style={pairTitleStyle}>방대방 계산 기준</div>
          <div style={roomRankGridStyle}>
            <label style={labelStyle}>
              <span style={fieldLabelStyle}>기준 순위 1</span>
              <select value={safe.roomRankSlots?.[0] || 1} onChange={(e) => onRoomRankSlotChange(0, e.target.value)} style={selectStyle}>
                {ROOM_RANK_SLOT_OPTIONS.map((n) => <option key={`room-rank-a-${n}`} value={n}>{n}위</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              <span style={fieldLabelStyle}>기준 순위 2</span>
              <select value={safe.roomRankSlots?.[1] || 4} onChange={(e) => onRoomRankSlotChange(1, e.target.value)} style={selectStyle}>
                {ROOM_RANK_SLOT_OPTIONS.map((n) => <option key={`room-rank-b-${n}`} value={n}>{n}위</option>)}
              </select>
            </label>
          </div>
          <div style={smallTextStyle}>
            방 안에서 전체 순위가 좋은 순서로 1~4위를 정렬한 뒤, 선택한 두 명의 점수로 계산합니다. 빼기/나누기는 큰수 기준으로 계산합니다.
          </div>
        </div>
      )}

      {safe.gameType === 'randomPair' && (
        <div style={pairBoxStyle}>
          <div style={pairTitleStyle}>포볼 그룹 구성</div>
          <label style={labelStyle}>
            <span style={fieldLabelStyle}>A그룹 조합</span>
            <select value={pairGroupValue} onChange={(e) => onPairGroupChange(e.target.value)} style={selectStyle}>
              {PAIR_GROUP_OPTIONS.map((arr) => {
                const b = [1, 2, 3, 4].filter((n) => !arr.includes(n));
                const valueText = arr.join(',');
                return (
                  <option key={valueText} value={valueText}>
                    A그룹 {arr.map((n) => `${n}조`).join('+')} / B그룹 {b.map((n) => `${n}조`).join('+')}
                  </option>
                );
              })}
            </select>
          </label>
          <div style={smallTextStyle}>
            현재 구성: {getRankScorePairGroupLabel(pairGroups, 'A')} ↔ {getRankScorePairGroupLabel(pairGroups, 'B')}
          </div>
        </div>
      )}

      {safe.rankingSource === 'adjusted' && (
        <div style={adjustBoxStyle}>
          <div style={titleSubStyle}>참가자별 보정치</div>
          <div style={smallTextStyle}>+/- 값을 입력합니다. 비워두면 0으로 계산합니다.</div>
          <div style={adjustListStyle}>
            {adjustmentRows.map((row) => (
              <div key={row.id} style={adjustRowStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={nameStyle}>{row.name || '-'}</div>
                  <div style={smallTextStyle}>G핸디 {row.handicap}</div>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={row.value}
                  onChange={(e) => setAdjustmentDraft(row.id, e.target.value)}
                  onBlur={(e) => commitAdjustment(row.id, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  onPointerDown={() => startMinusTimer(row.id, row.value)}
                  onPointerUp={() => cancelMinusTimer(row.id)}
                  onPointerCancel={() => cancelMinusTimer(row.id)}
                  onPointerLeave={() => cancelMinusTimer(row.id)}
                  onTouchStart={() => startMinusTimer(row.id, row.value)}
                  onTouchEnd={() => cancelMinusTimer(row.id)}
                  onTouchCancel={() => cancelMinusTimer(row.id)}
                  placeholder="0"
                  style={adjustInputStyle}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const boxStyle = { marginTop: 10, padding: 12, border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', display: 'grid', gap: 12, boxSizing: 'border-box' };
const titleStyle = { fontWeight: 800, color: '#111827' };
const titleSubStyle = { fontWeight: 800, color: '#183153', marginBottom: 4 };
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 };
const labelStyle = { display: 'grid', gap: 6, minWidth: 0 };
const fieldLabelStyle = { fontSize: 13, fontWeight: 700, color: '#344054' };
const selectStyle = { width: '100%', height: 42, borderRadius: 10, border: '1px solid #d0d7de', padding: '0 10px', background: '#fff', boxSizing: 'border-box' };
const smallTextStyle = { fontSize: 12, color: '#667085', lineHeight: 1.35 };
const pairBoxStyle = { border: '1px solid #eef2f7', borderRadius: 12, padding: 10, display: 'grid', gap: 8, background: '#fbfdff' };
const pairTitleStyle = { fontSize: 13, fontWeight: 800, color: '#183153' };
const roomRankGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 };
const adjustBoxStyle = { border: '1px solid #eef2f7', borderRadius: 12, padding: 10, display: 'grid', gap: 8 };
const adjustListStyle = { display: 'grid', gap: 6, maxHeight: 260, overflow: 'auto', paddingRight: 2 };
const adjustRowStyle = { display: 'grid', gridTemplateColumns: '1fr 88px', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid #f1f5f9', borderRadius: 10, background: '#fff' };
const nameStyle = { fontSize: 13, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const adjustInputStyle = { width: '100%', height: 36, border: '1px solid #d0d7de', borderRadius: 8, textAlign: 'center', boxSizing: 'border-box' };
