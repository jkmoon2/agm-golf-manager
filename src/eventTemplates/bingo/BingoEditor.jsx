// /src/eventTemplates/bingo/BingoEditor.jsx

import React, { useMemo, useState } from 'react';
import {
  defaultBingoParams,
  isValidBingoSelectedHoles,
  normalizeBingoBoardCellCount,
  normalizeBingoSelectedHoles,
  normalizeBingoSpecialZones,
  normalizeBingoScoreHoleCount,
} from '../../events/bingo';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

function getSummary(selectedHoles, boardCellCount) {
  const target = normalizeBingoBoardCellCount(boardCellCount);
  const count = selectedHoles.length;
  if (count === target) return `${target}개 선택 완료`;
  if (count > target) return `${count}개 선택 · ${count - target}개 더 해제`;
  return `${count}개 선택 · ${target - count}개 더 선택`;
}

function fitSelectedHoles(list, target) {
  const safe = normalizeBingoSelectedHoles(list, target);
  if (safe.length >= target) return safe.slice(0, target);
  const used = new Set(safe);
  const next = [...safe];
  HOLES.forEach((holeNo) => {
    if (next.length >= target) return;
    if (!used.has(holeNo)) next.push(holeNo);
  });
  next.sort((a, b) => a - b);
  return next;
}

export default function BingoEditor({ value, onChange }) {
  const safe = useMemo(() => {
    const base = defaultBingoParams();
    const src = value && typeof value === 'object' ? value : {};
    const boardCellCount = normalizeBingoBoardCellCount(src.boardCellCount);
    return {
      ...base,
      ...src,
      boardCellCount,
      selectedHoles: normalizeBingoSelectedHoles(src.selectedHoles, boardCellCount),
      specialZones: normalizeBingoSpecialZones(src.specialZones, boardCellCount),
      inputLocked: !!src.inputLocked,
      scoreHoleCount: normalizeBingoScoreHoleCount(src.scoreHoleCount),
    };
  }, [value]);

  const boardCellCount = normalizeBingoBoardCellCount(safe.boardCellCount);
  const boardLabel = boardCellCount === 9 ? '3×3(9칸)' : '4×4(16칸)';
  const selectedHoles = safe.selectedHoles;
  const specialZones = safe.specialZones;
  const scoreHoleCount = normalizeBingoScoreHoleCount(safe.scoreHoleCount);
  const targetCount = boardCellCount;
  const positions = Array.from({ length: boardCellCount }, (_, i) => i + 1);
  const [openKey, setOpenKey] = useState('');

  const emit = (next) => {
    if (typeof onChange === 'function') onChange(next);
  };

  const setBoardCellCount = (nextCount) => {
    const target = normalizeBingoBoardCellCount(nextCount);
    const nextScoreHoleCount = target === 9 ? (scoreHoleCount === 16 ? 9 : scoreHoleCount) : (scoreHoleCount === 9 ? 16 : scoreHoleCount);
    emit({
      ...safe,
      boardCellCount: target,
      scoreHoleCount: normalizeBingoScoreHoleCount(nextScoreHoleCount),
      // 기존 4×4 방식처럼 최초에는 1~18홀이 모두 선택된 상태를 유지하고,
      // 운영자가 터치로 해제해서 9/16개에 맞추도록 합니다.
      selectedHoles: normalizeBingoSelectedHoles(selectedHoles, target),
      specialZones: normalizeBingoSpecialZones(specialZones, target),
    });
  };

  const setScoreHoleCount = (nextCount) => {
    const normalized = normalizeBingoScoreHoleCount(nextCount);
    const nextBoardCellCount = normalized === 9 ? 9 : boardCellCount;
    emit({
      ...safe,
      boardCellCount: nextBoardCellCount,
      scoreHoleCount: normalized,
      // 9홀/16홀/18홀 버튼을 눌러도 선택홀을 자동으로 잘라내지 않습니다.
      // 기존처럼 전체 선택 상태에서 필요한 홀을 해제하는 방식으로 운영합니다.
      selectedHoles: normalizeBingoSelectedHoles(selectedHoles, nextBoardCellCount),
      specialZones: normalizeBingoSpecialZones(specialZones, nextBoardCellCount),
    });
  };

  const toggleHole = (holeNo) => {
    const has = selectedHoles.includes(holeNo);
    let next;
    if (has) {
      if (selectedHoles.length <= targetCount) return;
      next = selectedHoles.filter((n) => n !== holeNo);
    } else {
      next = [...selectedHoles, holeNo];
    }
    emit({ ...safe, selectedHoles: normalizeBingoSelectedHoles(next, targetCount) });
  };

  const toggleSpecialZone = (position) => {
    const has = specialZones.includes(position);
    const next = has ? specialZones.filter((n) => n !== position) : [...specialZones, position];
    emit({ ...safe, specialZones: normalizeBingoSpecialZones(next, boardCellCount) });
  };

  return (
    <div style={box}>
      <AccordionBox
        title="빙고판 선택"
        summary={boardLabel}
        open={openKey === 'board'}
        onToggle={() => setOpenKey((prev) => (prev === 'board' ? '' : 'board'))}
      >
        <div style={modeWrap}>
          <button
            type="button"
            onClick={() => setBoardCellCount(9)}
            style={{ ...modeChip, ...(boardCellCount === 9 ? modeChipActive : modeChipInactive) }}
          >
            3×3
          </button>
          <button
            type="button"
            onClick={() => setBoardCellCount(16)}
            style={{ ...modeChip, ...(boardCellCount === 16 ? modeChipActive : modeChipInactive) }}
          >
            4×4
          </button>
        </div>
        <div style={hintText}>3×3은 9칸 축소판, 4×4는 기존 16칸 빙고판입니다.</div>
      </AccordionBox>

      <AccordionBox
        title="사용 홀 선택"
        summary={`${getSummary(selectedHoles, boardCellCount)} · 입력 ${scoreHoleCount}홀`}
        open={openKey === 'holes'}
        onToggle={() => setOpenKey((prev) => (prev === 'holes' ? '' : 'holes'))}
      >

        <div style={modeWrap}>
          <button
            type="button"
            onClick={() => setScoreHoleCount(9)}
            style={{ ...modeChip, ...(scoreHoleCount === 9 ? modeChipActive : modeChipInactive) }}
          >
            9홀
          </button>
          <button
            type="button"
            onClick={() => setScoreHoleCount(16)}
            style={{ ...modeChip, ...(scoreHoleCount === 16 ? modeChipActive : modeChipInactive) }}
          >
            16홀
          </button>
          <button
            type="button"
            onClick={() => setScoreHoleCount(18)}
            style={{ ...modeChip, ...(scoreHoleCount === 18 ? modeChipActive : modeChipInactive) }}
          >
            18홀
          </button>
        </div>
        <div style={{ ...countTextWrap, marginTop: -4 }}>
          <span style={countText}>{selectedHoles.length}/18 선택</span>
          <span style={{ ...countText, color: isValidBingoSelectedHoles(selectedHoles, targetCount) ? '#177a45' : '#d97706' }}>
            {scoreHoleCount === 18
              ? `18홀 입력 · 빙고 반영은 선택된 ${targetCount}홀만 적용`
              : `${targetCount}개 홀을 선택해 ${boardLabel}에 반영`}
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
        <div style={boardCellCount === 9 ? zoneChipWrap3 : chipWrap}>
          {positions.map((position) => {
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
const hintText = {
  fontSize: 12,
  color: '#64748b',
  lineHeight: 1.45,
};
const chipWrap = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 10,
};
const zoneChipWrap3 = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
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
  flexWrap: 'wrap',
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
