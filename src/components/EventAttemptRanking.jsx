// /src/components/EventAttemptRanking.jsx
// 이벤트 누적 입력의 회차별 순위. 기존 누적 결과 계산 및 저장 데이터는 변경하지 않습니다.
import React, { useMemo, useState } from 'react';

export const ATTEMPT_TEMPLATES = ['raw-number', 'range-convert', 'range-convert-bonus'];
export function isAttemptTemplate(ev) { return ATTEMPT_TEMPLATES.includes(ev?.template); }
const hasValue = v => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
export function attemptScore(ev, slot, index) {
  const raw = slot && typeof slot === 'object' && Array.isArray(slot.values)
    ? slot.values[index] : (index === 0 ? slot : undefined);
  if (!hasValue(raw)) return null; // 미입력과 실제 0을 구별
  const n = Number(raw); // 음수도 양수와 동일하게 처리
  const params = ev?.params || {};
  let score = n;
  if (ev?.template !== 'raw-number') {
    const hit = (Array.isArray(params.table) ? params.table : []).find(r =>
      (r.min == null || r.min === '' || n >= Number(r.min)) &&
      (r.max == null || r.max === '' || n <= Number(r.max)));
    score = hit ? Number(hit.score) : 0; // 운영자 기존 미매칭 규칙(0점)을 유지
  }
  if ((ev?.template === 'raw-number' || ev?.template === 'range-convert-bonus') && Array.isArray(params.bonus)) {
    const b = slot && typeof slot === 'object' ? (Array.isArray(slot.bonus) ? slot.bonus[index] : (index === 0 ? slot.bonus : null)) : null;
    const hit = params.bonus.find(x => String(x.label) === String(b ?? '') && String(b ?? '') !== '');
    if (hit) score += Number(hit.score) || 0;
  }
  return score;
}
export function buildAttemptRows(ev, participants, inputs, index, scope, roomNames = []) {
  const per = inputs?.person || {};
  const entries = (participants || []).map(p => ({
    id: String(p.id), name: String(p.nickname || p.name || ''), room: Number(p.room),
    score: attemptScore(ev, per[p.id], index)
  })).filter(p => p.score !== null);
  let rows;
  if (scope === 'room') {
    const groups = new Map();
    entries.forEach(p => {
      if (!Number.isInteger(p.room) || p.room < 1) return;
      const prev = groups.get(p.room) || { id: String(p.room), name: String(roomNames[p.room - 1] || `${p.room}번방`), room: p.room, score: 0, count: 0 };
      prev.score += p.score;
      prev.count += 1;
      groups.set(p.room, prev);
    });
    rows = Array.from(groups.values());
  } else rows = entries;
  const order = ev?.rankOrder === 'desc' ? -1 : 1;
  rows.sort((a,b) => order * (a.score - b.score) || a.name.localeCompare(b.name, 'ko'));
  let lastScore, lastRank = 0;
  return rows.map((r,i) => {
    if (lastScore === undefined || r.score !== lastScore) lastRank = i + 1;
    lastScore = r.score;
    return { ...r, rank: lastRank };
  });
}
export default function EventAttemptRanking({ eventDef, participants = [], inputs = {}, roomNames = [], defaultScope = 'person', onToggleVisible }) {
  const [attemptIndex, setAttemptIndex] = useState(0);
  const [scope, setScope] = useState(defaultScope);
  const isHoleMode = eventDef?.inputMode === 'hole';
  const holes = isHoleMode ? (Array.isArray(eventDef?.params?.selectedHoles) && eventDef.params.selectedHoles.length ? eventDef.params.selectedHoles : Array.from({length:18},(_,i)=>i+1)).map(Number).filter(h=>h>=1&&h<=18) : [];
  const count = isHoleMode ? holes.length : eventDef?.inputMode === 'accumulate' ? Math.max(1, Math.min(20, Number(eventDef.attempts) || 4)) : 1;
  const activeIndex = isHoleMode ? (holes[Math.min(attemptIndex, Math.max(0,count-1))] - 1) : Math.min(attemptIndex, count - 1);
  const current = Math.min(attemptIndex, count - 1);
  const rows = useMemo(() => buildAttemptRows(eventDef, participants, inputs, activeIndex, scope, roomNames), [eventDef, participants, inputs, activeIndex, scope, roomNames]);
  if (!isAttemptTemplate(eventDef)) return null;
  return (
    <div style={{ margin:'10px 0', padding:'10px', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff', minWidth:0 }}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap'}}>
        <strong style={{fontSize:13}}>회차별 순위</strong>
        <div style={{display:'flex', gap:5}}>
          <button type="button" onClick={() => setScope('person')} style={{fontSize:12, fontWeight:scope==='person'?700:400, color:scope==='person'?'#2563eb':'#666'}}>개인</button>
          <button type="button" onClick={() => setScope('room')} style={{fontSize:12, fontWeight:scope==='room'?700:400, color:scope==='room'?'#2563eb':'#666'}}>방</button>
          {typeof onToggleVisible === 'function' && (
            <button type="button" onClick={onToggleVisible} aria-label="Player STEP6 회차별 순위 공개 설정"
              aria-pressed={!!eventDef.attemptRankVisible}
              style={{fontSize:11,fontWeight:700,border:'1px solid #cbd5e1',borderRadius:5,padding:'3px 6px',background:eventDef.attemptRankVisible?'#2563eb':'#f1f5f9',color:eventDef.attemptRankVisible?'#fff':'#475569'}}>
              {eventDef.attemptRankVisible?'ON':'OFF'}
            </button>
          )}
        </div>
      </div>
      <div style={{display:'flex', gap:5, overflowX:'auto', padding:'8px 0'}}>
        {Array.from({length:count}, (_,i) => <button key={i} type="button" onClick={() => setAttemptIndex(i)}
          style={{flex:'0 0 auto', fontSize:12, padding:'5px 10px', borderRadius:5, border:'1px solid #ddd', background:current===i?'#2563eb':'#fff', color:current===i?'#fff':'#333'}}>{isHoleMode ? `${holes[i]}홀` : `입력${i+1}`}</button>)}
      </div>
      <div style={{maxHeight:182, overflowY:'auto', overscrollBehavior:'contain', WebkitOverflowScrolling:'touch'}}>
        <table style={{width:'100%', borderCollapse:'collapse', fontSize:12, textAlign:'center'}}>
          <thead style={{position:'sticky',top:0,background:'#fff',zIndex:1}}><tr><th style={{padding:6, borderBottom:'1px solid #ddd'}}>순위</th><th style={{padding:6, borderBottom:'1px solid #ddd'}}>{scope==='room'?'방':'참가자'}</th><th style={{padding:6, borderBottom:'1px solid #ddd'}}>결과</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id}><td style={{padding:6, borderBottom:'1px solid #eee'}}>{r.rank}위</td><td style={{padding:6, borderBottom:'1px solid #eee'}}>{r.name}</td><td style={{padding:6, borderBottom:'1px solid #eee', fontWeight:700}}>{Number(r.score.toFixed(2))}</td></tr>)}</tbody>
        </table>
        {!rows.length && <div style={{padding:12, textAlign:'center', color:'#888', fontSize:12}}>해당 회차 입력이 없습니다.</div>}
      </div>
    </div>
  );
}
