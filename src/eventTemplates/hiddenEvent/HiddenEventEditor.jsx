// /src/eventTemplates/hiddenEvent/HiddenEventEditor.jsx

import React, { useEffect, useMemo, useState } from 'react';
import { normalizeHiddenEventParams } from '../../events/hiddenEvent';

const boxStyle = { border: '1px solid #e5eaf2', borderRadius: 14, padding: 12, background: '#fbfdff', marginTop: 10, width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden' };
const labelStyle = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 800, color: '#25344d', minWidth: 0 };
const inputStyle = { width: '100%', minWidth: 0, height: 34, border: '1px solid #d7dfec', borderRadius: 9, padding: '0 10px', fontSize: 13, background: '#fff', boxSizing: 'border-box' };
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 10, width: '100%', maxWidth: '100%', boxSizing: 'border-box' };
const helpStyle = { fontSize: 12, color: '#667085', lineHeight: 1.45, marginTop: 8, wordBreak: 'keep-all' };

function toggleGroup(list = [], groupNo) {
  const n = Number(groupNo);
  const set = new Set((Array.isArray(list) ? list : []).map(Number).filter(Number.isFinite));
  if (set.has(n)) set.delete(n);
  else set.add(n);
  return Array.from(set).sort((a, b) => a - b);
}

function getModeValue(cfg) {
  if (cfg.mode === 'fourball') return cfg.fourballMode === 'self' ? 'fourball-self' : 'fourball-random';
  return 'personal';
}

function rawStepValue(raw, key, fallback) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const steps = (src.handicapSteps && typeof src.handicapSteps === 'object') ? src.handicapSteps : {};
  if (Object.prototype.hasOwnProperty.call(steps, key)) return steps[key] == null ? '' : String(steps[key]);
  return String(fallback ?? '');
}

export default function HiddenEventEditor({ value, onChange }) {
  const cfg = normalizeHiddenEventParams(value);
  const modeValue = getModeValue(cfg);
  const [stepText, setStepText] = useState(() => ({
    '1-2': rawStepValue(value, '1-2', cfg.handicapSteps['1-2']),
    '2-3': rawStepValue(value, '2-3', cfg.handicapSteps['2-3']),
    '3-4': rawStepValue(value, '3-4', cfg.handicapSteps['3-4']),
  }));

  const stepSyncKey = useMemo(() => JSON.stringify((value && value.handicapSteps) || {}), [value]);
  useEffect(() => {
    setStepText({
      '1-2': rawStepValue(value, '1-2', cfg.handicapSteps['1-2']),
      '2-3': rawStepValue(value, '2-3', cfg.handicapSteps['2-3']),
      '3-4': rawStepValue(value, '3-4', cfg.handicapSteps['3-4']),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepSyncKey]);

  const emit = (patch) => onChange && onChange({ ...cfg, ...patch });
  const emitMode = (nextModeValue) => {
    if (nextModeValue === 'fourball-random') emit({ mode: 'fourball', fourballMode: 'random' });
    else if (nextModeValue === 'fourball-self') emit({ mode: 'fourball', fourballMode: 'self' });
    else emit({ mode: 'personal', fourballMode: 'random' });
  };
  const emitStep = (key, raw) => {
    setStepText((prev) => ({ ...prev, [key]: raw }));
    emit({ handicapSteps: { ...cfg.handicapSteps, [key]: raw === '' ? '' : Number(raw) } });
  };
  const emitPairGroup = (side, groupNo) => {
    const pairGroups = { ...cfg.pairGroups, [side]: toggleGroup(cfg.pairGroups?.[side], groupNo) };
    const other = side === 'A' ? 'B' : 'A';
    const sideSet = new Set(pairGroups[side]);
    pairGroups[other] = (pairGroups[other] || []).filter((g) => !sideSet.has(Number(g)));
    if (!pairGroups[other].length) pairGroups[other] = [1, 2, 3, 4].filter((g) => !sideSet.has(g));
    emit({ pairGroups });
  };

  return (
    <div style={boxStyle}>
      <div style={{ fontSize: 15, fontWeight: 900, color: '#16243f', marginBottom: 8 }}>히든 이벤트 설정</div>

      <label style={labelStyle}>방식
        <select style={inputStyle} value={modeValue} onChange={(e) => emitMode(e.target.value)}>
          <option value="personal">개인 · 비밀 1대1 지목전</option>
          <option value="fourball-random">포볼 · 운영자 무작위 2인팀</option>
          <option value="fourball-self">포볼 · 참가자 직접 2인팀 선택</option>
        </select>
      </label>

      <label style={{ ...labelStyle, marginTop: 10 }}>공개 상태
        <select style={inputStyle} value={cfg.revealed ? 'open' : 'hidden'} onChange={(e) => emit({ revealed: e.target.value === 'open' })}>
          <option value="hidden">비공개</option>
          <option value="open">공개</option>
        </select>
      </label>

      {cfg.mode === 'personal' && (
        <div style={{ marginTop: 12, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#16376c' }}>조 간 추가 G핸디</div>
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
          <div style={helpStyle}>
            낮은 번호 조가 높은 번호 조를 선택하면 본인 G핸디가 차감되고, 높은 번호 조가 낮은 번호 조를 선택하면 본인 G핸디가 추가됩니다. 건너뛰는 조는 구간값을 합산합니다.
          </div>
        </div>
      )}

      {cfg.mode === 'fourball' && cfg.fourballMode !== 'self' && (
        <div style={{ marginTop: 12, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#16376c' }}>포볼 그룹 구성</div>
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
          <label style={{ ...labelStyle, marginTop: 10 }}>무작위 시드값
            <input style={inputStyle} value={cfg.randomSeed} onChange={(e) => emit({ randomSeed: e.target.value })} placeholder="비워두면 매번 새 배정" />
          </label>
          <div style={helpStyle}>A그룹 참가자 1명과 B그룹 참가자 1명을 무작위로 묶어 2인 1팀을 만듭니다.</div>
        </div>
      )}

      {cfg.mode === 'fourball' && cfg.fourballMode === 'self' && (
        <div style={helpStyle}>
          참가자가 Player STEP3에서 비밀리에 팀원을 직접 선택합니다. 운영자가 공개하기 전까지 전체 선택 결과는 숨김 처리됩니다.
        </div>
      )}
    </div>
  );
}
