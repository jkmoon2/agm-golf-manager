// /src/eventTemplates/hiddenEvent/HiddenEventEditor.jsx

import React, { useEffect, useMemo, useState } from 'react';
import { normalizeHiddenEventParams } from '../../events/hiddenEvent';

const boxStyle = { border: '1px solid #e5eaf2', borderRadius: 14, padding: 12, background: '#fbfdff', marginTop: 10, width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden' };
const labelStyle = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 800, color: '#25344d', minWidth: 0 };
const inputStyle = { width: '100%', minWidth: 0, height: 34, border: '1px solid #d7dfec', borderRadius: 9, padding: '0 10px', fontSize: 13, background: '#fff', boxSizing: 'border-box' };
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 10, width: '100%', maxWidth: '100%', boxSizing: 'border-box' };
const fourRowStyle = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 10, width: '100%', maxWidth: '100%', boxSizing: 'border-box' };
const twoRowStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 10, width: '100%', maxWidth: '100%', boxSizing: 'border-box' };
const helpStyle = { fontSize: 12, color: '#667085', lineHeight: 1.45, marginTop: 8, wordBreak: 'keep-all' };

function toggleGroup(list = [], groupNo) {
  const n = Number(groupNo);
  const set = new Set((Array.isArray(list) ? list : []).map(Number).filter(Number.isFinite));
  if (set.has(n)) set.delete(n);
  else set.add(n);
  return Array.from(set).sort((a, b) => a - b);
}

function getModeValue(cfg) {
  if (cfg.mode === 'fourball') return cfg.fourballMode === 'select' ? 'fourball-select' : (cfg.fourballMode === 'self' ? 'fourball-self' : 'fourball-random');
  return 'personal';
}

function rawStepValue(raw, key, fallback) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const steps = (src.handicapSteps && typeof src.handicapSteps === 'object') ? src.handicapSteps : {};
  if (Object.prototype.hasOwnProperty.call(steps, key)) return steps[key] == null ? '' : String(steps[key]);
  return String(fallback ?? '');
}

function rawPointValue(raw, key, fallback) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const points = (src.personalPoints && typeof src.personalPoints === 'object') ? src.personalPoints : ((src.points && typeof src.points === 'object') ? src.points : {});
  if (Object.prototype.hasOwnProperty.call(points, key)) return points[key] == null ? '' : String(points[key]);
  return String(fallback ?? '');
}

function normalizeLimitMap(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  Object.entries(src).forEach(([key, value]) => {
    const n = Number(value);
    if (String(key || '') && Number.isFinite(n) && n >= 0) out[String(key)] = Math.floor(n);
  });
  return out;
}

