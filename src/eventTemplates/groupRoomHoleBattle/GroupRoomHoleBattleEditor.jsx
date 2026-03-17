// /src/eventTemplates/groupRoomHoleBattle/GroupRoomHoleBattleEditor.jsx
import React, { useMemo, useState } from 'react';
import { defaultGroupRoomHoleBattleParams, getRoomLabel, normalizeGroupRoomHoleBattleParams } from '../../events/groupRoomHoleBattle';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const PICKS = [1, 2, 3, 4];
const MAX_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8];

function summaryHoles(selectedHoles) {
  if (selectedHoles.length === 18) return '기본값';
  return selectedHoles.map((holeNo) => `${holeNo}홀`).join(', ');
}

export default function GroupRoomHoleBattleEditor({ participants = [], roomNames = [], roomCount = 0, value, onChange }) {
  const safe = useMemo(() => normalizeGroupRoomHoleBattleParams(value || defaultGroupRoomHoleBattleParams(), { participants, roomNames, roomCount }), [value, participants, roomNames, roomCount]);
  const [openKey, setOpenKey] = useState('');

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
    emit({ selectedHoles: next.sort((a, b) => a - b) });
  };

  const setMode = (mode) => {
    emit({ mode });
  };

  const updateGroupName = (idx, name) => {
    const next = safe.groups.map((group, groupIdx) => groupIdx === idx ? { ...group, name } : group);
    emit({ groups: next });
  };

  const toggleGroupMember = (idx, memberId) => {
    const next = safe.groups.map((group, groupIdx) => {
      if (groupIdx !== idx) return group;
      const has = group.memberIds.includes(String(memberId));
      return {
        ...group,
        memberIds: has
          ? group.memberIds.filter((id) => String(id) !== String(memberId))
          : [...group.memberIds, String(memberId)],
      };
    });
    emit({ groups: next });
  };

  const addGroup = () => {
    emit({ groups: [...safe.groups, { key: `group-${safe.groups.length + 1}`, name: `그룹${safe.groups.length + 1}`, memberIds: [] }] });
  };

  const removeGroup = (idx) => {
    const next = safe.groups.filter((_, groupIdx) => groupIdx !== idx);
    emit({ groups: next.length ? next : [{ key: 'group-1', name: '그룹1', memberIds: [] }] });
  };

  const participantsByRoom = useMemo(() => {
    const out = Array.from({ length: Math.max(0, Number(roomCount || 0)) }, (_, idx) => ({ roomNo: idx + 1, members: [] }));
    (Array.isArray(participants) ? participants : []).forEach((p) => {
      const roomNo = Number(p?.room || 0);
      if (roomNo >= 1 && roomNo <= out.length) out[roomNo - 1].members.push(p);
    });
    return out;
  }, [participants, roomCount]);

  return (
    <div style={box}>
      <div style={titleRow}>
        <div style={{ fontWeight: 700 }}>그룹/방 홀별 지목전 설정</div>
        <div style={badge}>생성</div>
      </div>

      <AccordionBox
        title="사용 홀 선택"
        summary={summaryHoles(safe.selectedHoles)}
        open={openKey === 'holes'}
        onToggle={() => setOpenKey((prev) => (prev === 'holes' ? '' : 'holes'))}
      >
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
        title="그룹 / 방 모드"
        summary={safe.mode === 'room' ? '방 모드' : `그룹 모드 · ${safe.groups.length}개 그룹`}
        open={openKey === 'mode'}
        onToggle={() => setOpenKey((prev) => (prev === 'mode' ? '' : 'mode'))}
      >
        <div style={pillGridStyle}>
          <button type="button" onClick={() => setMode('group')} style={{ ...pillStyle, ...(safe.mode === 'group' ? pillOnStyle : null) }}>그룹</button>
          <button type="button" onClick={() => setMode('room')} style={{ ...pillStyle, ...(safe.mode === 'room' ? pillOnStyle : null) }}>방</button>
        </div>

        {safe.mode === 'group' ? (
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {safe.groups.map((group, idx) => (
              <div key={group.key || idx} style={groupBox}>
                <div style={groupHead}>
                  <input style={input} value={group.name} onChange={(e) => updateGroupName(idx, e.target.value)} placeholder={`그룹${idx + 1}`} />
                  <button type="button" style={removeBtn} onClick={() => removeGroup(idx)}>삭제</button>
                </div>
                <div style={memberChipWrap}>
                  {(Array.isArray(participants) ? participants : []).map((p) => {
                    const active = group.memberIds.includes(String(p?.id));
                    return (
                      <button
                        key={`${group.key}-${p?.id}`}
                        type="button"
                        onClick={() => toggleGroupMember(idx, p?.id)}
                        style={{ ...memberChip, ...(active ? memberChipOn : null) }}
                      >
                        {p?.nickname || ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button type="button" style={addBtn} onClick={addGroup}>+ 그룹 추가</button>
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
        summary={`${safe.pickCount}명 선택 · 인당 최대 ${safe.maxPerParticipant}회`}
        open={openKey === 'rules'}
        onToggle={() => setOpenKey((prev) => (prev === 'rules' ? '' : 'rules'))}
      >
        <div style={fieldLabel}>홀마다 선택할 참가자 수</div>
        <div style={pillGridStyle}>
          {PICKS.map((count) => (
            <button key={`pick-${count}`} type="button" onClick={() => emit({ pickCount: count })} style={{ ...pillStyle, ...(safe.pickCount === count ? pillOnStyle : null) }}>
              {count}명
            </button>
          ))}
        </div>
        <div style={{ ...fieldLabel, marginTop: 12 }}>참가자별 최대 선택 횟수</div>
        <div style={pillGridStyle}>
          {MAX_COUNTS.map((count) => (
            <button key={`max-${count}`} type="button" onClick={() => emit({ maxPerParticipant: count })} style={{ ...pillStyle, ...(safe.maxPerParticipant === count ? pillOnStyle : null) }}>
              {count}회
            </button>
          ))}
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

const box = { display: 'grid', gap: 10, padding: 12, marginTop: 10, border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box' };
const titleRow = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
const badge = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 46, height: 28, padding: '0 10px', borderRadius: 999, background: '#e9f4ff', color: '#2563eb', fontSize: 12, fontWeight: 700 };
const sectionBox = { border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', maxWidth: '100%', boxSizing: 'border-box' };
const sectionButton = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 14px', background: '#fff', border: 'none', cursor: 'pointer', boxSizing: 'border-box' };
const sectionTitle = { fontSize: 14, fontWeight: 700, color: '#111827' };
const sectionSummary = { fontSize: 12, color: '#667085', lineHeight: 1.45, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const sectionBody = { padding: '0 14px 14px', background: '#fff', boxSizing: 'border-box' };
const arrow = { fontSize: 12, color: '#667085', flexShrink: 0 };
const chipWrap = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 };
const chip = { width: '100%', border: '1px solid #d5deea', background: '#fff', color: '#1f2937', borderRadius: 10, padding: '10px 8px', fontSize: 13, cursor: 'pointer', fontWeight: 700 };
const chipActive = { borderColor: '#8bb6ff', background: '#edf5ff', color: '#1d4ed8' };
const pillGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 8 };
const pillStyle = { width: '100%', border: '1px solid #cfd8e3', background: '#fff', color: '#1f2937', borderRadius: 999, padding: '10px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 700 };
const pillOnStyle = { borderColor: '#8bb6ff', color: '#1d4ed8', background: '#eef5ff' };
const fieldLabel = { fontSize: 13, fontWeight: 700, color: '#344054' };
const groupBox = { border: '1px solid #eef2f7', borderRadius: 12, padding: 10, background: '#fff' };
const groupHead = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 };
const input = { flex: 1, height: 40, borderRadius: 10, border: '1px solid #d0d7de', background: '#fff', padding: '0 12px', fontSize: 14, boxSizing: 'border-box' };
const removeBtn = { border: '1px solid #fecaca', background: '#fff1f2', color: '#b42318', borderRadius: 10, padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const addBtn = { border: '1px dashed #93c5fd', background: '#eff6ff', color: '#1d4ed8', borderRadius: 12, padding: '10px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const memberChipWrap = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 };
const memberChip = { width: '100%', border: '1px solid #d5deea', background: '#fff', color: '#334155', borderRadius: 10, padding: '8px 10px', fontSize: 13, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const memberChipOn = { borderColor: '#8bb6ff', background: '#eef5ff', color: '#1d4ed8', fontWeight: 700 };
const roomRow = { border: '1px solid #eef2f7', borderRadius: 12, padding: 10, background: '#fff' };
const roomTitle = { fontSize: 13, fontWeight: 800, color: '#183153', marginBottom: 4 };
const roomMembersText = { fontSize: 12, color: '#667085', lineHeight: 1.5, wordBreak: 'keep-all' };
