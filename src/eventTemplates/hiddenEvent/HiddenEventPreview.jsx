// /src/eventTemplates/hiddenEvent/HiddenEventPreview.jsx

import React from 'react';
import { computeHiddenEvent, normalizeHiddenEventParams } from '../../events/hiddenEvent';

const fmt = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return String(Math.round(n * 10) / 10).replace(/\.0$/, '');
};

export default function HiddenEventPreview({ eventDef, participants = [], inputsByEvent = {}, roomNames = [] }) {
  const cfg = normalizeHiddenEventParams(eventDef?.params);
  const data = computeHiddenEvent(eventDef, participants, inputsByEvent, { roomNames });

  if (cfg.mode === 'fourball') {
    const rows = Array.isArray(data?.teamRows) ? data.teamRows : [];
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, color: '#667085', marginBottom: 8 }}>{cfg.fourballMode === 'self' ? '포볼 직접선택 상태' : '포볼팀 상태'}: <b>{cfg.revealed ? '공개' : '비공개'}</b></div>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
          {!rows.length && <li style={{ color: '#999', fontSize: 13 }}>{cfg.fourballMode === 'self' ? '아직 선택된 팀원이 없습니다.' : '아직 포볼팀이 배정되지 않았습니다.'}</li>}
          {rows.map((row, idx) => (
            <li key={row.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, border: '1px solid #e5eaf2', borderRadius: 10, padding: '8px 10px', background: '#fff' }}>
              <span><b>{idx + 1}.</b> {row.label} <small style={{ color: '#2563eb', fontWeight: 800 }}>G합 {fmt(row.handicapSum)}</small></span>
              <b style={{ color: '#be123c' }}>{fmt(row.value)}</b>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const rows = Array.isArray(data?.matchRows) ? data.matchRows : [];
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, color: '#667085', marginBottom: 8 }}>개인 지목 상태: <b>{cfg.revealed ? '공개' : '비공개'}</b></div>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
        {!rows.length && <li style={{ color: '#999', fontSize: 13 }}>아직 선택된 상대가 없습니다.</li>}
        {rows.map((row, idx) => (
          <li key={row.key} style={{ border: '1px solid #e5eaf2', borderRadius: 10, padding: '8px 10px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span><b>{idx + 1}.</b> {row.name} vs {row.opponentName}</span>
              <b style={{ color: row.status === 'win' ? '#1d4ed8' : row.status === 'lose' ? '#be123c' : '#64748b' }}>{row.resultText}</b>
            </div>
            <div style={{ marginTop: 3, fontSize: 12, color: '#667085' }}>
              결과 {fmt(row.value)} : {fmt(row.opponentValue)} · 조핸디 {row.adjustment > 0 ? '+' : ''}{fmt(row.adjustment)}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
