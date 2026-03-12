// /src/eventTemplates/holeRankForce/HoleRankForceEditor.jsx

import React, { useMemo, useState, useEffect } from 'react';
import {
  defaultHoleRankForceParams,
  normalizeForcedRanks,
  normalizeSelectedHoles,
  normalizeSelectedSlots,
} from '../../events/holeRankForce';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const SLOTS = [1, 2, 3, 4];

function isFullSelection(arr, totalArr) {
  return Array.isArray(arr) && arr.length === totalArr.length && totalArr.every((n) => arr.includes(n));
}

function summaryHoles(selectedHoles) {
  if (isFullSelection(selectedHoles, HOLES)) return '기본값';
  return selectedHoles.map((n) => `${n}홀`).join(', ');
}

function summarySlots(selectedSlots) {
  if (isFullSelection(selectedSlots, SLOTS)) return '기본값';
  return selectedSlots.map((n) => `참가자${n}`).join(', ');
}

export default function HoleRankForceEditor({
  variant = 'create',
  value,
  onChange,
}) {
  const safe = useMemo(() => {
    const base = defaultHoleRankForceParams();
    const src = value && typeof value === 'object' ? value : {};
    return {
      ...base,
      ...src,
      selectedHoles: normalizeSelectedHoles(src.selectedHoles),
      selectedSlots: normalizeSelectedSlots(src.selectedSlots),
      forcedRanks: normalizeForcedRanks(src.forcedRanks),
    };
  }, [value]);

  const selectedHoleOptions = useMemo(() => normalizeSelectedHoles(safe.selectedHoles), [safe.selectedHoles]);
  const selectedSlotOptions = useMemo(() => normalizeSelectedSlots(safe.selectedSlots), [safe.selectedSlots]);

  const [openKey, setOpenKey] = useState('holes');
  const [activeHole, setActiveHole] = useState(String(selectedHoleOptions[0] || 1));
  const [activeSlot, setActiveSlot] = useState(String(selectedSlotOptions[0] || 1));

  useEffect(() => {
    if (!selectedHoleOptions.includes(Number(activeHole))) {
      setActiveHole(String(selectedHoleOptions[0] || 1));
    }
  }, [selectedHoleOptions, activeHole]);

  useEffect(() => {
    if (!selectedSlotOptions.includes(Number(activeSlot))) {
      setActiveSlot(String(selectedSlotOptions[0] || 1));
    }
  }, [selectedSlotOptions, activeSlot]);

  const emit = (next) => {
    if (typeof onChange === 'function') onChange(next);
  };

  const toggleHole = (holeNo) => {
    const has = safe.selectedHoles.includes(holeNo);
    const next = has
      ? safe.selectedHoles.filter((n) => n !== holeNo)
      : [...safe.selectedHoles, holeNo];
    emit({ ...safe, selectedHoles: normalizeSelectedHoles(next) });
  };

  const resetHoles = () => {
    emit({ ...safe, selectedHoles: defaultHoleRankForceParams().selectedHoles });
  };

  const toggleSlot = (slotNo) => {
    const has = safe.selectedSlots.includes(slotNo);
    const next = has
      ? safe.selectedSlots.filter((n) => n !== slotNo)
      : [...safe.selectedSlots, slotNo];
    emit({ ...safe, selectedSlots: normalizeSelectedSlots(next) });
  };

  const resetSlots = () => {
    emit({ ...safe, selectedSlots: defaultHoleRankForceParams().selectedSlots });
  };

  const setRank = (holeNo, slotNo, rankValue) => {
    const forced = {
      ...(safe.forcedRanks || {}),
      [String(holeNo)]: {
        ...((safe.forcedRanks || {})[String(holeNo)] || {}),
      },
    };

    if (rankValue === '' || rankValue == null) {
      delete forced[String(holeNo)][String(slotNo)];
      if (!Object.keys(forced[String(holeNo)] || {}).length) delete forced[String(holeNo)];
    } else {
      forced[String(holeNo)][String(slotNo)] = Number(rankValue);
    }

    emit({ ...safe, forcedRanks: normalizeForcedRanks(forced) });
  };

  const currentRank = safe.forcedRanks?.[String(activeHole)]?.[String(activeSlot)] ?? '';

  return (
    <div style={box}>
      <div style={titleRow}>
        <div style={{ fontWeight: 700 }}>홀별 강제 순위 점수 설정</div>
        <div style={badge}>{variant === 'edit' ? '수정' : '생성'}</div>
      </div>

      <AccordionBox
        title="사용 홀 선택"
        summary={summaryHoles(selectedHoleOptions)}
        open={openKey === 'holes'}
        onToggle={() => setOpenKey((prev) => (prev === 'holes' ? '' : 'holes'))}
      >
        <div style={actionRow}>
          <button type="button" onClick={resetHoles} style={resetBtn}>기본값</button>
        </div>
        <div style={chipWrap}>
          {HOLES.map((holeNo) => {
            const active = selectedHoleOptions.includes(holeNo);
            return (
              <button
                key={holeNo}
                type="button"
                onClick={() => toggleHole(holeNo)}
                style={{ ...chip, ...(active ? chipActive : null) }}
              >
                {holeNo}홀
              </button>
            );
          })}
        </div>
      </AccordionBox>

      <AccordionBox
        title="참가자 선택"
        summary={summarySlots(selectedSlotOptions)}
        open={openKey === 'slots'}
        onToggle={() => setOpenKey((prev) => (prev === 'slots' ? '' : 'slots'))}
      >
        <div style={actionRow}>
          <button type="button" onClick={resetSlots} style={resetBtn}>기본값</button>
        </div>
        <div style={chipWrap}>
          {SLOTS.map((slotNo) => {
            const active = selectedSlotOptions.includes(slotNo);
            return (
              <button
                key={slotNo}
                type="button"
                onClick={() => toggleSlot(slotNo)}
                style={{ ...chip, ...(active ? chipActive : null) }}
              >
                참가자{slotNo}
              </button>
            );
          })}
        </div>
      </AccordionBox>

      <AccordionBox
        title="홀별 참가자 강제 순위"
        summary={selectedHoleOptions.length && selectedSlotOptions.length ? `${activeHole}홀 · 참가자${activeSlot}` : '기본값'}
        open={openKey === 'force'}
        onToggle={() => setOpenKey((prev) => (prev === 'force' ? '' : 'force'))}
      >
        <div style={fieldGrid}>
          <label style={labelBox}>
            <span style={fieldLabel}>홀 선택</span>
            <select
              value={activeHole}
              onChange={(e) => setActiveHole(e.target.value)}
              style={select}
            >
              {selectedHoleOptions.map((holeNo) => (
                <option key={holeNo} value={String(holeNo)}>{holeNo}홀</option>
              ))}
            </select>
          </label>

          <label style={labelBox}>
            <span style={fieldLabel}>참가자 선택</span>
            <select
              value={activeSlot}
              onChange={(e) => setActiveSlot(e.target.value)}
              style={select}
            >
              {selectedSlotOptions.map((slotNo) => (
                <option key={slotNo} value={String(slotNo)}>참가자{slotNo}</option>
              ))}
            </select>
          </label>

          <label style={labelBox}>
            <span style={fieldLabel}>순위 선택</span>
            <select
              value={String(currentRank)}
              onChange={(e) => setRank(Number(activeHole), Number(activeSlot), e.target.value)}
              style={select}
            >
              <option value="">기본값</option>
              <option value="1">1위</option>
              <option value="2">2위</option>
              <option value="3">3위</option>
              <option value="4">4위</option>
            </select>
          </label>
        </div>

        <div style={miniListWrap}>
          {selectedHoleOptions.map((holeNo) => {
            const row = safe.forcedRanks?.[String(holeNo)] || {};
            const parts = selectedSlotOptions
              .map((slotNo) => {
                const rank = row?.[String(slotNo)];
                return rank ? `참가자${slotNo}: ${rank}위` : null;
              })
              .filter(Boolean);
            return (
              <div key={holeNo} style={miniListRow}>
                <div style={miniListTitle}>{holeNo}홀</div>
                <div style={miniListValue}>{parts.length ? parts.join(' / ') : '기본값'}</div>
              </div>
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
          <span style={sectionSummary}>{summary || '기본값'}</span>
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
  padding: 12,
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  background: '#fafcff',
  boxSizing: 'border-box',
  width: '100%',
};
const titleRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
};
const badge = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 44,
  height: 24,
  padding: '0 8px',
  borderRadius: 999,
  border: '1px solid #dbeafe',
  background: '#eff6ff',
  color: '#2563eb',
  fontSize: 12,
  fontWeight: 700,
};
const sectionBox = {
  border: '1px solid #dbe3ef',
  borderRadius: 12,
  background: '#fff',
  overflow: 'hidden',
};
const sectionButton = {
  width: '100%',
  border: 0,
  background: '#fff',
  padding: '12px 14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};
const sectionTitle = {
  fontSize: 14,
  fontWeight: 700,
  color: '#111827',
};
const sectionSummary = {
  fontSize: 12,
  color: '#6b7280',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const arrow = { fontSize: 11, color: '#6b7280', flex: '0 0 auto' };
const sectionBody = {
  borderTop: '1px solid #eef2f7',
  padding: 12,
  display: 'grid',
  gap: 10,
};
const actionRow = { display: 'flex', justifyContent: 'flex-start' };
const resetBtn = {
  height: 32,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  fontSize: 13,
  fontWeight: 600,
};
const chipWrap = { display: 'flex', flexWrap: 'wrap', gap: 8 };
const chip = {
  minWidth: 58,
  height: 34,
  padding: '0 10px',
  borderRadius: 999,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#111827',
  fontSize: 13,
  fontWeight: 600,
};
const chipActive = {
  borderColor: '#93c5fd',
  background: '#eff6ff',
  color: '#2563eb',
};
const fieldGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 10,
};
const labelBox = { display: 'grid', gap: 6 };
const fieldLabel = { fontSize: 12, color: '#6b7280', fontWeight: 600 };
const select = {
  width: '100%',
  height: 36,
  padding: '0 10px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  fontSize: 14,
};
const miniListWrap = {
  display: 'grid',
  gap: 8,
  maxHeight: 240,
  overflowY: 'auto',
};
const miniListRow = {
  display: 'grid',
  gridTemplateColumns: '64px 1fr',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid #eef2f7',
  background: '#fafcff',
  alignItems: 'center',
};
const miniListTitle = { fontWeight: 700, fontSize: 13 };
const miniListValue = { fontSize: 13, color: '#4b5563' };
