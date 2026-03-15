// /src/eventTemplates/bingo/BingoEditor.jsx

import React, { useMemo } from 'react';
import { defaultBingoParams, normalizeBingoSelectedHoles } from '../../events/bingo';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

function summaryHoles(selectedHoles) {
  return `${selectedHoles.length}/16개 · ${selectedHoles.map((n) => `${n}홀`).join(', ')}`;
}

export default function BingoEditor({
  variant = 'create',
  value,
  onChange,
}) {
  const safe = useMemo(() => {
    const base = defaultBingoParams();
    const src = value && typeof value === 'object' ? value : {};
    return {
      ...base,
      ...src,
      selectedHoles: normalizeBingoSelectedHoles(src.selectedHoles),
      sharedBoardInRoom: !!src.sharedBoardInRoom,
    };
  }, [value]);

  const emit = (next) => {
    if (typeof onChange === 'function') onChange(next);
  };

  const toggleHole = (holeNo) => {
    const has = safe.selectedHoles.includes(holeNo);
    if (has) {
      const next = safe.selectedHoles.filter((n) => n !== holeNo);
      emit({ ...safe, selectedHoles: normalizeBingoSelectedHoles(next) });
      return;
    }
    if (safe.selectedHoles.length >= 16) return;
    emit({ ...safe, selectedHoles: [...safe.selectedHoles, holeNo] });
  };

  const resetDefault = () => {
    emit({ ...safe, selectedHoles: defaultBingoParams().selectedHoles });
  };

  return (
    <div style={box}>
      <div style={titleRow}>
        <div style={{ fontWeight: 700 }}>빙고 이벤트 설정</div>
        <div style={badge}>{variant === 'edit' ? '수정' : '생성'}</div>
      </div>

      <div style={noticeBox}>
        <div>• 18홀 중 16개 홀을 선택합니다. (나머지 2개 홀 제외)</div>
        <div>• -1/-2 = ♡, 0 = ○ 로 표시됩니다.</div>
        <div>• 같은 방 4명이 같은 빙고판을 쓰려면 ‘방 공통 입력’을 켜주세요.</div>
      </div>

      <div style={sectionBox}>
        <div style={sectionHead}>
          <div>
            <div style={sectionTitle}>사용 홀 선택</div>
            <div style={sectionSummary}>{summaryHoles(safe.selectedHoles)}</div>
          </div>
          <button type="button" onClick={resetDefault} style={resetBtn}>기본값</button>
        </div>

        <div style={chipWrap}>
          {HOLES.map((holeNo) => {
            const active = safe.selectedHoles.includes(holeNo);
            const disabled = !active && safe.selectedHoles.length >= 16;
            return (
              <button
                key={holeNo}
                type="button"
                onClick={() => toggleHole(holeNo)}
                disabled={disabled}
                style={{ ...chip, ...(active ? chipActive : null), ...(disabled ? chipDisabled : null) }}
              >
                {holeNo}홀
              </button>
            );
          })}
        </div>
      </div>

      <div style={sectionBox}>
        <div style={sectionTitle}>빙고판 입력 방식</div>
        <div style={toggleRow}>
          <button
            type="button"
            onClick={() => emit({ ...safe, sharedBoardInRoom: false })}
            style={{ ...toggleBtn, ...(!safe.sharedBoardInRoom ? toggleBtnActive : null) }}
          >
            각자 입력
          </button>
          <button
            type="button"
            onClick={() => emit({ ...safe, sharedBoardInRoom: true })}
            style={{ ...toggleBtn, ...(safe.sharedBoardInRoom ? toggleBtnActive : null) }}
          >
            방 공통 입력
          </button>
        </div>
      </div>
    </div>
  );
}

const box = {
  display: 'grid',
  gap: 10,
  padding: 12,
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  background: '#f8fafc',
};
const titleRow = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};
const badge = {
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 999,
  background: '#e0f2fe',
  color: '#0369a1',
  fontWeight: 700,
};
const noticeBox = {
  display: 'grid',
  gap: 4,
  padding: 10,
  borderRadius: 10,
  border: '1px solid #dbeafe',
  background: '#eff6ff',
  fontSize: 12,
  color: '#1e3a8a',
  lineHeight: 1.5,
};
const sectionBox = {
  display: 'grid',
  gap: 10,
  padding: 12,
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  background: '#fff',
};
const sectionHead = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};
const sectionTitle = {
  fontWeight: 700,
  fontSize: 14,
  color: '#0f172a',
};
const sectionSummary = {
  marginTop: 2,
  fontSize: 12,
  color: '#64748b',
  lineHeight: 1.4,
};
const chipWrap = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 8,
};
const chip = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#0f172a',
  borderRadius: 10,
  padding: '10px 0',
  fontWeight: 700,
  cursor: 'pointer',
};
const chipActive = {
  borderColor: '#2563eb',
  background: '#dbeafe',
  color: '#1d4ed8',
};
const chipDisabled = {
  opacity: 0.45,
  cursor: 'not-allowed',
};
const resetBtn = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  borderRadius: 10,
  padding: '8px 12px',
  fontWeight: 600,
  cursor: 'pointer',
};
const toggleRow = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
};
const toggleBtn = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#0f172a',
  borderRadius: 10,
  padding: '12px 10px',
  fontWeight: 700,
  cursor: 'pointer',
};
const toggleBtnActive = {
  borderColor: '#16a34a',
  background: '#dcfce7',
  color: '#166534',
};
