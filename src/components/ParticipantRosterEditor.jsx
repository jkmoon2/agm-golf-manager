// /src/components/ParticipantRosterEditor.jsx
// STEP4 수동 참가자 신규 추가 / 교체(정보수정) 팝업
// - 기존 STEP4 표 레이아웃은 건드리지 않고 하단 "추가" 버튼에서만 사용
// - 신규 추가: 조/닉네임/G핸디/인증코드/이메일/이름 입력
// - 교체/정보수정: 기존 참가자 ID/방/파트너는 유지한 채 신원정보만 변경

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const normId = (v) => String(v ?? '').trim();
const normText = (v) => String(v ?? '').trim();

const blankForm = () => ({
  group: 1,
  nickname: '',
  handicap: '',
  authCode: '',
  email: '',
  name: '',
});

const formFromParticipant = (p) => ({
  group: Number.isFinite(Number(p?.group)) ? Number(p.group) : 1,
  nickname: String(p?.nickname ?? ''),
  handicap: p?.handicap === null || p?.handicap === undefined ? '' : String(p.handicap),
  authCode: String(p?.authCode ?? ''),
  email: String(p?.email ?? ''),
  name: String(p?.name ?? ''),
});

export default function ParticipantRosterEditor({
  open,
  participants = [],
  selectedParticipantIds = [],
  roomNames = [],
  mode = 'stroke',
  onClose,
  onSubmit,
}) {
  const [editorMode, setEditorMode] = useState('add'); // add | replace
  const [targetId, setTargetId] = useState('');
  const [replaceAction, setReplaceAction] = useState('edit'); // edit | replace
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);

  const selectedIdSet = useMemo(
    () => new Set((Array.isArray(selectedParticipantIds) ? selectedParticipantIds : []).map(normId)),
    [selectedParticipantIds]
  );

  const initialTargetId = useMemo(() => {
    const selected = (participants || []).find((p) => selectedIdSet.has(normId(p?.id)));
    return normId(selected?.id ?? participants?.[0]?.id ?? '');
  }, [participants, selectedIdSet]);

  const target = useMemo(
    () => (participants || []).find((p) => normId(p?.id) === normId(targetId)) || null,
    [participants, targetId]
  );

  useEffect(() => {
    if (!open) return;
    setEditorMode('add');
    setTargetId(initialTargetId);
    setReplaceAction('edit');
    setForm(blankForm());
    setSaving(false);
  }, [open, initialTargetId]);

  useEffect(() => {
    if (!open || editorMode !== 'replace') return;
    if (!targetId && initialTargetId) setTargetId(initialTargetId);
  }, [open, editorMode, targetId, initialTargetId]);

  useEffect(() => {
    if (!open || editorMode !== 'replace') return;
    setForm(formFromParticipant(target));
  }, [open, editorMode, targetId, target]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, saving, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const switchMode = (nextMode) => {
    if (saving) return;
    setEditorMode(nextMode);
    if (nextMode === 'add') {
      setForm(blankForm());
    } else {
      const nextTargetId = targetId || initialTargetId;
      setTargetId(nextTargetId);
      const p = (participants || []).find((x) => normId(x?.id) === normId(nextTargetId));
      setForm(formFromParticipant(p));
    }
  };

  const submitNow = async () => {
    if (saving) return;
    try {
      setSaving(true);
      const ok = await onSubmit?.({
        mode: editorMode,
        replaceAction: editorMode === 'replace' ? replaceAction : null,
        targetId: editorMode === 'replace' ? targetId : null,
        form: {
          ...form,
          group: Number(form.group),
          nickname: normText(form.nickname),
          authCode: normText(form.authCode),
          email: normText(form.email).toLowerCase(),
          name: normText(form.name),
        },
      });
      if (ok !== false) onClose?.();
    } catch (e) {
      console.warn('[ParticipantRosterEditor] submit failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const assignedRoom = Number(target?.room ?? target?.roomNumber ?? 0) || null;
  const assignedRoomName = assignedRoom
    ? (String(roomNames?.[assignedRoom - 1] ?? '').trim() || `${assignedRoom}번방`)
    : '';
  const hasPartner = target?.partner != null || target?.teammateId != null || target?.teammate != null;

  return createPortal(
    <div style={overlayStyle} onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose?.(); }}>
      <div style={modalStyle} onMouseDown={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={titleStyle}>참가자 추가 / 교체</div>
          <button type="button" style={closeButtonStyle} onClick={onClose} disabled={saving}>닫기</button>
        </div>

        <div style={modeRowStyle}>
          <button
            type="button"
            style={editorMode === 'add' ? activeModeButtonStyle : modeButtonStyle}
            onClick={() => switchMode('add')}
            disabled={saving}
          >
            신규 추가
          </button>
          <button
            type="button"
            style={editorMode === 'replace' ? activeModeButtonStyle : modeButtonStyle}
            onClick={() => switchMode('replace')}
            disabled={saving || !(participants || []).length}
          >
            참가자 교체/정보수정
          </button>
        </div>

        <div style={bodyStyle}>
          {editorMode === 'replace' && (
            <label style={fieldStyle}>
              <span style={labelStyle}>대상 참가자</span>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                style={inputStyle}
                disabled={saving}
              >
                {(participants || []).map((p) => (
                  <option key={normId(p?.id)} value={normId(p?.id)}>
                    {String(p?.nickname || '(닉네임 없음)')} · {Number.isFinite(Number(p?.group)) ? Number(p.group) : 1}조
                  </option>
                ))}
              </select>
            </label>
          )}

          {editorMode === 'replace' && (
            <div style={replaceActionBoxStyle}>
              <button
                type="button"
                style={replaceAction === 'edit' ? activeSmallChoiceStyle : smallChoiceStyle}
                onClick={() => setReplaceAction('edit')}
                disabled={saving}
              >
                정보수정
              </button>
              <button
                type="button"
                style={replaceAction === 'replace' ? activeSmallChoiceStyle : smallChoiceStyle}
                onClick={() => setReplaceAction('replace')}
                disabled={saving}
              >
                새 참가자로 교체
              </button>
            </div>
          )}

          <div style={gridStyle}>
            <label style={fieldStyle}>
              <span style={labelStyle}>조</span>
              <select
                value={Number(form.group)}
                onChange={(e) => setField('group', Number(e.target.value))}
                style={inputStyle}
                disabled={saving}
              >
                {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label style={fieldStyle}>
              <span style={labelStyle}>G핸디</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.handicap}
                onChange={(e) => setField('handicap', e.target.value)}
                style={inputStyle}
                placeholder="0"
                disabled={saving}
              />
            </label>
          </div>

          <label style={fieldStyle}>
            <span style={labelStyle}>닉네임</span>
            <input
              type="text"
              value={form.nickname}
              onChange={(e) => setField('nickname', e.target.value)}
              style={inputStyle}
              placeholder="닉네임"
              disabled={saving}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>인증코드</span>
            <input
              type="text"
              value={form.authCode}
              onChange={(e) => setField('authCode', e.target.value)}
              style={inputStyle}
              placeholder="기존 참가자 인증코드"
              autoCapitalize="off"
              autoCorrect="off"
              disabled={saving}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>이메일</span>
            <input
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              style={inputStyle}
              placeholder="example@email.com"
              autoCapitalize="none"
              autoCorrect="off"
              disabled={saving}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>이름</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              style={inputStyle}
              placeholder="실명"
              disabled={saving}
            />
          </label>

          <div style={infoStyle}>
            {editorMode === 'add'
              ? '신규 추가는 기존 참가자의 방배정·점수·파트너 상태를 변경하지 않습니다.'
              : (replaceAction === 'replace'
                ? `새 참가자로 교체하면 기존 ID${assignedRoomName ? `·${assignedRoomName}` : ''}${hasPartner ? '·포볼 파트너' : ''}를 유지하고, 이전 참가자의 점수만 초기화합니다.`
                : `정보수정은 기존 ID${assignedRoomName ? `·${assignedRoomName}` : ''}${hasPartner ? '·포볼 파트너' : ''}와 점수를 모두 유지합니다.`)}
            {['fourball', 'agm'].includes(String(mode || '').toLowerCase()) && editorMode === 'add'
              ? ' 일반 포볼에서 인원만 추가하면 1·2조 균형을 확인해야 합니다.'
              : ''}
          </div>
        </div>

        <div style={footerStyle}>
          <button type="button" style={cancelButtonStyle} onClick={onClose} disabled={saving}>취소</button>
          <button type="button" style={saveButtonStyle} onClick={submitNow} disabled={saving || (editorMode === 'replace' && !targetId)}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 2147482000,
  background: 'rgba(15, 23, 42, 0.32)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '14px',
  boxSizing: 'border-box',
};

const modalStyle = {
  width: 'min(360px, 100%)',
  maxHeight: 'min(760px, calc(100dvh - 28px))',
  overflow: 'hidden',
  background: '#fff',
  border: '1px solid #d6dbe3',
  borderRadius: '16px',
  boxShadow: '0 14px 38px rgba(15,23,42,.22)',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '12px 12px 8px',
  borderBottom: '1px solid #e5e7eb',
};

const titleStyle = { fontSize: '17px', fontWeight: 900, color: '#0b2d59' };
const closeButtonStyle = {
  minWidth: '48px',
  height: '32px',
  padding: '0 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  background: '#fff',
  color: '#111827',
  whiteSpace: 'nowrap',
};

const modeRowStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '6px',
  padding: '10px 12px 4px',
};

const modeButtonStyle = {
  height: '34px',
  border: '1px solid #d1d5db',
  borderRadius: '9px',
  background: '#fff',
  color: '#334155',
  fontSize: '13px',
  fontWeight: 700,
};

const activeModeButtonStyle = {
  ...modeButtonStyle,
  border: '1px solid #93c5fd',
  background: '#eff6ff',
  color: '#1d4ed8',
};

const bodyStyle = {
  padding: '8px 12px 10px',
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
};

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '8px',
};

const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  marginBottom: '8px',
};

