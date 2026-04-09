// /src/eventTemplates/bingo/BingoEditor.jsx

import React, { useMemo, useState } from 'react';
import { defaultBingoParams, isValidBingoSelectedHoles, normalizeBingoSelectedHoles, normalizeBingoSpecialZones, normalizeBingoScoreHoleCount } from '../../events/bingo';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const POSITIONS = Array.from({ length: 16 }, (_, i) => i + 1);

function getSummary(selectedHoles) {
  const count = selectedHoles.length;
  if (count === 16) return '16개 선택 완료';
  if (count > 16) return `${count}개 선택 · ${count - 16}개 더 해제`;
  return `${count}개 선택`;
}

export default function BingoEditor({ value, onChange }) {
  const safe = useMemo(() => {
    const base = defaultBingoParams();
    const src = value && typeof value === 'object' ? value : {};
    return {
      ...base,
      ...src,
      selectedHoles: normalizeBingoSelectedHoles(src.selectedHoles),
      specialZones: normalizeBingoSpecialZones(src.specialZones),
      inputLocked: !!src.inputLocked,
      scoreHoleCount: normalizeBingoScoreHoleCount(src.scoreHoleCount),
    };
  }, [value]);

  const selectedHoles = safe.selectedHoles;
  const specialZones = safe.specialZones;
  const scoreHoleCount = normalizeBingoScoreHoleCount(safe.scoreHoleCount);
  const [openKey, setOpenKey] = useState('');

  const emit = (next) => {
    if (typeof onChange === 'function') onChange(next);
  };

  const toggleHole = (holeNo) => {
    const has = selectedHoles.includes(holeNo);
    let next;
    if (has) {
      if (selectedHoles.length <= 16) return;
      next = selectedHoles.filter((n) => n !== holeNo);
    } else {
      next = [...selectedHoles, holeNo];
    }
    emit({ ...safe, selectedHoles: normalizeBingoSelectedHoles(next) });
  };

  const toggleSpecialZone = (position) => {
    const has = specialZones.includes(position);
    const next = has ? specialZones.filter((n) => n !== position) : [...specialZones, position];
    emit({ ...safe, specialZones: normalizeBingoSpecialZones(next) });
  };

  return (
    <div style={box}>
      <AccordionBox
        title="사용 홀 선택"
        summary={getSummary(selectedHoles)}
        open={openKey === 'holes'}
        onToggle={() => setOpenKey((prev) => (prev === 'holes' ? '' : 'holes'))}
      >

        <div style={modeWrap}>
          <button
            type="button"
            onClick={() => emit({ ...safe, scoreHoleCount: 16 })}
            style={{ ...modeChip, ...(scoreHoleCount === 16 ? modeChipActive : modeChipInactive) }}
          >
            16홀
          </button>
          <button
            type="button"
            onClick={() => emit({ ...safe, scoreHoleCount: 18 })}
            style={{ ...modeChip, ...(scoreHoleCount === 18 ? modeChipActive : modeChipInactive) }}
          >
            18홀
          </button>
        </div>
        <div style={{ ...countTextWrap, marginTop: -4 }}>
          <span style={countText}>{selectedHoles.length}/18 선택</span>
          <span style={{ ...countText, color: '#177a45' }}>
            {scoreHoleCount === 18 ? '18홀 입력 · 빙고 반영은 선택된 16홀만 적용' : '2개를 해제해 16홀로 맞춰주세요'}
          </span>
        </div>

        <div style={chipWrap}>
          {HOLES.map((holeNo) => {
            const active = selectedHoles.includes(holeNo);
            return (
              <button
                key={holeNo}
                type="button"
                onClick={() => toggleHole(holeNo)}
                style={{ ...chip, ...(active ? chipActive : chipInactive) }}
              >
                {holeNo}홀
              </button>
            );
          })}
        </div>
      </AccordionBox>

      <AccordionBox
        title="Special Zone"
        summary={specialZones.length ? `${specialZones.length}칸 선택` : '선택 없음'}
        open={openKey === 'zones'}
        onToggle={() => setOpenKey((prev) => (prev === 'zones' ? '' : 'zones'))}
      >
        <div style={chipWrap}>
          {POSITIONS.map((position) => {
            const active = specialZones.includes(position);
            return (
              <button
                key={position}
                type="button"
                onClick={() => toggleSpecialZone(position)}
                style={{ ...chip, ...(active ? zoneActive : chipInactive) }}
              >
                {position}
              </button>
            );
          })}
        </div>
      </AccordionBox>
    </div>
  );
}

function AccordionBox({ title, summary, open, onToggle, children }) {
  return (
    <div style={sectionBox}>
      <button type="button" onClick={onToggle} style={sectionButton}>
        <div style={{ display: 'grid', gap: 2, textAlign: 'left', minWidth: 0 }}>
          <span style={sectionTitle}>{title}</span>
          <span style={sectionSummary}>{summary || '-'}</span>
        </div>
        <span style={arrow}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={sectionBody}>{children}</div>}
    </div>
  );
}

const box = {
  display: 'grid',
  gap: 10,
};
const sectionBox = {
  border: '1px solid #dde6f3',
  borderRadius: 12,
  background: '#fff',
  overflow: 'hidden',
};
const sectionButton = {
  width: '100%',
  border: 0,
  background: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: '14px 14px 12px',
  cursor: 'pointer',
};
const sectionTitle = {
  fontWeight: 800,
  fontSize: 16,
  color: '#16376c',
};
const sectionSummary = {
  fontSize: 13,
  color: '#5b6f95',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const sectionBody = {
  padding: '0 14px 14px',
};
const arrow = {
  color: '#4a5f86',
  fontSize: 12,
  fontWeight: 700,
};
const countTextWrap = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  marginBottom: 10,
  flexWrap: 'wrap',
};
const countText = {
  fontSize: 13,
  fontWeight: 700,
  color: '#16376c',
};
const chipWrap = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 10,
};
const chip = {
  minHeight: 42,
  borderRadius: 12,
  fontWeight: 700,
  fontSize: 15,
  cursor: 'pointer',
};
const chipActive = {
  border: '1.5px solid #5d8df6',
  background: '#edf4ff',
  color: '#2457d6',
};
const zoneActive = {
  border: '1.5px solid #e0b000',
  background: '#fff5b8',
  color: '#6f5800',
};
const chipInactive = {
  border: '1px solid #d9dee8',
  background: '#f5f6f8',
  color: '#8a94a5',
};

const modeWrap = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: 4,
  borderRadius: 999,
  background: '#eef2f7',
  border: '1px solid #d7dfeb',
  marginBottom: 10,
};
const modeChip = {
  minWidth: 68,
  height: 34,
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 14,
  border: '1px solid transparent',
  cursor: 'pointer',
};
const modeChipActive = { background: '#2d6df6', color: '#fff', borderColor: '#2d6df6' };
const modeChipInactive = { background: '#fff', color: '#5b6f95', borderColor: '#d0d8e7' };
