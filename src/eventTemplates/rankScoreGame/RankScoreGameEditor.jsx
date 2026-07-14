// /src/eventTemplates/rankScoreGame/RankScoreGameEditor.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getRankScorePairGroupLabel, normalizeRankScoreGameParams, normalizeRankScorePairGroups } from '../../events/rankScoreGame';

const LONG_PRESS_MS = 450;
const CALC_METHOD_OPTIONS = [
  { value: 'add', label: '더하기' },
  { value: 'subtract', label: '빼기' },
  { value: 'multiply', label: '곱하기' },
  { value: 'divide', label: '나누기' },
];

const ROOM_RANK_SLOT_OPTIONS = [1, 2, 3, 4];

function toggleGroup(list = [], groupNo) {
  const n = Number(groupNo);
  const set = new Set((Array.isArray(list) ? list : []).map(Number).filter(Number.isFinite));
  if (set.has(n)) set.delete(n);
  else set.add(n);
  return Array.from(set).sort((a, b) => a - b);
}

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

  const emitPairGroup = (side, groupNo) => {
    const nextGroups = { ...pairGroups, [side]: toggleGroup(pairGroups?.[side], groupNo) };
    const other = side === 'A' ? 'B' : 'A';
    const sideSet = new Set(nextGroups[side]);
    nextGroups[other] = (nextGroups[other] || []).filter((g) => !sideSet.has(Number(g)));
    if (!nextGroups[other].length) nextGroups[other] = [1, 2, 3, 4].filter((g) => !sideSet.has(g));
    emit({ pairGroups: nextGroups });
  };

  const emitSelfPickSide = (valueText) => {
    const side = valueText === 'B' ? 'B' : (valueText === 'both' ? 'both' : 'A');
    emit({ selfPickSide: side, selfPickerSide: side, pickSide: side });
  };

  const emitDirectExcludeSameGroup = (checked) => {
    emit({
      directExcludeSameGroupTargets: !!checked,
      excludeSameGroupTargets: !!checked,
      excludeOwnGroupTargets: !!checked,
      allowSameGroupTargets: !checked,
      targetScope: checked ? 'otherGroup' : 'all',
      opponentScope: checked ? 'otherGroup' : 'all',
    });
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

  const onRoomAddTargetChange = (valueText) => {
    emit({ roomAddTarget: valueText === 'slots' ? 'slots' : 'all' });
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
            <option value="directPair">포볼 게임(선택)</option>
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
          {safe.calculationMethod === 'add' && (
            <label style={labelStyle}>
              <span style={fieldLabelStyle}>더하기 대상</span>
              <select value={safe.roomAddTarget === 'slots' ? 'slots' : 'all'} onChange={(e) => onRoomAddTargetChange(e.target.value)} style={selectStyle}>
                <option value="all">방인원 전체</option>
                <option value="slots">기준순위 2명</option>
              </select>
            </label>
          )}
          {(safe.calculationMethod !== 'add' || safe.roomAddTarget === 'slots') && (
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
          )}
        </div>
      )}

      {safe.gameType === 'randomPair' && (
        <div style={pairBoxStyle}>
          <div style={pairTitleStyle}>포볼 그룹 구성</div>

          <label style={labelStyle}>
            <span style={fieldLabelStyle}>포볼선택 가능 그룹</span>
            <select value={safe.selfPickSide || 'A'} onChange={(e) => emitSelfPickSide(e.target.value)} style={selectStyle}>
              <option value="A">A그룹만 포볼선택</option>
              <option value="B">B그룹만 포볼선택</option>
            </select>
          </label>

          {['A', 'B'].map((side) => (
            <div key={`rank-pair-side-${side}`}>
              <div style={pairTitleStyle}>{side}그룹</div>
              <div style={groupButtonWrapStyle}>
                {[1, 2, 3, 4].map((g) => {
                  const active = (pairGroups?.[side] || []).includes(g);
                  return (
                    <button
                      key={`rank-pair-${side}-${g}`}
                      type="button"
                      onClick={() => emitPairGroup(side, g)}
                      style={{
                        ...groupButtonStyle,
                        border: active ? '1px solid #2563eb' : '1px solid #d7dfec',
                        background: active ? '#eaf2ff' : '#fff',
                        color: active ? '#1d4ed8' : '#344054',
                      }}
                    >
                      {g}조
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={smallTextStyle}>
            현재 구성: {getRankScorePairGroupLabel(pairGroups, 'A')} ↔ {getRankScorePairGroupLabel(pairGroups, 'B')}
          </div>
        </div>
      )}

      {safe.gameType === 'directPair' && (
        <div style={pairBoxStyle}>
          <div style={pairTitleStyle}>포볼 게임(선택) 설정</div>
          <label style={checkRowStyle}>
            <input
              type="checkbox"
              checked={safe.directExcludeSameGroupTargets !== false}
              onChange={(e) => emitDirectExcludeSameGroup(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            참가자가 속한 조를 제외한 조만 오픈
          </label>
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
const groupButtonWrapStyle = { display: 'flex', gap: 6, flexWrap: 'wrap' };
const groupButtonStyle = { borderRadius: 999, padding: '7px 10px', fontSize: 12, fontWeight: 900 };
const checkRowStyle = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 900, color: '#16243f' };
const roomRankGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 };
const adjustBoxStyle = { border: '1px solid #eef2f7', borderRadius: 12, padding: 10, display: 'grid', gap: 8 };
const adjustListStyle = { display: 'grid', gap: 6, maxHeight: 260, overflow: 'auto', paddingRight: 2 };
const adjustRowStyle = { display: 'grid', gridTemplateColumns: '1fr 88px', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid #f1f5f9', borderRadius: 10, background: '#fff' };
const nameStyle = { fontSize: 13, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const adjustInputStyle = { width: '100%', height: 36, border: '1px solid #d0d7de', borderRadius: 8, textAlign: 'center', boxSizing: 'border-box' };
