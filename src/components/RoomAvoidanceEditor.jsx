// /src/components/RoomAvoidanceEditor.jsx
// 특별방 설정과 동일한 팝업 스타일. 모바일 기본 select의 옵션 잘림을 방지하기 위해 내부 스크롤 선택 목록 사용.
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeRoomAvoidance, getAvoidViolations } from '../utils/roomAvoidance';
import { getAssignmentRoom } from '../utils/assignmentCompat';

const overlayStyle = { position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(15,23,42,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box' };
const modalStyle = { width: 'min(430px, 100%)', maxHeight: '88dvh', background: '#fff', borderRadius: 16, border: '1px solid #dbe3ef', boxShadow: '0 18px 48px rgba(15,23,42,0.2)', overflow: 'hidden', display: 'flex', flexDirection: 'column', color: '#172b4d' };
const headerStyle = { padding: '14px 14px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid #e7edf5' };
const closeBtnStyle = { minWidth: 58, height: 34, border: '1px solid #cfd8e6', borderRadius: 10, background: '#fff', padding: '0 12px', fontWeight: 800, color: '#344054' };
const bodyStyle = { padding: 12, overflowY: 'auto', WebkitOverflowScrolling: 'touch' };
const secondaryBtnStyle = { minHeight: 40, border: '1px solid #cfd8e6', borderRadius: 10, background: '#fff', fontWeight: 800, color: '#344054' };
const primaryBtnStyle = { minHeight: 40, border: '1px solid #2563eb', borderRadius: 10, background: '#2563eb', color: '#fff', fontWeight: 900 };
const chooserButtonStyle = { width: '100%', minHeight: 37, textAlign: 'left', background: '#fff', border: '1px solid #d0d7e2', borderRadius: 9, color: '#172b4d', fontSize: 12, padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const removeBtnStyle = { border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', borderRadius: 8, padding: '5px 8px', fontSize: 11, fontWeight: 800 };

export default function RoomAvoidanceEditor({ open, onClose, onSave, value, participants = [], skillRoomConfig }) {
  const [draft, setDraft] = useState({ enabled: false, includeSpecialRooms: false, pairs: [] });
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [picker, setPicker] = useState(null);
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => [...participants].filter(p => p?.id != null && String(p.nickname || '').trim()).sort((a,b) => Number(a.group) - Number(b.group) || String(a.nickname).localeCompare(String(b.nickname), 'ko')), [participants]);
  const names = useMemo(() => new Map(people.map(p => [String(p.id), `${p.group}조 · ${p.nickname}`])), [people]);
  // 표시용: 페어 내부도 조 순서로, 등록 페어 전체도 조 번호 순서로 정렬.
  // 실제 저장되는 참가자 ID와 배정 규칙은 변경하지 않습니다.
  const memberOrder = useMemo(() => new Map(people.map((p, i) => [String(p.id), i])), [people]);
  const orderedPairs = useMemo(() => draft.pairs.map(pair => [...pair].sort((a, b) =>
    (memberOrder.get(a) ?? Infinity) - (memberOrder.get(b) ?? Infinity)
  )).sort((p, q) =>
    (memberOrder.get(p[0]) ?? Infinity) - (memberOrder.get(q[0]) ?? Infinity) ||
    (memberOrder.get(p[1]) ?? Infinity) - (memberOrder.get(q[1]) ?? Infinity)
  ), [draft.pairs, memberOrder]);
  useEffect(() => { if (open) { setDraft(normalizeRoomAvoidance(value, participants)); setFirst(''); setSecond(''); setPicker(null); } }, [open, value, participants]);
  useEffect(() => {
    if (!open) return undefined;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = e => { if (e.key === 'Escape') { if (picker) setPicker(null); else onClose(); } };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = before; document.removeEventListener('keydown', key); };
  }, [open, onClose, picker]);
  if (!open || typeof document === 'undefined') return null;

  const add = () => {
    if (!first || !second || first === second) return alert('서로 다른 참가자 2명을 선택해주세요.');
    const pair = [first, second].sort();
    if (draft.pairs.some(p => p[0] === pair[0] && p[1] === pair[1])) return alert('이미 등록된 페어입니다.');
    setDraft(d => ({ ...d, enabled: true, pairs: [...d.pairs, pair] }));
    setFirst(''); setSecond('');
  };
  const save = async () => {
    const next = normalizeRoomAvoidance(draft, participants);
    const active = normalizeRoomAvoidance(next, participants, skillRoomConfig);
    const violations = next.enabled ? getAvoidViolations(active, participants, getAssignmentRoom) : [];
    if (violations.length && !window.confirm(`이미 같은 방에 배정된 금지 페어 ${violations.length}건이 있습니다.\n현재 배정은 자동 변경되지 않습니다. 배정을 취소/초기화한 뒤 다시 배정해주세요.\n설정을 저장하시겠습니까?`)) return;
    setBusy(true);
    try {
      await onSave(next);
      onClose();
    } catch (e) {
      console.error('[RoomAvoidanceEditor] save failed', e);
      const code = String(e?.code || 'unknown');
      if (code.includes('permission-denied')) alert('방조정 설정 저장 권한이 없습니다.\nFirestore 보안 규칙에서 events 문서의 roomAvoidance 필드가 허용되어 있는지 확인해주세요.\n오류: ' + code);
      else alert('방조정 설정 저장에 실패했습니다.\n오류: ' + code + (e?.message ? '\n' + e.message : ''));
    } finally { setBusy(false); }
  };
  const chooser = (key, chosen, other, label) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <button type="button" style={chooserButtonStyle} onClick={() => setPicker(picker === key ? null : key)}>{names.get(chosen) || label} ▾</button>
    </div>
  );
  return createPortal(
    <div style={overlayStyle} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="방조정 설정" style={modalStyle}>
        <div style={headerStyle}><b style={{ fontSize: 17, fontWeight: 900, color: '#0b2d59' }}>방조정 설정</b><button type="button" style={closeBtnStyle} onClick={onClose}>닫기</button></div>
        <div style={bodyStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, fontSize: 14 }}><input type="checkbox" checked={draft.enabled} onChange={e => setDraft(d => ({ ...d, enabled: e.target.checked }))}/><b>방조정 사용</b></label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, marginBottom: 8, fontSize: 13, color: '#344054' }}><input type="checkbox" checked={draft.includeSpecialRooms === true} onChange={e => setDraft(d => ({ ...d, includeSpecialRooms: e.target.checked }))}/><b>특별방 포함</b></label>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 8 }}>
            {chooser('first', first, second, '참가자 A')}<span>–</span>{chooser('second', second, first, '참가자 B')}
            <button type="button" style={{ ...closeBtnStyle, minWidth: 44, padding: '0 8px' }} onClick={add}>추가</button>
          </div>
          {picker && <div style={{ border: '1px solid #dce5f1', background: '#fbfdff', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ padding: '8px', fontSize: 12, fontWeight: 800, color: '#0b2d59', borderBottom: '1px solid #edf2f7' }}>{picker === 'first' ? '참가자 A 선택' : '참가자 B 선택'} · 전체 {people.length}명</div>
            <div style={{ maxHeight: 'min(34dvh, 240px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {people.filter(p => String(p.id) !== (picker === 'first' ? second : first)).map(p => <button type="button" key={p.id} onClick={() => { if (picker === 'first') setFirst(String(p.id)); else setSecond(String(p.id)); setPicker(null); }} style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, borderBottom: '1px solid #edf2f7', background: '#fff', minHeight: 38, padding: '8px 10px', color: '#172b4d', fontSize: 13 }}>{names.get(String(p.id))}</button>)}
            </div>
          </div>}
          <div style={{ fontSize: 13, fontWeight: 800, color: '#344054', padding: '8px 0' }}>등록된 페어 ({draft.pairs.length}건)</div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fbfdff', maxHeight: 230, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {!draft.pairs.length ? <div style={{ padding: 16, fontSize: 13, textAlign: 'center', color: '#7b8794' }}>등록된 페어가 없습니다.</div> : orderedPairs.map(([a,b],i) => <div key={`${a}-${b}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 9px', gap: 8, borderBottom: '1px solid #edf2f7', fontSize: 12 }}><span style={{ flex: 1 }}>{i+1}. {names.get(a)||a} ↔ {names.get(b)||b}</span><button type="button" style={removeBtnStyle} onClick={() => setDraft(d => ({ ...d, pairs: d.pairs.filter(p => !(p.includes(a) && p.includes(b))) }))}>삭제</button></div>)}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 12, borderTop: '1px solid #e7edf5' }}><button type="button" style={secondaryBtnStyle} disabled={busy} onClick={onClose}>취소</button><button type="button" style={primaryBtnStyle} disabled={busy} onClick={save}>{busy ? '저장 중…' : '저장'}</button></div>
      </div>
    </div>, document.body
  );
}
