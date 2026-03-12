// /src/eventTemplates/pickLineup/PickLineupEditor.jsx
import React, { useMemo, useState } from 'react';
import { getParticipantGroupNo, normalizeOpenGroups } from '../../events/pickLineup';

export default function PickLineupEditor({ participants = [], value, onChange }) {
  const safe = value && typeof value === 'object' ? value : {};
  const mode = safe.mode === 'jo' ? 'jo' : 'single';
  const pickCount = Math.max(1, Math.min(4, Number(safe.pickCount || 1)));
  const openGroups = normalizeOpenGroups(safe.openGroups);
  const lastPlaceHalf = !!safe.lastPlaceHalf;

  const [groupsOpen, setGroupsOpen] = useState(false);

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

  return (
    <div style={{ marginTop: 10, padding: 12, border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>개인/조 선택 대결 설정</div>

      <div style={{ display: 'grid', gap: 10 }}>
        <div>
          <div style={labelStyle}>모드</div>
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
            style={selectStyle}
          >
            <option value="single">개인 모드</option>
            <option value="jo">조 모드</option>
          </select>
        </div>

        {mode === 'single' && (
          <div>
            <div style={labelStyle}>선택 인원 수</div>
            <select
              value={pickCount}
              onChange={(e) => emit({ pickCount: Math.max(1, Math.min(4, Number(e.target.value || 1))) })}
              style={selectStyle}
            >
              <option value={1}>1명</option>
              <option value={2}>2명</option>
              <option value={3}>3명</option>
              <option value={4}>4명</option>
            </select>
            <div style={helpStyle}>Player STEP3에서 전체 참가자 중 선택 인원 수만큼 선택합니다.</div>
          </div>
        )}

        {mode === 'jo' && (
          <div>
            <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>오픈할 조</span>
              <button type="button" onClick={() => setGroupsOpen((v) => !v)} style={miniBtnStyle}>
                {groupsOpen ? '접기' : '열기'}
              </button>
            </div>

            <div style={summaryBoxStyle}>선택 조: {openGroups.map((g) => `${g}조`).join(', ') || '1조'}</div>

            {groupsOpen && (
              <div style={pillWrapStyle}>
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
            )}

            <div style={helpStyle}>Player STEP3에서 오픈된 각 조마다 1명씩 선택합니다.</div>

            {openGroups.length === 4 && (
              <label style={checkRowStyle}>
                <input
                  type="checkbox"
                  checked={lastPlaceHalf}
                  onChange={(e) => emit({ lastPlaceHalf: !!e.target.checked })}
                />
                <span>꼴등반띵 적용 (기본값: 해제)</span>
              </label>
            )}

            {openGroups.length !== 4 && (
              <div style={{ ...helpStyle, marginTop: 4 }}>
                꼴등반띵은 1~4조 모두 오픈했을 때만 사용할 수 있습니다.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: '#344054',
  marginBottom: 6,
};

const selectStyle = {
  width: '100%',
  height: 42,
  borderRadius: 10,
  border: '1px solid #d0d7de',
  background: '#fff',
  padding: '0 12px',
  fontSize: 14,
};

const helpStyle = {
  marginTop: 6,
  fontSize: 12,
  color: '#667085',
  lineHeight: 1.5,
};

const summaryBoxStyle = {
  minHeight: 42,
  border: '1px solid #dfe6ee',
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  fontSize: 14,
  color: '#111827',
  background: '#fff',
};

const pillWrapStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 8,
};

const pillStyle = {
  border: '1px solid #cfd8e3',
  background: '#fff',
  color: '#1f2937',
  borderRadius: 999,
  padding: '8px 12px',
  fontSize: 13,
  cursor: 'pointer',
};

const pillOnStyle = {
  border: '1px solid #8bb6ff',
  color: '#1d4ed8',
  background: '#eef5ff',
  fontWeight: 700,
};

const miniBtnStyle = {
  border: '1px solid #d5dbe4',
  background: '#fff',
  borderRadius: 10,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
};

const checkRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 10,
  fontSize: 13,
  color: '#111827',
};
