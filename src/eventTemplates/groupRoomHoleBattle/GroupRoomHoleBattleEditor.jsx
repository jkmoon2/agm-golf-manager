// /src/eventTemplates/groupRoomHoleBattle/GroupRoomHoleBattleEditor.jsx
import React, { useMemo, useState } from 'react';
import { defaultGroupRoomHoleBattleParams, getGroupRoomDisplayName, getRoomLabel, normalizeGroupRoomHoleBattleParams } from '../../events/groupRoomHoleBattle';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

function summaryHoles(selectedHoles) {
  return (Array.isArray(selectedHoles) ? selectedHoles : []).map((holeNo) => `${holeNo}홀`).join(', ') || '기본값';
}

export default function GroupRoomHoleBattleEditor({ participants = [], roomNames = [], roomCount = 0, value, onChange }) {
  const safe = useMemo(
    () => normalizeGroupRoomHoleBattleParams(value || defaultGroupRoomHoleBattleParams(), { participants, roomNames, roomCount }),
    [value, participants, roomNames, roomCount]
  );
  const [openKey, setOpenKey] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerType, setPickerType] = useState('group');
  const [pickerGroupIdx, setPickerGroupIdx] = useState(0);

  const participantsSafe = Array.isArray(participants) ? participants : [];

  const emit = (patch) => {
    if (typeof onChange !== 'function') return;
    onChange({
      ...safe,
      ...patch,
    });
  };

  const toggleHole = (holeNo) => {
    const has = safe.selectedHoles.includes(holeNo);
    const next = has ? safe.selectedHoles.filter((n) => n !== holeNo) : [...safe.selectedHoles, holeNo];
    emit({ selectedHoles: [...next].sort((a, b) => a - b) });
  };

  const resetHoles = () => emit({ selectedHoles: defaultGroupRoomHoleBattleParams().selectedHoles });

  const setMode = (mode) => {
    emit({ mode: mode === 'room' || mode === 'person' ? mode : 'group' });
  };

  const setGroupName = (gi, name) => {
    const next = safe.groups.map((group, idx) => idx === gi ? { ...group, name } : group);
    emit({ groups: next });
  };

  const toggleLeaderInGroup = (gi, pid) => {
    const id = String(pid);
    const nextGroups = safe.groups.map((group) => ({
      ...group,
      memberIds: Array.isArray(group.memberIds) ? [...group.memberIds].map(String) : [],
      leaderIds: Array.isArray(group.leaderIds) ? [...group.leaderIds].map(String) : [],
    }));
    const current = nextGroups[gi];
    if (!current) return;
    if (!current.memberIds.includes(id)) return;
    const has = current.leaderIds.includes(id);
    current.leaderIds = has ? current.leaderIds.filter((item) => item !== id) : [...current.leaderIds, id];
    emit({ groups: nextGroups });
  };

  const addGroup = () => {
    emit({ groups: [...safe.groups, { key: `group-${safe.groups.length + 1}`, name: `그룹${safe.groups.length + 1}`, memberIds: [], leaderIds: [] }] });
  };

  const removeGroup = (gi) => {
    const next = safe.groups.filter((_, idx) => idx !== gi);
    emit({ groups: next.length ? next : [{ key: 'group-1', name: '', memberIds: [], leaderIds: [] }] });
  };

  const openGroupPicker = (gi) => {
    setPickerType('group');
    setPickerGroupIdx(gi);
    setPickerOpen(true);
  };

  const openLeaderPicker = (gi) => {
    setPickerType('leader');
    setPickerGroupIdx(gi);
    setPickerOpen(true);
  };

  const openPersonPicker = () => {
    setPickerType('person');
    setPickerGroupIdx(-1);
    setPickerOpen(true);
  };

  const closePicker = () => setPickerOpen(false);

  const toggleMemberInGroup = (gi, pid) => {
    const id = String(pid);
    const nextGroups = safe.groups.map((group) => ({
      ...group,
      memberIds: Array.isArray(group.memberIds) ? [...group.memberIds].map(String) : [],
    }));
    const current = nextGroups[gi];
    if (!current) return;
    const has = current.memberIds.includes(id);
    if (has) {
      current.memberIds = current.memberIds.filter((item) => item !== id);
      current.leaderIds = current.leaderIds.filter((item) => item !== id);
      emit({ groups: nextGroups });
      return;
    }
    nextGroups.forEach((group, idx) => {
      if (idx !== gi) group.memberIds = group.memberIds.filter((item) => item !== id);
      group.leaderIds = group.leaderIds.filter((item) => item !== id);
    });
    current.memberIds.push(id);
    emit({ groups: nextGroups });
  };

  const togglePerson = (pid) => {
    const id = String(pid);
    const current = Array.isArray(safe.personIds) ? safe.personIds.map(String) : [];
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    emit({ personIds: next });
  };

  const participantsByRoom = useMemo(() => {
    const out = Array.from({ length: Math.max(0, Number(roomCount || 0)) }, (_, idx) => ({ roomNo: idx + 1, members: [] }));
    participantsSafe.forEach((p) => {
      const roomNo = Number(p?.room || 0);
      if (roomNo >= 1 && roomNo <= out.length) out[roomNo - 1].members.push(p);
    });
    return out;
  }, [participantsSafe, roomCount]);

  const byId = useMemo(() => new Map(participantsSafe.map((participant) => [String(participant?.id || ''), participant])), [participantsSafe]);

  const groupSummary = (group, idx) => {
    const names = (Array.isArray(group?.memberIds) ? group.memberIds : []).map((id) => byId.get(String(id))?.nickname).filter(Boolean);
    if (!names.length) return '선택된 멤버가 없습니다.';
    const shown = names.slice(0, 6);
    const more = names.length > shown.length ? ` 외 ${names.length - shown.length}명` : '';
    return `${getGroupRoomDisplayName(group?.name, idx, '그룹')} · ${shown.join(', ')}${more}`;
  };

  const leaderSummary = (group) => {
    const names = (Array.isArray(group?.leaderIds) ? group.leaderIds : []).map((id) => byId.get(String(id))?.nickname).filter(Boolean);
    return names.length ? `리더: ${names.join(', ')}` : '리더 미지정';
  };

  const selectedPersonNames = (Array.isArray(safe.personIds) ? safe.personIds : []).map((id) => byId.get(String(id))?.nickname).filter(Boolean);
  const summaryMode = safe.mode === 'room'
    ? '방 모드'
    : safe.mode === 'person'
      ? `개인 모드 · ${selectedPersonNames.length}명 선택`
      : `그룹 모드 · ${safe.groups.length}개 그룹`;
  const summaryRules = [
    safe.pickCount ? `${safe.pickCount}명` : '참가자수 미설정',
    safe.maxPerParticipant ? `인당 최대 ${safe.maxPerParticipant}회` : '선택횟수 미설정',
  ].join(' · ');

  return (
    <div style={box}>
      <AccordionBox
        title="사용 홀 선택"
        summary={summaryHoles(safe.selectedHoles)}
        open={openKey === 'holes'}
        onToggle={() => setOpenKey((prev) => (prev === 'holes' ? '' : 'holes'))}
      >
        <div style={actionRow}>
          <button type="button" onClick={resetHoles} style={resetBtn}>기본값</button>
        </div>
        <div style={chipWrap}>
          {HOLES.map((holeNo) => {
            const active = safe.selectedHoles.includes(holeNo);
            return (
              <button key={holeNo} type="button" onClick={() => toggleHole(holeNo)} style={{ ...chip, ...(active ? chipActive : null) }}>
                {holeNo}홀
              </button>
            );
          })}
        </div>
      </AccordionBox>

      <AccordionBox
        title="그룹 / 방 / 개인 모드"
        summary={summaryMode}
        open={openKey === 'mode'}
        onToggle={() => setOpenKey((prev) => (prev === 'mode' ? '' : 'mode'))}
      >
        <div style={pillGrid3Style}>
          <button type="button" onClick={() => setMode('group')} style={{ ...pillStyle, ...(safe.mode === 'group' ? pillOnStyle : null) }}>그룹</button>
          <button type="button" onClick={() => setMode('room')} style={{ ...pillStyle, ...(safe.mode === 'room' ? pillOnStyle : null) }}>방</button>
          <button type="button" onClick={() => setMode('person')} style={{ ...pillStyle, ...(safe.mode === 'person' ? pillOnStyle : null) }}>개인</button>
        </div>

        {safe.mode === 'group' ? (
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {safe.groups.map((group, idx) => (
              <div key={group.key || idx} style={groupBox}>
                <div style={groupHead}>
                  <div style={{ flex: 1 }}>
                    <div style={miniLabel}>그룹명</div>
                    <input
                      value={typeof group?.name === 'string' ? group.name : ''}
                      onChange={(e) => setGroupName(idx, e.target.value)}
                      placeholder={`그룹${idx + 1}`}
                      style={inputStyle}
                    />
                  </div>
                  <button type="button" onClick={() => removeGroup(idx)} style={btnDangerStyle}>삭제</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => openGroupPicker(idx)} style={btnStyle}>멤버 선택</button>
                  <button type="button" onClick={() => openLeaderPicker(idx)} style={btnStyle}>리더 선택</button>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#444' }}>선택 {Array.isArray(group?.memberIds) ? group.memberIds.length : 0}명</div>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: '#555', lineHeight: 1.45 }}>{groupSummary(group, idx)}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#667085', lineHeight: 1.45 }}>{leaderSummary(group)}</div>
              </div>
            ))}
            <button type="button" style={addBtn} onClick={addGroup}>+ 그룹 추가</button>
          </div>
        ) : safe.mode === 'person' ? (
          <div style={{ marginTop: 12, padding: 10, border: '1px solid #eef2f7', borderRadius: 12, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <button type="button" onClick={openPersonPicker} style={btnStyle}>참가자 선택</button>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#444' }}>선택 {selectedPersonNames.length}명</div>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#555' }}>
              {selectedPersonNames.length ? selectedPersonNames.slice(0, 8).join(', ') + (selectedPersonNames.length > 8 ? ` 외 ${selectedPersonNames.length - 8}명` : '') : '선택된 참가자가 없습니다.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {participantsByRoom.map((room) => (
              <div key={`room-${room.roomNo}`} style={roomRow}>
                <div style={roomTitle}>{getRoomLabel(room.roomNo, roomNames)}</div>
                <div style={roomMembersText}>{room.members.map((p) => p?.nickname).filter(Boolean).join(', ') || '참가자 없음'}</div>
              </div>
            ))}
          </div>
        )}
      </AccordionBox>

      <AccordionBox
        title="참가자 조건"
        summary={summaryRules}
        open={openKey === 'rules'}
        onToggle={() => setOpenKey((prev) => (prev === 'rules' ? '' : 'rules'))}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={labelBox}>
            <span style={fieldLabel}>홀마다 선택할 참가자 수</span>
            <select value={safe.pickCount ?? ''} onChange={(e) => emit({ pickCount: e.target.value === '' ? null : Math.max(1, Math.min(4, Number(e.target.value || 1))) })} style={select}>
              <option value="">선택</option>
              <option value={1}>1명</option>
              <option value={2}>2명</option>
              <option value={3}>3명</option>
              <option value={4}>4명</option>
            </select>
          </label>
          <label style={labelBox}>
            <span style={fieldLabel}>참가자별 최대 선택 횟수</span>
            <select value={safe.maxPerParticipant ?? ''} onChange={(e) => emit({ maxPerParticipant: e.target.value === '' ? null : Math.max(1, Math.min(8, Number(e.target.value || 1))) })} style={select}>
              <option value="">선택</option>
              {Array.from({ length: 8 }, (_, i) => i + 1).map((count) => <option key={`max-${count}`} value={count}>{count}회</option>)}
            </select>
          </label>
        </div>
      </AccordionBox>

      {pickerOpen && (
        <div style={modalBackdrop} onClick={closePicker}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontWeight: 700 }}>
                {pickerType === 'person' ? '참가자 선택' : pickerType === 'leader' ? `리더 선택 - ${getGroupRoomDisplayName(safe.groups[pickerGroupIdx]?.name, pickerGroupIdx, '그룹')}` : `멤버 선택 - ${getGroupRoomDisplayName(safe.groups[pickerGroupIdx]?.name, pickerGroupIdx, '그룹')}`}
              </div>
              <button type="button" onClick={closePicker} style={btnStyle}>닫기</button>
            </div>

            <div style={{ marginTop: 10, maxHeight: 340, overflow:'auto', border: '1px solid #eef2f7', borderRadius: 10, padding: 8 }}>
              {(pickerType === 'leader'
                ? participantsSafe.filter((p) => Array.isArray(safe.groups[pickerGroupIdx]?.memberIds) && safe.groups[pickerGroupIdx].memberIds.map(String).includes(String(p?.id || '')))
                : participantsSafe
              ).map((p) => {
                const pid = String(p.id);
                const checked = pickerType === 'person'
                  ? (Array.isArray(safe.personIds) ? safe.personIds.map(String).includes(pid) : false)
                  : pickerType === 'leader'
                    ? (Array.isArray(safe.groups[pickerGroupIdx]?.leaderIds) ? safe.groups[pickerGroupIdx].leaderIds.map(String).includes(pid) : false)
                    : (Array.isArray(safe.groups[pickerGroupIdx]?.memberIds) ? safe.groups[pickerGroupIdx].memberIds.map(String).includes(pid) : false);
                return (
                  <label key={pid} style={{ display:'flex', alignItems:'center', gap: 8, padding: '6px 4px' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (pickerType === 'person') togglePerson(pid);
                        else if (pickerType === 'leader') toggleLeaderInGroup(pickerGroupIdx, pid);
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

            {pickerType === 'group' && (
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

const box = { display: 'grid', gap: 10, padding: 12, marginTop: 10, border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box' };
const sectionBox = { border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', maxWidth: '100%', boxSizing: 'border-box' };
const sectionButton = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 14px', background: '#fff', border: 'none', cursor: 'pointer', boxSizing: 'border-box' };
const sectionTitle = { fontSize: 14, fontWeight: 700, color: '#111827' };
const sectionSummary = { fontSize: 12, color: '#667085', lineHeight: 1.45, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const sectionBody = { padding: '0 14px 14px', background: '#fff', boxSizing: 'border-box' };
const arrow = { fontSize: 12, color: '#667085', flexShrink: 0 };
const actionRow = { display: 'flex', justifyContent: 'flex-end', marginBottom: 10 };
const resetBtn = { border: '1px solid #d0d7de', background: '#fff', color: '#344054', borderRadius: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 700 };
const chipWrap = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 };
const chip = { width: '100%', border: '1px solid #d5deea', background: '#fff', color: '#1f2937', borderRadius: 10, padding: '10px 8px', fontSize: 13, cursor: 'pointer', fontWeight: 700 };
const chipActive = { borderColor: '#8bb6ff', background: '#edf5ff', color: '#1d4ed8' };
const pillGrid3Style = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 8 };
const pillStyle = { width: '100%', border: '1px solid #cfd8e3', background: '#fff', color: '#1f2937', borderRadius: 999, padding: '10px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 700 };
const pillOnStyle = { borderColor: '#8bb6ff', color: '#1d4ed8', background: '#eef5ff' };
const labelBox = { display: 'grid', gap: 6, minWidth: 0 };
const fieldLabel = { fontSize: 13, fontWeight: 700, color: '#344054' };
const select = { width: '100%', height: 42, borderRadius: 10, border: '1px solid #d0d7de', background: '#fff', padding: '0 12px', fontSize: 14, boxSizing: 'border-box' };
const miniLabel = { fontSize: 12, color: '#666', marginBottom: 6 };
const groupBox = { border: '1px solid #eef2f7', borderRadius: 12, padding: 10, background: '#fff' };
const groupHead = { display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 8 };
const inputStyle = { flex: 1, height: 40, borderRadius: 10, border: '1px solid #d0d7de', background: '#fff', padding: '0 12px', fontSize: 14, boxSizing: 'border-box' };
const btnStyle = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 10, padding: '6px 10px', fontSize: 12, cursor: 'pointer' };
const btnDangerStyle = { ...btnStyle, border: '1px solid #fecaca', color: '#b91c1c', height: 40 };
const addBtn = { width: '100%', border: '1px dashed #98a2b3', background: '#f8fafc', color: '#344054', borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const roomRow = { border: '1px solid #eef2f7', borderRadius: 12, padding: 10, background: '#fff' };
const roomTitle = { fontSize: 13, fontWeight: 800, color: '#183153' };
const roomMembersText = { marginTop: 4, fontSize: 12, color: '#667085', lineHeight: 1.5 };
const modalBackdrop = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 9999 };
const modalCard = { width: '100%', maxWidth: 520, background: '#fff', borderRadius: 14, padding: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' };
