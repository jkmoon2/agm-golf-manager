// /src/components/RoomAvoidanceEditor.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeRoomAvoidance, getAvoidViolations } from '../utils/roomAvoidance';
import { getAssignmentRoom } from '../utils/assignmentCompat';

export default function RoomAvoidanceEditor({ open, onClose, onSave, value, participants = [], skillRoomConfig }) {
  const [draft, setDraft] = useState({ enabled: false, pairs: [] });
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => participants.filter(p => p?.id != null && String(p.nickname || '').trim()), [participants]);
  const names = useMemo(() => new Map(people.map(p => [String(p.id), `${p.group}조 · ${p.nickname}`])), [people]);
  useEffect(() => { if (open) { setDraft(normalizeRoomAvoidance(value, participants)); setFirst(''); setSecond(''); } }, [open, value, participants]);
  useEffect(() => {
    if (!open) return undefined;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = before; document.removeEventListener('keydown', key); };
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;
  const add = () => {
    if (!first || !second || first === second) return alert('서로 다른 참가자 2명을 선택해주세요.');
    const pair = [first, second].sort();
    if (draft.pairs.some(p => p[0] === pair[0] && p[1] === pair[1])) return alert('이미 등록된 페어입니다.');
    setDraft(d => ({ enabled: true, pairs: [...d.pairs, pair] }));
    setFirst(''); setSecond('');
  };
  const save = async () => {
    const next = normalizeRoomAvoidance(draft, participants);
    const violations = next.enabled ? getAvoidViolations(normalizeRoomAvoidance(next, participants, skillRoomConfig), participants, getAssignmentRoom) : [];
    if (violations.length && !window.confirm(`이미 같은 방에 배정된 금지 페어 ${violations.length}건이 있습니다.\n현재 배정은 자동 변경되지 않습니다. 배정을 취소/초기화한 뒤 다시 배정해주세요.\n설정을 저장하시겠습니까?`)) return;
    setBusy(true);
    try { await onSave(next); onClose(); } catch (e) { alert('방조정 설정 저장에 실패했습니다.'); } finally { setBusy(false); }
  };
  const btn = { padding: '8px 12px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, fontWeight: 700, color: '#0b2d59' };
  const select = { minWidth: 0, flex: 1, padding: '8px 4px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#fff', fontSize: 13 };
  return createPortal(<div style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(0,0,0,.45)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 12, boxSizing: 'border-box' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label="방조정 설정" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '85dvh', overflowY: 'auto', padding: 16, boxSizing: 'border-box', color: '#172b4d' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}><b style={{ fontSize: 17 }}>방조정 설정</b><button style={btn} onClick={onClose}>닫기</button></div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}><input type="checkbox" checked={draft.enabled} onChange={e => setDraft(d => ({ ...d, enabled: e.target.checked }))} /><b>방조정 사용</b></label>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: '#526176', marginBottom: 12 }}>두 참가자를 등록하면 서로 같은 방에 배정되지 않습니다. 여러 페어를 추가할 수 있으며, 같은 참가자를 여러 번 선택할 수 있습니다. 특별방으로 선택한 참가자는 방조정 검사에서 제외되며, 일반방에만 적용됩니다. 설정을 사용하지 않으면 기존 랜덤 방배정 방식으로 동작합니다.</div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
        <select style={select} value={first} onChange={e => setFirst(e.target.value)}><option value="">참가자 A</option>{people.map(p => <option key={p.id} value={String(p.id)}>{names.get(String(p.id))}</option>)}</select>
        <span style={{ alignSelf: 'center' }}>–</span>
        <select style={select} value={second} onChange={e => setSecond(e.target.value)}><option value="">참가자 B</option>{people.filter(p => String(p.id) !== first).map(p => <option key={p.id} value={String(p.id)}>{names.get(String(p.id))}</option>)}</select>
        <button style={btn} onClick={add}>추가</button>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, padding: '8px 0' }}>등록된 페어 ({draft.pairs.length}건)</div>
      <div style={{ maxHeight: 250, overflowY: 'auto' }}>{draft.pairs.length === 0 ? <div style={{ padding: 14, color: '#7b8794', textAlign: 'center' }}>등록된 페어가 없습니다.</div> : draft.pairs.map(([a, b], i) => <div key={`${a}-${b}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, padding: '8px 2px', borderBottom: '1px solid #e5e7eb', fontSize: 13, alignItems: 'center' }}><span>{i + 1}. {names.get(a) || a} ↔ {names.get(b) || b}</span><button style={btn} onClick={() => setDraft(d => ({ ...d, pairs: d.pairs.filter((_, j) => i !== j) }))}>삭제</button></div>)}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}><button style={btn} onClick={onClose}>취소</button><button style={{ ...btn, background: '#0b5fbd', color: 'white' }} onClick={save} disabled={busy}>{busy ? '저장중...' : '저장'}</button></div>
    </div>
  </div>, document.body);
}