export default function HiddenEventEditor({ value, onChange, participants = [] }) {
  const cfg = normalizeHiddenEventParams(value);
  const modeValue = getModeValue(cfg);
  const [stepText, setStepText] = useState(() => ({
    '1-2': rawStepValue(value, '1-2', cfg.handicapSteps['1-2']),
    '2-3': rawStepValue(value, '2-3', cfg.handicapSteps['2-3']),
    '3-4': rawStepValue(value, '3-4', cfg.handicapSteps['3-4']),
    same: rawStepValue(value, 'same', cfg.handicapSteps.same),
  }));
  const [pointText, setPointText] = useState(() => ({
    win: rawPointValue(value, 'win', cfg.personalPoints.win),
    lose: rawPointValue(value, 'lose', cfg.personalPoints.lose),
    draw: rawPointValue(value, 'draw', cfg.personalPoints.draw),
    mutual: rawPointValue(value, 'mutual', cfg.personalPoints.mutual),
    upward: rawPointValue(value, 'upward', cfg.personalPoints.upward),
    downward: rawPointValue(value, 'downward', cfg.personalPoints.downward),
  }));
  const [limitText, setLimitText] = useState(() => {
    const map = normalizeLimitMap((value && (value.targetLimits || value.receiveLimits || value.targetReceiveLimits)) || cfg.targetLimits);
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [String(k), String(v)]));
  });

  const stepSyncKey = useMemo(() => JSON.stringify((value && value.handicapSteps) || {}), [value]);
  useEffect(() => {
    setStepText({
      '1-2': rawStepValue(value, '1-2', cfg.handicapSteps['1-2']),
      '2-3': rawStepValue(value, '2-3', cfg.handicapSteps['2-3']),
      '3-4': rawStepValue(value, '3-4', cfg.handicapSteps['3-4']),
      same: rawStepValue(value, 'same', cfg.handicapSteps.same),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepSyncKey]);

  const pointSyncKey = useMemo(() => JSON.stringify((value && (value.personalPoints || value.points)) || {}), [value]);
  useEffect(() => {
    setPointText({
      win: rawPointValue(value, 'win', cfg.personalPoints.win),
      lose: rawPointValue(value, 'lose', cfg.personalPoints.lose),
      draw: rawPointValue(value, 'draw', cfg.personalPoints.draw),
      mutual: rawPointValue(value, 'mutual', cfg.personalPoints.mutual),
      upward: rawPointValue(value, 'upward', cfg.personalPoints.upward),
      downward: rawPointValue(value, 'downward', cfg.personalPoints.downward),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointSyncKey]);

  const limitSyncKey = useMemo(() => JSON.stringify((value && (value.targetLimits || value.receiveLimits || value.targetReceiveLimits)) || {}), [value]);
  useEffect(() => {
    const map = normalizeLimitMap((value && (value.targetLimits || value.receiveLimits || value.targetReceiveLimits)) || cfg.targetLimits);
    setLimitText(Object.fromEntries(Object.entries(map).map(([k, v]) => [String(k), String(v)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitSyncKey]);

  const emit = (patch) => onChange && onChange({ ...cfg, ...patch });
  const emitMode = (nextModeValue) => {
    if (nextModeValue === 'fourball-random') emit({ mode: 'fourball', fourballMode: 'random' });
    else if (nextModeValue === 'fourball-self') emit({ mode: 'fourball', fourballMode: 'self', selfPickSide: cfg.selfPickSide || 'A' });
    else if (nextModeValue === 'fourball-select') emit({ mode: 'fourball', fourballMode: 'select', excludeSameGroupTargets: cfg.excludeSameGroupTargets !== false });
    else emit({ mode: 'personal', fourballMode: 'random' });
  };
  const emitStep = (key, raw) => {
    setStepText((prev) => ({ ...prev, [key]: raw }));
    emit({ handicapSteps: { ...cfg.handicapSteps, [key]: raw === '' ? '' : Number(raw) } });
  };
  const emitPoint = (key, raw) => {
    setPointText((prev) => ({ ...prev, [key]: raw }));
    emit({ personalPoints: { ...cfg.personalPoints, [key]: raw === '' ? '' : Number(raw) } });
  };
  const emitPointType = (valueText) => {
    emit({ pointType: valueText === 'converted' ? 'converted' : 'rank' });
  };
  const emitSelfPickSide = (valueText) => {
    const side = valueText === 'B' ? 'B' : (valueText === 'both' ? 'both' : 'A');
    emit({ selfPickSide: side, selfPickerSide: side, pickSide: side });
  };
  const emitPairGroup = (side, groupNo) => {
    const pairGroups = { ...cfg.pairGroups, [side]: toggleGroup(cfg.pairGroups?.[side], groupNo) };
    const other = side === 'A' ? 'B' : 'A';
    const sideSet = new Set(pairGroups[side]);
    pairGroups[other] = (pairGroups[other] || []).filter((g) => !sideSet.has(Number(g)));
    if (!pairGroups[other].length) pairGroups[other] = [1, 2, 3, 4].filter((g) => !sideSet.has(g));
    emit({ pairGroups });
  };
  const emitLimitMode = (nextMode) => {
    if (nextMode !== 'personal') {
      setLimitText({});
      emit({ targetLimitMode: 'unlimited', targetLimits: {} });
      return;
    }
    emit({ targetLimitMode: 'personal', targetLimits: normalizeLimitMap(limitText) });
  };
  const emitTargetLimit = (participantId, raw) => {
    const pid = String(participantId || '');
    if (!pid) return;
    const nextText = { ...(limitText || {}) };
    if (raw === '' || raw == null) delete nextText[pid];
    else nextText[pid] = String(raw);
    setLimitText(nextText);
    emit({ targetLimitMode: 'personal', targetLimits: normalizeLimitMap(nextText) });
  };

  const emitSameGroupOnly = (checked) => {
    emit({
      sameGroupOnly: !!checked,
      sameGroupTargetOnly: !!checked,
      sameGroupTargetsOnly: !!checked,
      onlySameGroup: !!checked,
      sameGroup: !!checked,
      targetScope: checked ? 'sameGroup' : 'all',
      opponentScope: checked ? 'sameGroup' : 'all',
    });
  };

  const emitExcludeSameGroupTargets = (checked) => {
    emit({
      excludeSameGroupTargets: !!checked,
      excludeOwnGroupTargets: !!checked,
      allowSameGroupTargets: !checked,
      targetScope: checked ? 'otherGroup' : 'all',
      opponentScope: checked ? 'otherGroup' : 'all',
    });
  };

  const limitModeValue = cfg.targetLimitMode === 'personal' || Object.keys(cfg.targetLimits || {}).length ? 'personal' : 'unlimited';
  const participantList = Array.isArray(participants) ? participants : [];

  return (
    <div style={boxStyle}>
      <div style={{ fontSize: 15, fontWeight: 900, color: '#16243f', marginBottom: 8 }}>히든 이벤트 설정</div>

      <label style={labelStyle}>방식
        <select style={inputStyle} value={modeValue} onChange={(e) => emitMode(e.target.value)}>
          <option value="personal">개인 · 비밀 1대1 지목전</option>
          <option value="fourball-random">포볼 · 운영자 무작위 2인팀</option>
          <option value="fourball-self">포볼 · 참가자 버튼 무작위 2인팀</option>
          <option value="fourball-select">포볼 · 참가자 직접 2인팀 지목</option>
        </select>
      </label>

      <label style={{ ...labelStyle, marginTop: 10 }}>공개 상태
        <select style={inputStyle} value={cfg.revealed ? 'open' : 'hidden'} onChange={(e) => emit({ revealed: e.target.value === 'open' })}>
          <option value="hidden">비공개</option>
          <option value="open">공개</option>
        </select>
      </label>

      {cfg.mode === 'personal' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, fontWeight: 900, color: '#16243f' }}>
          <input
            type="checkbox"
            checked={!!cfg.sameGroupOnly}
            onChange={(e) => emitSameGroupOnly(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          같은 조 참가자만 지목 허용
        </label>
      )}

      {cfg.mode === 'fourball' && cfg.fourballMode === 'select' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, fontWeight: 900, color: '#16243f' }}>
          <input
            type="checkbox"
            checked={cfg.excludeSameGroupTargets !== false}
            onChange={(e) => emitExcludeSameGroupTargets(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          참가자가 속한 조를 제외한 나머지 조만 오픈
        </label>
      )}

      {cfg.mode === 'personal' && (
        <div style={{ marginTop: 12, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#16376c' }}>개인 1대1 점수 설정</div>
          <div style={twoRowStyle}>
            <label style={labelStyle}>승리 점수
              <input style={inputStyle} type="number" inputMode="decimal" value={pointText.win} onChange={(e) => emitPoint('win', e.target.value)} />
            </label>
            <label style={labelStyle}>패배 점수
              <input style={inputStyle} type="number" inputMode="decimal" value={pointText.lose} onChange={(e) => emitPoint('lose', e.target.value)} />
            </label>
            <label style={labelStyle}>비김 점수
              <input style={inputStyle} type="number" inputMode="decimal" value={pointText.draw} onChange={(e) => emitPoint('draw', e.target.value)} />
            </label>
            <label style={labelStyle}>맞지목 점수
              <input style={inputStyle} type="number" inputMode="decimal" value={pointText.mutual} onChange={(e) => emitPoint('mutual', e.target.value)} />
            </label>
            <label style={labelStyle}>상향 선택
              <input style={inputStyle} type="number" inputMode="decimal" value={pointText.upward} onChange={(e) => emitPoint('upward', e.target.value)} />
            </label>
            <label style={labelStyle}>하향 선택
              <input style={inputStyle} type="number" inputMode="decimal" value={pointText.downward} onChange={(e) => emitPoint('downward', e.target.value)} />
            </label>
          </div>

          <div style={helpStyle}>
            *상향선택 : 높은조→낮은조 선택후 승리(가산)<br />
            *하향선택 : 낮은조→높은조 선택후 패배(감산)
          </div>

          <div style={{ fontSize: 13, fontWeight: 900, color: '#16376c', marginTop: 14 }}>조간 추가 핸디</div>
          <div style={rowStyle}>
            <label style={labelStyle}>1조~2조
              <input style={inputStyle} type="number" inputMode="numeric" value={stepText['1-2']} onChange={(e) => emitStep('1-2', e.target.value)} />
            </label>
            <label style={labelStyle}>2조~3조
              <input style={inputStyle} type="number" inputMode="numeric" value={stepText['2-3']} onChange={(e) => emitStep('2-3', e.target.value)} />
            </label>
            <label style={labelStyle}>3조~4조
              <input style={inputStyle} type="number" inputMode="numeric" value={stepText['3-4']} onChange={(e) => emitStep('3-4', e.target.value)} />
            </label>
          </div>

          <div style={{ fontSize: 13, fontWeight: 900, color: '#16376c', marginTop: 14 }}>지목 받는 횟수 제한</div>
          <label style={{ ...labelStyle, marginTop: 8 }}>제한 방식
            <select style={inputStyle} value={limitModeValue} onChange={(e) => emitLimitMode(e.target.value)}>
              <option value="unlimited">무제한</option>
              <option value="personal">개인별 제한</option>
            </select>
          </label>

          {limitModeValue === 'personal' && (
            <div style={{ marginTop: 10, border: '1px solid #e5eaf2', borderRadius: 12, background: '#fff', padding: 8, maxHeight: 220, overflow: 'auto' }}>
              {!participantList.length && <div style={helpStyle}>참가자 목록이 없습니다.</div>}
              {participantList.map((p) => {
                const pid = String(p?.id ?? '');
                if (!pid) return null;
                const raw = Object.prototype.hasOwnProperty.call(limitText || {}, pid) ? String(limitText[pid] ?? '') : '';
                return (
                  <div key={`hidden-target-limit-${pid}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 2px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: '#16243f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nickname || '-'}</div>
                      <div style={{ fontSize: 11, color: '#667085', marginTop: 2 }}>{p.room ? `${p.room}번방 · ` : ''}{p.group ? `${p.group}조` : ''}</div>
                    </div>
                    <input
                      style={{ ...inputStyle, width: 104, height: 32, textAlign: 'center' }}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="무제한"
                      value={raw}
                      onChange={(e) => emitTargetLimit(pid, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {cfg.mode === 'fourball' && cfg.fourballMode === 'select' && (
        <div style={{ marginTop: 12, minWidth: 0 }}>
          <label style={labelStyle}>게임점수방식
            <select style={inputStyle} value={cfg.pointType === 'converted' ? 'converted' : 'rank'} onChange={(e) => emitPointType(e.target.value)}>
              <option value="rank">순위점수</option>
              <option value="converted">환산점수</option>
            </select>
          </label>

          <div style={{ fontSize: 13, fontWeight: 900, color: '#16376c', marginTop: 14 }}>조간 추가 핸디</div>
          <div style={fourRowStyle}>
            <label style={labelStyle}>1조~2조
              <input style={inputStyle} type="number" inputMode="numeric" value={stepText['1-2']} onChange={(e) => emitStep('1-2', e.target.value)} />
            </label>
            <label style={labelStyle}>2조~3조
              <input style={inputStyle} type="number" inputMode="numeric" value={stepText['2-3']} onChange={(e) => emitStep('2-3', e.target.value)} />
            </label>
            <label style={labelStyle}>3조~4조
              <input style={inputStyle} type="number" inputMode="numeric" value={stepText['3-4']} onChange={(e) => emitStep('3-4', e.target.value)} />
            </label>
            <label style={labelStyle}>같은조
              <input style={inputStyle} type="number" inputMode="numeric" value={stepText.same} onChange={(e) => emitStep('same', e.target.value)} />
            </label>
          </div>
        </div>
      )}

      {cfg.mode === 'fourball' && cfg.fourballMode !== 'select' && (
        <div style={{ marginTop: 12, minWidth: 0 }}>
          <label style={labelStyle}>게임점수방식
            <select style={inputStyle} value={cfg.pointType === 'converted' ? 'converted' : 'rank'} onChange={(e) => emitPointType(e.target.value)}>
              <option value="rank">순위점수</option>
              <option value="converted">환산점수</option>
            </select>
          </label>

          {cfg.fourballMode === 'self' && (
            <label style={{ ...labelStyle, marginTop: 10 }}>포볼선택 가능 그룹
              <select style={inputStyle} value={cfg.selfPickSide || 'A'} onChange={(e) => emitSelfPickSide(e.target.value)}>
                <option value="A">A그룹만 포볼선택</option>
                <option value="B">B그룹만 포볼선택</option>
              </select>
            </label>
          )}

          <div style={{ fontSize: 13, fontWeight: 900, color: '#16376c', marginTop: 14 }}>포볼 그룹 구성</div>
          {['A', 'B'].map((side) => (
            <div key={side} style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#344054', marginBottom: 5 }}>{side}그룹</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[1, 2, 3, 4].map((g) => {
                  const active = (cfg.pairGroups?.[side] || []).includes(g);
                  return (
                    <button
                      key={`${side}-${g}`}
                      type="button"
                      onClick={() => emitPairGroup(side, g)}
                      style={{
                        border: active ? '1px solid #2563eb' : '1px solid #d7dfec',
                        background: active ? '#eaf2ff' : '#fff',
                        color: active ? '#1d4ed8' : '#344054',
                        borderRadius: 999,
                        padding: '7px 10px',
                        fontSize: 12,
                        fontWeight: 900,
                      }}
                    >
                      {g}조
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={helpStyle}>
            {cfg.fourballMode === 'self'
              ? '참가자가 Player STEP3에서 포볼선택 버튼을 누른 뒤 저장해야 A그룹 1명과 B그룹 1명이 무작위로 묶입니다. 위 설정에서 선택한 그룹만 포볼선택 버튼을 사용할 수 있습니다.'
              : 'A그룹 참가자 1명과 B그룹 참가자 1명을 운영자가 무작위로 묶어 2인 1팀을 만듭니다.'}
          </div>
        </div>
      )}
    </div>
  );
}
