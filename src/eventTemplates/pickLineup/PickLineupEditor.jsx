// /src/eventTemplates/pickLineup/PickLineupEditor.jsx
import React, { useMemo, useState } from 'react';
import { getParticipantGroupNo, normalizeOpenGroups } from '../../events/pickLineup';

export default function PickLineupEditor({ participants = [], value, onChange }) {
  const safe = value && typeof value === 'object' ? value : {};
  const mode = safe.mode === 'jo' ? 'jo' : 'single';
  const pickCount = Math.max(1, Math.min(4, Number(safe.pickCount || 1)));
  const openGroups = normalizeOpenGroups(safe.openGroups);
  const lastPlaceHalf = !!safe.lastPlaceHalf;

  const [openKey, setOpenKey] = useState('');

  const groupCounts = useMemo(() => {
    const out = { 1: 0, 2: 0, 3: 0, 4: 0 };
    (Array.isArray(participants) ? participants : []).forEach((p) => {
      const g = getParticipantGroupNo(p);
      if (g >= 1 && g <= 4) out[g] += 1;
    });
    return out;
  }, [participants]);

  const emit = (patch) => {
    if (typeof onChange === 'function') {
      onChange({
        mode,
        pickCount,
        openGroups,
        lastPlaceHalf,
        ...patch,
      });
    }
  };

  const toggleGroup = (groupNo) => {
    const has = openGroups.includes(groupNo);
    let next = has ? openGroups.filter((x) => x !== groupNo) : [...openGroups, groupNo];
    next = normalizeOpenGroups(next);
    if (!next.length) next = [1];
    emit({ openGroups: next, lastPlaceHalf: (next.length === 4 ? lastPlaceHalf : false) });
  };

  const summaryCount = `${pickCount}명`;
  const summaryGroups = openGroups.map((g) => `${g}조`).join(', ') || '1조';

  return (
    <div style={box}>
      <div style={titleRow}>
        <div style={{ fontWeight: 700 }}>개인/조 선택 대결 설정</div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <label style={labelBox}>
          <span style={fieldLabel}>모드</span>
          <select
            value={mode}
            onChange={(e) => {
              const nextMode = e.target.value === 'jo' ? 'jo' : 'single';
              emit({
                mode: nextMode,
                pickCount,
                openGroups: nextMode === 'jo' ? (openGroups.length ? openGroups : [1]) : openGroups,
                lastPlaceHalf: nextMode === 'jo' && openGroups.length === 4 ? lastPlaceHalf : false,
              });
            }}
            style={select}
          >
            <option value="single">개인 모드</option>
            <option value="jo">조 모드</option>
          </select>
        </label>

        {mode === 'single' && (
          <AccordionBox
            title="선택 인원 수"
            summary={summaryCount}
            open={openKey === 'count'}
            onToggle={() => setOpenKey((prev) => (prev === 'count' ? '' : 'count'))}
          >
            <label style={labelBox}>
              <span style={fieldLabel}>선택 인원 수</span>
              <select
                value={pickCount}
                onChange={(e) => emit({ pickCount: Math.max(1, Math.min(4, Number(e.target.value || 1))) })}
                style={select}
              >
                <option value={1}>1명</option>
                <option value={2}>2명</option>
                <option value={3}>3명</option>
                <option value={4}>4명</option>
              </select>
            </label>
          </AccordionBox>
        )}

        {mode === 'jo' && (
          <>
            <AccordionBox
              title="오픈할 조"
              summary={`선택 조: ${summaryGroups}`}
              open={openKey === 'groups'}
              onToggle={() => setOpenKey((prev) => (prev === 'groups' ? '' : 'groups'))}
            >
              <div style={pillGridStyle}>
                {[1, 2, 3, 4].map((groupNo) => {
                  const active = openGroups.includes(groupNo);
                  return (
                    <button
                      key={groupNo}
                      type="button"
                      onClick={() => toggleGroup(groupNo)}
                      style={{ ...pillStyle, ...(active ? pillOnStyle : {}) }}
                    >
                      {groupNo}조 ({groupCounts[groupNo] || 0})
                    </button>
                  );
                })}
              </div>
            </AccordionBox>

            {openGroups.length === 4 && (
              <label style={checkRowStyle}>
                <input
                  type="checkbox"
                  checked={lastPlaceHalf}
                  onChange={(e) => emit({ lastPlaceHalf: !!e.target.checked })}
                />
                <span>꼴등반띵 적용</span>
              </label>
            )}
          </>
        )}
      </div>
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
  marginTop: 10,
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  background: '#fff',
  maxWidth: '100%',
  overflow: 'hidden',
  boxSizing: 'border-box',
};
const titleRow = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};
const labelBox = {
  display: 'grid',
  gap: 6,
  minWidth: 0,
};
const fieldLabel = {
  fontSize: 13,
  fontWeight: 700,
  color: '#344054',
};
const select = {
  width: '100%',
  height: 42,
  borderRadius: 10,
  border: '1px solid #d0d7de',
  background: '#fff',
  padding: '0 12px',
  fontSize: 14,
  boxSizing: 'border-box',
};
const sectionBox = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  overflow: 'hidden',
  maxWidth: '100%',
  boxSizing: 'border-box',
};
const sectionButton = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '12px 14px',
  background: '#fff',
  border: 'none',
  cursor: 'pointer',
  boxSizing: 'border-box',
};
const sectionTitle = {
  fontSize: 14,
  fontWeight: 700,
  color: '#111827',
};
const sectionSummary = {
  fontSize: 12,
  color: '#667085',
  lineHeight: 1.45,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const sectionBody = {
  padding: '0 14px 14px',
  background: '#fff',
  boxSizing: 'border-box',
};
const arrow = { fontSize: 12, color: '#667085', flexShrink: 0 };
const pillGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
  marginTop: 2,
};
const pillStyle = {
  width: '100%',
  border: '1px solid #cfd8e3',
  background: '#fff',
  color: '#1f2937',
  borderRadius: 999,
  padding: '8px 10px',
  fontSize: 13,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  boxSizing: 'border-box',
};
const pillOnStyle = {
  border: '1px solid #8bb6ff',
  color: '#1d4ed8',
  background: '#eef5ff',
  fontWeight: 700,
};
const checkRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 2,
  fontSize: 13,
  color: '#111827',
};
