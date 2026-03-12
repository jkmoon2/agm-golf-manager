// /src/eventTemplates/holeRankForce/HoleRankForceEditor.jsx

import React, { useMemo } from 'react';
import {
  defaultHoleRankForceParams,
  normalizeForcedRanks,
  normalizeSelectedHoles,
  normalizeSelectedSlots,
} from '../../events/holeRankForce';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const SLOTS = [1, 2, 3, 4];

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

  const toggleSlot = (slotNo) => {
    const has = safe.selectedSlots.includes(slotNo);
    const next = has
      ? safe.selectedSlots.filter((n) => n !== slotNo)
      : [...safe.selectedSlots, slotNo];
    emit({ ...safe, selectedSlots: normalizeSelectedSlots(next) });
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

  return (
    <div style={box}>
      <div style={titleRow}>
        <div style={{ fontWeight: 700 }}>홀별 강제 순위 점수 설정</div>
        <div style={badge}>{variant === 'edit' ? '수정' : '생성'}</div>
      </div>

      <div style={help}>
        * 기본값은 <b>1~18홀 전체 / 참가자1~4 전체 / 본인 점수 그대로</b>입니다.<br />
        * 강제 순위를 선택하면 해당 홀에서 선택된 참가자의 점수 중 <b>낮은 점수 1위 기준</b>으로 점수를 가져옵니다.
      </div>

      <div style={section}>
        <div style={sectionLabel}>사용 홀 선택</div>
        <div style={chipWrap}>
          {HOLES.map((holeNo) => {
            const active = safe.selectedHoles.includes(holeNo);
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
      </div>

      <div style={section}>
        <div style={sectionLabel}>참가자 선택</div>
        <div style={chipWrap}>
          {SLOTS.map((slotNo) => {
            const active = safe.selectedSlots.includes(slotNo);
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
      </div>

      <div style={section}>
        <div style={sectionLabel}>홀별 참가자 강제 순위</div>
        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>홀</th>
                {SLOTS.map((slotNo) => (
                  <th key={slotNo} style={th}>참가자{slotNo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HOLES.map((holeNo) => {
                const holeActive = safe.selectedHoles.includes(holeNo);
                return (
                  <tr key={holeNo}>
                    <td style={tdLabel}>{holeNo}홀</td>
                    {SLOTS.map((slotNo) => {
                      const slotActive = safe.selectedSlots.includes(slotNo);
                      const disabled = !holeActive || !slotActive;
                      const valueRank = safe.forcedRanks?.[String(holeNo)]?.[String(slotNo)] ?? '';
                      return (
                        <td key={`${holeNo}-${slotNo}`} style={td}>
                          <select
                            value={disabled ? '' : String(valueRank)}
                            onChange={(e) => setRank(holeNo, slotNo, e.target.value)}
                            disabled={disabled}
                            style={{ ...select, ...(disabled ? selectDisabled : null) }}
                          >
                            <option value="">기본값</option>
                            <option value="1">1위</option>
                            <option value="2">2위</option>
                            <option value="3">3위</option>
                            <option value="4">4위</option>
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const box = {
  marginTop: 10,
  padding: 10,
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  background: '#fff',
};
const titleRow = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};
const badge = {
  fontSize: 12,
  color: '#64748b',
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 999,
  padding: '4px 8px',
};
const help = {
  marginTop: 8,
  fontSize: 12,
  lineHeight: 1.5,
  color: '#555',
};
const section = {
  marginTop: 12,
};
const sectionLabel = {
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 8,
};
const chipWrap = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};
const chip = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  borderRadius: 999,
  padding: '7px 10px',
  fontSize: 13,
  cursor: 'pointer',
};
const chipActive = {
  background: '#eef6ff',
  color: '#1d4ed8',
  borderColor: '#93c5fd',
  fontWeight: 700,
};
const tableWrap = {
  overflowX: 'auto',
  border: '1px solid #eef2f7',
  borderRadius: 12,
};
const table = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: 520,
};
const th = {
  padding: '8px 6px',
  borderBottom: '1px solid #eef2f7',
  background: '#f8fafc',
  fontSize: 12,
  textAlign: 'center',
};
const td = {
  padding: 6,
  borderBottom: '1px solid #f1f5f9',
  textAlign: 'center',
};
const tdLabel = {
  ...td,
  fontWeight: 700,
  background: '#fcfcfd',
};
const select = {
  width: '100%',
  minWidth: 74,
  border: '1px solid #dbe2ea',
  borderRadius: 10,
  padding: '7px 8px',
  fontSize: 13,
  background: '#fff',
};
const selectDisabled = {
  background: '#f8fafc',
  color: '#94a3b8',
};
