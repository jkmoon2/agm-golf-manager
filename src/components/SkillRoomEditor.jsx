// /src/components/SkillRoomEditor.jsx
// 화면 명칭은 '특별방'으로 사용하며 내부 파일명/저장키는 기존 호환을 위해 유지합니다.

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeSkillRoomConfig } from '../utils/skillRoom';

const normId = (v) => String(v ?? '').trim();
const hdValue = (p) => {
  const n = Number(p?.handicap);
  return Number.isFinite(n) ? n : 0;
};

export default function SkillRoomEditor({
  open,
  onClose,
  onSave,
  value,
  participants = [],
  roomCount = 0,
  roomNames = [],
  roomCapacities = [],
  mode = 'stroke',
}) {
  const normalizedInitial = useMemo(
    () => normalizeSkillRoomConfig(value, { roomCount, participants }),
    [value, roomCount, participants]
  );

  const [draft, setDraft] = useState(normalizedInitial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(normalizedInitial);
  }, [open, normalizedInitial]);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const sortedParticipants = useMemo(() => {
    return [...(Array.isArray(participants) ? participants : [])]
      .filter((p) => p && p.id != null && String(p.nickname || '').trim())
      .sort((a, b) => {
        // 0조(특별방 표시 참가자)를 맨 위에 모은 뒤 G핸디 낮은 순으로 정렬
        const az = Number(a?.group) === 0 ? 0 : 1;
        const bz = Number(b?.group) === 0 ? 0 : 1;
        if (az !== bz) return az - bz;
        const h = hdValue(a) - hdValue(b);
        if (h) return h;
        return String(a.nickname || '').localeCompare(String(b.nickname || ''), 'ko');
      });
  }, [participants]);

  const assignedElsewhere = useMemo(() => {
    const map = new Map();
    (draft.groups || []).forEach((g, gi) => {
      (g.participantIds || []).forEach((id) => map.set(normId(id), gi));
    });
    return map;
  }, [draft.groups]);

  if (!open || typeof document === 'undefined') return null;

  const roomLabel = (roomNo) => {
    const idx = Number(roomNo) - 1;
    const name = String(roomNames?.[idx] || '').trim();
    return name || `${roomNo}번방`;
  };

  const roomCapacity = (roomNo) => {
    const idx = Number(roomNo) - 1;
    const raw = Number(Array.isArray(roomCapacities) ? roomCapacities[idx] : 4);
    return Math.min(4, Math.max(1, Number.isFinite(raw) ? raw : 4));
  };

  const emitDraft = (next) => setDraft(normalizeSkillRoomConfig(next, { roomCount, participants }));

  const addGroup = () => {
    const used = new Set((draft.groups || []).map((g) => Number(g.roomNo)));
    const roomNo = Array.from({ length: Number(roomCount || 0) }, (_, i) => i + 1).find((n) => !used.has(n));
    if (!roomNo) return alert('추가로 지정할 수 있는 방이 없습니다.');
    emitDraft({
      ...draft,
      enabled: true,
      groups: [
        ...(draft.groups || []),
        {
          id: `skill-room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          roomNo,
          participantIds: [],
          includeInRoomRanking: true,
          participateInEvents: true,
        },
      ],
    });
  };

  const updateGroup = (idx, patch) => {
    const groups = (draft.groups || []).map((g, i) => (i === idx ? { ...g, ...patch } : g));
    emitDraft({ ...draft, groups });
  };

  const removeGroup = (idx) => {
    emitDraft({ ...draft, groups: (draft.groups || []).filter((_, i) => i !== idx) });
  };

  const toggleParticipant = (groupIdx, participantId) => {
    const id = normId(participantId);
    const group = draft.groups?.[groupIdx];
    if (!group || !id) return;
    const cur = new Set((group.participantIds || []).map(normId));
    if (cur.has(id)) {
      cur.delete(id);
      updateGroup(groupIdx, { participantIds: Array.from(cur) });
      return;
    }

    const other = assignedElsewhere.get(id);
    if (other != null && other !== groupIdx) return;
    const cap = roomCapacity(group.roomNo);
    if (cur.size >= cap) {
      alert(`${roomLabel(group.roomNo)} 정원은 ${cap}명입니다.`);
      return;
    }
    cur.add(id);
    updateGroup(groupIdx, { participantIds: Array.from(cur) });
  };

  const validate = () => {
    if (!draft.enabled) return null;
    if (!(draft.groups || []).length) return '특별방을 1개 이상 추가해주세요.';
    const roomSet = new Set();
    const memberSet = new Set();
    for (const g of draft.groups || []) {
      const roomNo = Number(g.roomNo);
      if (!roomNo || roomNo < 1 || roomNo > Number(roomCount || 0)) return '특별방의 대상 방을 확인해주세요.';
      if (roomSet.has(roomNo)) return '같은 방을 두 개의 특별방으로 중복 지정할 수 없습니다.';
      roomSet.add(roomNo);
      const ids = Array.isArray(g.participantIds) ? g.participantIds.map(normId).filter(Boolean) : [];
      if (!ids.length) return `${roomLabel(roomNo)}에 참가자를 1명 이상 선택해주세요.`;
      if (ids.length > roomCapacity(roomNo)) return `${roomLabel(roomNo)} 선택 인원이 방 정원을 초과했습니다.`;
      for (const id of ids) {
        if (memberSet.has(id)) return '한 참가자를 여러 특별방에 중복 선택할 수 없습니다.';
        memberSet.add(id);
      }
    }

    // 0조는 특별방 표시용이므로 사용 중인 특별방 설정에서 누락되지 않게 확인
    const zeroMissing = sortedParticipants.filter((p) => Number(p?.group) === 0 && !memberSet.has(normId(p.id)));
    if (zeroMissing.length) {
      const names = zeroMissing.map((p) => p.nickname).slice(0, 8).join(', ');
      return `0조 참가자를 특별방에 모두 선택해주세요: ${names}${zeroMissing.length > 8 ? ' 외' : ''}`;
    }

    // 특별방을 예약하고 남은 일반 방 정원이 일반 참가자 수보다 적으면
    // 자동/수동 배정으로는 모두 수용할 수 없으므로 저장 전에 알려줍니다.
    const normalCount = sortedParticipants.filter((p) => !memberSet.has(normId(p.id))).length;
    const normalCapacity = Array.from({ length: Number(roomCount || 0) }, (_, i) => i + 1)
      .filter((roomNo) => !roomSet.has(roomNo))
      .reduce((sum, roomNo) => sum + roomCapacity(roomNo), 0);
    if (normalCount > normalCapacity) {
      return `일반 참가자 ${normalCount}명을 수용할 일반 방 정원(${normalCapacity}명)이 부족합니다.`;
    }

    return null;
  };

  const saveNow = async () => {
    const error = validate();
    if (error) return alert(error);
    const next = normalizeSkillRoomConfig(draft, { roomCount, participants });
    try {
      setSaving(true);
      await onSave?.(next);
      onClose?.();
    } catch (e) {
      console.warn('[SpecialRoomEditor] save failed:', e);
      alert('특별방 설정 저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  const isFourball = mode === 'fourball' || mode === 'agm';

  return createPortal(
    <div style={overlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div style={modalStyle} onMouseDown={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#0b2d59' }}>특별방 설정</div>
            <div style={{ marginTop: 3, fontSize: 11, color: '#667085' }}>선택 참가자는 자동/수동/Player 배정 시 지정 방으로 반강제됩니다.</div>
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle}>닫기</button>
        </div>

        <div style={bodyStyle}>
          <label style={toggleLineStyle}>
            <input
              type="checkbox"
              checked={draft.enabled === true}
              onChange={(e) => setDraft((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            <b>특별방 사용</b>
          </label>

          <div style={noticeStyle}>
            일반 참가자는 특별방으로 자동 배정되지 않습니다. Admin의 기존 <b>강제</b> 배정은 예외로 그대로 사용할 수 있습니다.
            {isFourball ? <><br />포볼에서도 특별방 참가자는 <b>파트너를 구성하지 않고 스트로크 방식</b>으로 해당 방에 배정됩니다.</> : null}
            <br /><b>0조는 특별방 표시용 선택값</b>입니다. 조 기준 이벤트에 참여해야 한다면 0조 사용 여부를 확인해주세요.
          </div>

          {(draft.groups || []).map((g, gi) => {
            const cap = roomCapacity(g.roomNo);
            const ids = new Set((g.participantIds || []).map(normId));
            return (
              <div key={g.id || gi} style={groupCardStyle}>
                <div style={groupHeaderStyle}>
                  <b>특별방 {gi + 1}</b>
                  <button type="button" onClick={() => removeGroup(gi)} style={removeBtnStyle}>삭제</button>
                </div>

                <div style={grid2Style}>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>대상 방</span>
                    <select
                      value={Number(g.roomNo || 1)}
                      onChange={(e) => updateGroup(gi, { roomNo: Number(e.target.value) })}
                      style={selectStyle}
                    >
                      {Array.from({ length: Number(roomCount || 0) }, (_, i) => i + 1).map((roomNo) => {
                        const usedByOther = (draft.groups || []).some((other, oi) => oi !== gi && Number(other.roomNo) === roomNo);
                        return <option key={roomNo} value={roomNo} disabled={usedByOther}>{roomLabel(roomNo)} · {roomCapacity(roomNo)}명</option>;
                      })}
                    </select>
                  </label>
                  <div style={fieldStyle}>
                    <span style={labelStyle}>선택 인원</span>
                    <div style={countBoxStyle}>{ids.size} / {cap}명</div>
                  </div>
                </div>

                <div style={optionRowStyle}>
                  <label style={checkLabelStyle}>
                    <input
                      type="checkbox"
                      checked={g.includeInRoomRanking !== false}
                      onChange={(e) => updateGroup(gi, { includeInRoomRanking: e.target.checked })}
                    />
                    방 순위 포함
                  </label>
                  <label style={checkLabelStyle}>
                    <input
                      type="checkbox"
                      checked={g.participateInEvents !== false}
                      onChange={(e) => updateGroup(gi, { participateInEvents: e.target.checked })}
                    />
                    이벤트 참여
                  </label>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: '#344054' }}>참가자 선택 · 0조 우선 / G핸디 낮은 순</div>
                <div style={participantListStyle}>
                  {sortedParticipants.map((p) => {
                    const id = normId(p.id);
                    const checked = ids.has(id);
                    const otherIdx = assignedElsewhere.get(id);
                    const disabled = otherIdx != null && otherIdx !== gi;
                    return (
                      <label key={id} style={{ ...participantRowStyle, opacity: disabled ? 0.45 : 1 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleParticipant(gi, id)}
                        />
                        <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>{p.nickname}</span>
                        <span style={{ flex: '0 0 auto', color: '#2563eb', fontWeight: 800 }}>G{p.handicap ?? 0}</span>
                        <span style={{ flex: '0 0 auto', color: Number(p?.group) === 0 ? '#dc2626' : '#667085', fontSize: 11, fontWeight: Number(p?.group) === 0 ? 900 : 400 }}>{Number(p?.group) === 0 ? '0조·특별' : `${p.group}조`}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <button type="button" onClick={addGroup} style={addBtnStyle}>＋ 특별방 추가</button>
        </div>

        <div style={footerStyle}>
          <button type="button" onClick={onClose} style={secondaryBtnStyle} disabled={saving}>취소</button>
          <button type="button" onClick={saveNow} style={primaryBtnStyle} disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(15,23,42,0.42)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box',
};
const modalStyle = {
  width: 'min(430px, 100%)', maxHeight: '88dvh', background: '#fff', borderRadius: 16,
  border: '1px solid #dbe3ef', boxShadow: '0 18px 48px rgba(15,23,42,0.2)', overflow: 'hidden',
  display: 'flex', flexDirection: 'column',
};
const headerStyle = { padding: '14px 14px 10px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid #e7edf5' };
const closeBtnStyle = { border: '1px solid #cfd8e6', borderRadius: 10, background: '#fff', padding: '8px 10px', fontWeight: 800, color: '#344054' };
const bodyStyle = { padding: 12, overflowY: 'auto', WebkitOverflowScrolling: 'touch' };
const toggleLineStyle = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, fontSize: 14, color: '#172b4d' };
const noticeStyle = { padding: '9px 10px', borderRadius: 10, border: '1px dashed #cbd5e1', background: '#f8fafc', fontSize: 11, lineHeight: 1.45, color: '#667085', marginBottom: 10 };
const groupCardStyle = { border: '1px solid #dce5f1', borderRadius: 12, padding: 10, marginBottom: 10, background: '#fff' };
const groupHeaderStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, color: '#0b2d59', marginBottom: 8 };
const removeBtnStyle = { border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', borderRadius: 8, padding: '5px 8px', fontSize: 11, fontWeight: 800 };
const grid2Style = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 };
const labelStyle = { fontSize: 11, color: '#667085', fontWeight: 700 };
const selectStyle = { width: '100%', height: 36, border: '1px solid #d0d7e2', borderRadius: 9, padding: '0 8px', background: '#fff', fontSize: 12, color: '#172b4d' };
const countBoxStyle = { minHeight: 36, border: '1px solid #e2e8f0', borderRadius: 9, background: '#f8fafc', padding: '8px', boxSizing: 'border-box', fontSize: 12, color: '#344054', fontWeight: 700 };
const optionRowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 9 };
const checkLabelStyle = { display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e2e8f0', borderRadius: 9, padding: '8px', fontSize: 12, color: '#344054', fontWeight: 700 };
const participantListStyle = { marginTop: 6, border: '1px solid #e2e8f0', borderRadius: 10, maxHeight: 210, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#fbfdff' };
const participantRowStyle = { minHeight: 36, display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderBottom: '1px solid #edf2f7', fontSize: 12, color: '#172b4d', boxSizing: 'border-box' };
const addBtnStyle = { width: '100%', minHeight: 38, border: '1px dashed #93c5fd', borderRadius: 10, background: '#eff6ff', color: '#1d4ed8', fontWeight: 900 };
const footerStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 12, borderTop: '1px solid #e7edf5', background: '#fff' };
const secondaryBtnStyle = { minHeight: 40, border: '1px solid #cfd8e6', borderRadius: 10, background: '#fff', fontWeight: 800, color: '#344054' };
const primaryBtnStyle = { minHeight: 40, border: '1px solid #2563eb', borderRadius: 10, background: '#2563eb', color: '#fff', fontWeight: 900 };