const labelStyle = {
  fontSize: '12px',
  color: '#334155',
  fontWeight: 700,
};

const inputStyle = {
  width: '100%',
  height: '36px',
  padding: '0 9px',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  background: '#fff',
  color: '#111827',
  fontSize: '14px',
  boxSizing: 'border-box',
  outline: 'none',
};

const replaceActionBoxStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '6px',
  marginBottom: '8px',
};

const smallChoiceStyle = {
  height: '32px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  background: '#fff',
  color: '#475569',
  fontSize: '12px',
  fontWeight: 700,
};

const activeSmallChoiceStyle = {
  ...smallChoiceStyle,
  border: '1px solid #93c5fd',
  background: '#eff6ff',
  color: '#1d4ed8',
};

const infoStyle = {
  marginTop: '2px',
  padding: '8px 9px',
  border: '1px dashed #d1d5db',
  borderRadius: '8px',
  background: '#f8fafc',
  color: '#64748b',
  fontSize: '11px',
  lineHeight: 1.45,
};

const footerStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '8px',
  padding: '10px 12px 12px',
  borderTop: '1px solid #e5e7eb',
};

const cancelButtonStyle = {
  height: '38px',
  border: '1px solid #cbd5e1',
  borderRadius: '9px',
  background: '#fff',
  color: '#334155',
  fontWeight: 700,
};

const saveButtonStyle = {
  height: '38px',
  border: '1px solid #2563eb',
  borderRadius: '9px',
  background: '#2563eb',
  color: '#fff',
  fontWeight: 800,
};
