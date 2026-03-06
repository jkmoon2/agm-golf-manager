// /src/eventTemplates/groupBattle/GroupBattleEditor.jsx
import React, { useMemo, useState } from 'react';

export default function GroupBattleEditor({
  variant = 'create', // create | edit
  participants = [],
  value,
  onChange,
}) {
  const mode = value?.mode === 'single' ? 'single' : 'group';
  const metric = value?.metric === 'score' ? 'score' : 'result';
  const groups = Array.isArray(value?.groups) ? value.groups : [];
  const memberIds = Array.isArray(value?.memberIds) ? value.memberIds : [];

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerGroupIdx, setPickerGroupIdx] = useState(0);

  const participantsSafe = Array.isArray(participants) ? participants : [];

  const selectedNamesByGroup = useMemo(() => {
    const byId = new Map(participantsSafe.map(p => [String(p.id), p]));
    return groups.map(g => {
      const ids = Array.isArray(g?.memberIds) ? g.memberIds.map(String) : [];
      const names = ids.map(id => byId.get(id)?.nickname).filter(Boolean);
      return names;
    });
  }, [groups, participantsSafe]);

  const selectedNamesSingle = useMemo(() => {
    const byId = new Map(participantsSafe.map(p => [String(p.id), p]));
    return memberIds.map(id => byId.get(String(id))?.nickname).filter(Boolean);
  }, [memberIds, participantsSafe]);

  const emit = (next) => {
    if (typeof onChange === 'function') onChange(next);
  };

  const addGroup = () => {
    const next = [...groups, { name: `그룹${groups.length + 1}`, memberIds: [] }];
    emit({ ...value, mode, metric, groups: next });
  };

  const removeGroup = (gi) => {
    if (groups.length <= 1) return;
    let next = groups.filter((_, idx) => idx !== gi);
    // 최소 2그룹 유지(대결 구조 유지)
    if (next.length === 1) next = [...next, { name: '그룹2', memberIds: [] }];
    if (next.length === 0) next = [{ name: '그룹1', memberIds: [] }, { name: '그룹2', memberIds: [] }];
    emit({ ...value, mode, metric, groups: next });
  };

  const setGroupName = (gi, name) => {
    const next = groups.map((g, idx) => idx === gi ? { ...g, name } : g);
    emit({ ...value, mode, metric, groups: next });
  };

  const toggleMemberInGroup = (gi, pid) => {
    const id = String(pid);
    const nextGroups = groups.map(g => ({ ...g, memberIds: Array.isArray(g.memberIds) ? [...g.memberIds].map(String) : [] }));
    const cur = nextGroups[gi];
    if (!cur) return;

    const has = cur.memberIds.includes(id);
    if (has) {
      cur.memberIds = cur.memberIds.filter(x => x !== id);
      emit({ ...value, mode, metric, groups: nextGroups });
      return;
    }

    // ✅ 중복 포함 불가: 다른 그룹에서 자동 해제
    nextGroups.forEach((g, idx) => {
      if (idx !== gi) g.memberIds = (g.memberIds || []).filter(x => x !== id);
    });
    cur.memberIds.push(id);
    emit({ ...value, mode, metric, groups: nextGroups });
  };

  const toggleMemberSingle = (pid) => {
    const id = String(pid);
    const has = memberIds.map(String).includes(id);
    const next = has ? memberIds.filter(x => String(x) !== id) : [...memberIds, id];
    emit({ ...value, mode, metric, memberIds: next.map(String) });
  };

  const openPicker = (gi) => {
    setPickerGroupIdx(gi);
    setPickerOpen(true);
  };

  const closePicker = () => setPickerOpen(false);

  const summaryLine = (names) => {
    const n = names.length;
    const shown = names.slice(0, 6);
    const more = n > shown.length ? ` 외 ${n - shown.length}명` : '';
    return `${shown.join(', ')}${more}`;
  };

  return (
    <div style={{ marginTop: 10, padding: 10, border: '1px solid #e5e7eb', borderRadius: 12 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>그룹/개인 대결 설정</div>
        {mode === 'group' && (
          <button type="button" onClick={addGroup} style={btnStyle}>+그룹 추가</button>
        )}
      </div>

      <div style={{ display:'flex', gap: 8, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>모드</div>
          <select
            value={mode}
            onChange={(e) => {
              const m = e.target.value === 'single' ? 'single' : 'group';
              emit({ ...value, mode: m, metric, groups, memberIds });
            }}
            style={selectStyle}
          >
            <option value="group">그룹모드</option>
            <option value="single">일반모드(개인선택)</option>
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <div style={labelStyle}>기준(점수/결과)</div>
          <select
            value={metric}
            onChange={(e) => {
              const m = e.target.value === 'score' ? 'score' : 'result';
              emit({ ...value, mode, metric: m, groups, memberIds });
            }}
            style={selectStyle}
          >
            <option value="score">점수</option>
            <option value="result">결과</option>
          </select>
        </div>
      </div>

      {participantsSafe.length === 0 && (
        <div style={{ marginTop: 10, color:'#777' }}>참가자 리스트가 없습니다. 먼저 참가자를 등록해 주세요.</div>
      )}

      {participantsSafe.length > 0 && mode === 'group' && (
        <div style={{ marginTop: 10, display:'grid', gap: 10 }}>
          {groups.map((g, gi) => {
            const names = selectedNamesByGroup[gi] || [];
            return (
              <div key={gi} style={{ padding: 10, border: '1px solid #eef2f7', borderRadius: 12 }}>
                <div style={{ display:'flex', alignItems:'flex-end', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={labelStyle}>그룹명</div>
                    <input
                      value={g?.name ?? ''}
                      onChange={(e) => setGroupName(gi, e.target.value)}
                      placeholder={`그룹${gi + 1}`}
                      style={inputStyle}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeGroup(gi)}
                    disabled={groups.length <= 1}
                    style={{ ...btnDangerStyle, padding: '10px 12px', fontSize: 14, height: 42, opacity: (groups.length <= 1 ? 0.4 : 1) }}
                  >
                    삭제
                  </button>
                </div>

                <div style={{ marginTop: 8, display:'flex', alignItems:'center', justifyContent:'space-between', gap: 8 }}>
                  <button type="button" onClick={() => openPicker(gi)} style={btnStyle}>멤버 선택</button>
                  <div style={{ fontSize: 13, fontWeight: 700, color:'#444' }}>선택 {names.length}명</div>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color:'#555' }}>
                  {names.length ? summaryLine(names) : <span style={{ color:'#999' }}>선택된 멤버가 없습니다.</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {participantsSafe.length > 0 && mode === 'single' && (
        <div style={{ marginTop: 10, padding: 10, border: '1px solid #eef2f7', borderRadius: 12 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap: 8 }}>
            <button type="button" onClick={() => { setPickerGroupIdx(-1); setPickerOpen(true); }} style={btnStyle}>참가자 선택</button>
            <div style={{ fontSize: 13, fontWeight: 700, color:'#444' }}>선택 {selectedNamesSingle.length}명</div>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color:'#555' }}>
            {selectedNamesSingle.length ? summaryLine(selectedNamesSingle) : <span style={{ color:'#999' }}>선택된 참가자가 없습니다.</span>}
          </div>
        </div>
      )}

      {/* 멤버 선택 모달 */}
      {pickerOpen && (
        <div style={modalBackdrop} onClick={closePicker}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontWeight: 700 }}>
                {mode === 'single' ? '참가자 선택' : `멤버 선택 - ${groups[pickerGroupIdx]?.name || `그룹${pickerGroupIdx+1}`}`}
              </div>
              <button type="button" onClick={closePicker} style={btnStyle}>닫기</button>
            </div>

            <div style={{ marginTop: 10, maxHeight: 340, overflow:'auto', border: '1px solid #eef2f7', borderRadius: 10, padding: 8 }}>
              {participantsSafe.map(p => {
                const pid = String(p.id);
                const checked = mode === 'single'
                  ? memberIds.map(String).includes(pid)
                  : (Array.isArray(groups[pickerGroupIdx]?.memberIds) ? groups[pickerGroupIdx].memberIds.map(String).includes(pid) : false);

                return (
                  <label key={pid} style={{ display:'flex', alignItems:'center', gap: 8, padding: '6px 4px' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (mode === 'single') toggleMemberSingle(pid);
                        else toggleMemberInGroup(pickerGroupIdx, pid);
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14 }}>{p.nickname}</div>
                      <div style={{ fontSize: 12, color:'#777' }}>
                        {p.room ? `${p.room}번방` : '미배정'} · {p.group}조 · G{p.handicap ?? 0}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {mode !== 'single' && (
              <div style={{ marginTop: 8, fontSize: 12, color:'#777' }}>
                * 한 참가자는 여러 그룹에 중복 포함될 수 없습니다. (선택 시 다른 그룹은 자동 해제)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  borderRadius: 10,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
};

const btnDangerStyle = {
  ...btnStyle,
  border: '1px solid #fecaca',
  color: '#b91c1c',
};

const labelStyle = {
  fontSize: 12,
  color: '#666',
  marginBottom: 6,
};

const inputStyle = {
  width: '100%',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  outline: 'none',
};

const selectStyle = {
  width: '100%',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  outline: 'none',
  background: '#fff',
};

const modalBackdrop = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.25)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 9999,
};

const modalCard = {
  width: '100%',
  maxWidth: 520,
  background: '#fff',
  borderRadius: 14,
  padding: 12,
  boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
};
