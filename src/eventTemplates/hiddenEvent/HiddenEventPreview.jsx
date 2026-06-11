// /src/eventTemplates/hiddenEvent/HiddenEventPreview.jsx

import React from 'react';
import { computeHiddenEvent, normalizeHiddenEventParams } from '../../events/hiddenEvent';

const fmt = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const r = Math.round(n * 10) / 10;
  return (r % 1 === 0) ? String(r) : r.toFixed(1);
};

const wrapStyle = { border: '1px solid #e5eaf2', borderRadius: 14, background: '#fff', overflow: 'hidden' };
const titleStyle = { padding: '10px 12px', fontSize: 14, fontWeight: 950, color: '#16376c', borderBottom: '1px solid #eef2f7', background: '#fbfdff' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' };
const thStyle = { background: '#f8fafc', borderBottom: '1px solid #e5eaf2', padding: '8px 6px', color: '#16243f', fontWeight: 900, textAlign: 'center' };
const tdStyle = { borderBottom: '1px solid #eef2f7', padding: '8px 6px', textAlign: 'center', color: '#16243f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

export default function HiddenEventPreview({ eventDef, participants = [], inputsByEvent = {}, roomNames = [], roomCount = 0 }) {
  const cfg = normalizeHiddenEventParams(eventDef?.params);
  const data = computeHiddenEvent(eventDef, participants, inputsByEvent, { roomNames, roomCount });

  if (cfg.mode === 'fourball') {
    const rows = Array.isArray(data?.teamRows) ? data.teamRows : [];
    return (
      <div style={wrapStyle}>
        <div style={titleStyle}>{eventDef?.title || '히든 이벤트(포볼)'} · 팀 순위</div>
        <table style={tableStyle}>
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '52%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '17%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>순위</th>
              <th style={thStyle}>팀</th>
              <th style={thStyle}>G합</th>
              <th style={thStyle}>최종결과</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={4} style={{ ...tdStyle, color: '#999' }}>배정된 팀이 없습니다.</td></tr>}
            {rows.map((row, idx) => (
              <tr key={row.key || idx}>
                <td style={tdStyle}>{row.rank || idx + 1}</td>
                <td style={tdStyle}>{row.label}</td>
                <td style={{ ...tdStyle, color: '#2563eb', fontWeight: 900 }}>{fmt(row.handicapSum)}</td>
                <td style={{ ...tdStyle, color: '#be123c', fontWeight: 900 }}>{fmt(row.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const rows = Array.isArray(data?.matchRows) ? data.matchRows : [];
  return (
    <div style={wrapStyle}>
      <div style={titleStyle}>{eventDef?.title || '히든 이벤트(개인)'} · 개인 순위</div>
      <table style={tableStyle}>
        <colgroup>
          <col style={{ width: '12%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '20%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={thStyle}>순위</th>
            <th style={thStyle}>선택자</th>
            <th style={thStyle}>상대방</th>
            <th style={thStyle}>승패</th>
            <th style={thStyle}>점수</th>
          </tr>
        </thead>
        <tbody>
          {!rows.length && <tr><td colSpan={5} style={{ ...tdStyle, color: '#999' }}>선택된 상대가 없습니다.</td></tr>}
          {rows.map((row, idx) => (
            <tr key={row.key || idx}>
              <td style={tdStyle}>{row.rank || idx + 1}</td>
              <td style={tdStyle}>{row.name}</td>
              <td style={tdStyle}>{row.opponentName}</td>
              <td style={{ ...tdStyle, color: row.status === 'win' ? '#1d4ed8' : row.status === 'lose' ? '#be123c' : '#64748b', fontWeight: 900 }}>{row.resultText}</td>
              <td style={{ ...tdStyle, color: '#be123c', fontWeight: 900 }}>{fmt(row.point)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
