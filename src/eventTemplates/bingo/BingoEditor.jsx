// /src/eventTemplates/bingo/BingoEditor.jsx

import React, { useMemo, useState } from 'react';
import { defaultBingoParams, isValidBingoSelectedHoles, normalizeBingoSelectedHoles, normalizeBingoSpecialZones } from '../../events/bingo';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const POSITIONS = Array.from({ length: 16 }, (_, i) => i + 1);

function getSummary(selectedHoles, targetHoleCount) {
  const count = selectedHoles.length;
  if (count === targetHoleCount) return `${targetHoleCount}홀 선택 완료`;
  if (count > targetHoleCount) return `${count}개 선택 · ${count - targetHoleCount}개 더 해제`;
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
      targetHoleCount: Number(src.targetHoleCount) === 16 ? 16 : 18,
    };
  }, [value]);

  const selectedHoles = safe.selectedHoles;
  const specialZones = safe.specialZones;
  const targetHoleCount = Number(safe.targetHoleCount) === 16 ? 16 : 18;
  const [openKey, setOpenKey] = useState('');

  const emit = (next) => {
    if (typeof onChange === 'function') onChange(next);
  };

  const toggleHole = (holeNo) => {
    const has = selectedHoles.includes(holeNo);
    let next;
    if (targetHoleCount === 18) {
      if (has) return;
      next = [...selectedHoles, holeNo];
    } else if (has) {
      if (selectedHoles.length <= 16) return;
      next = selectedHoles.filter((n) => n !== holeNo);
    } else {
      next = [...selectedHoles, holeNo];
    }
    emit({ ...safe, selectedHoles: normalizeBingoSelectedHoles(next) });
  };

  const changeTargetHoleCount = (nextTarget) => {
    const target = Number(nextTarget) === 16 ? 16 : 18;
    if (target === 18) {
      emit({ ...safe, targetHoleCount: 18, selectedHoles: HOLES });
      return;
    }
    emit({ ...safe, targetHoleCount: 16, selectedHoles: normalizeBingoSelectedHoles(selectedHoles) });
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
        summary={getSummary(selectedHoles, targetHoleCount)}
        open={openKey === 'holes'}
        onToggle={() => setOpenKey((prev) => (prev === 'holes' ? '' : 'holes'))}
      >
        <div style={{ ...countTextWrap, gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => changeTargetHoleCount(18)} style={{ ...chip, ...(targetHoleCount === 18 ? chipActive : chipInactive), minWidth: 62 }}>18홀</button>
            <button type="button" onClick={() => changeTargetHoleCount(16)} style={{ ...chip, ...(targetHoleCount === 16 ? chipActive : chipInactive), minWidth: 62 }}>16홀</button>
          </div>
          <span style={countText}>{selectedHoles.length}/18 선택</span>
          <span style={{ ...countText, color: (selectedHoles.length === targetHoleCount) ? '#177a45' : '#5b6f95' }}>
            {(selectedHoles.length === targetHoleCount) ? '완료' : (targetHoleCount === 16 ? '2개를 해제해 16홀로 맞춰주세요' : '18홀 전체를 선택해야 합니다')}
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
