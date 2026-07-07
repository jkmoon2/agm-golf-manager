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
const thStyle = { background: '#f8fafc', borderBottom: '1px solid #e5eaf2', padding: '8px 4px', color: '#16243f', fontWeight: 900, textAlign: 'center', whiteSpace: 'nowrap', wordBreak: 'keep-all', fontSize: 12 };
const tdStyle = { borderBottom: '1px solid #eef2f7', padding: '8px 6px', textAlign: 'center', color: '#16243f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

function makeHiddenPersonalRoomRows(rows = [], roomNames = [], roomCount = 0, rankOrder = 'desc') {
  const maxRoom = Math.max(Number(roomCount || 0), ...(rows || []).map((row) => Number(row?.room || 0) || 0), 0);
  const map = new Map();
  for (let r = 1; r <= maxRoom; r += 1) {
    const label = (Array.isArray(roomNames) && String(roomNames[r - 1] || '').trim()) ? String(roomNames[r - 1]).trim() : `${r}번방`;
    map.set(r, { key: String(r), room: r, label, value: 0, count: 0 });
  }
  (rows || []).forEach((row) => {
    const roomNo = Number(row?.room || 0);
    if (!Number.isFinite(roomNo) || roomNo < 1) return;
    if (!map.has(roomNo)) map.set(roomNo, { key: String(roomNo), room: roomNo, label: row.roomLabel || `${roomNo}번방`, value: 0, count: 0 });
    const bucket = map.get(roomNo);
    bucket.value += Number(row?.point ?? 0) || 0;
    bucket.count += 1;
  });
  return Array.from(map.values())
    .filter((row) => row.count > 0 || maxRoom > 0)
    .sort((a, b) => {
      const diff = rankOrder === 'asc' ? (a.value - b.value) : (b.value - a.value);
      if (diff) return diff;
      return a.room - b.room;
    })
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

export default function HiddenEventPreview({ eventDef, participants = [], inputsByEvent = {}, roomNames = [], roomCount = 0, viewTab = 'person', rankOrder = '' }) {
  const cfg = normalizeHiddenEventParams(eventDef?.params);
  const data = computeHiddenEvent(eventDef, participants, inputsByEvent, { roomNames, roomCount });

  if (cfg.mode === 'fourball') {
    const isRoomView = viewTab === 'room';
    const baseRows = isRoomView
      ? (Array.isArray(data?.roomRows) ? data.roomRows : [])
      : (Array.isArray(data?.teamRows) ? data.teamRows : []);
    const rows = [...baseRows].sort((a, b) => {
      const av = Number(isRoomView ? a?.value : a?.value);
      const bv = Number(isRoomView ? b?.value : b?.value);
      const diff = rankOrder === 'desc' ? (bv - av) : (av - bv);
      if (diff) return diff;
      return String(a?.label || '').localeCompare(String(b?.label || ''), 'ko');
    }).map((row, idx) => ({ ...row, rank: idx + 1 }));
    const pointLabel = cfg.pointType === 'converted' ? '환산점수' : '순위점수';

    if (isRoomView) {
      return (
        <div style={wrapStyle}>
          <div style={titleStyle}>{eventDef?.title || '히든 이벤트(포볼)'} · 방 순위</div>
          <table style={tableStyle}>
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '48%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '24%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={thStyle}>순위</th>
                <th style={thStyle}>방</th>
                <th style={thStyle}>팀수</th>
                <th style={thStyle}>{pointLabel}</th>
              </tr>
            </thead>
            <tbody>
              {!rows.length && <tr><td colSpan={4} style={{ ...tdStyle, color: '#999' }}>방별 포볼 결과가 없습니다.</td></tr>}
              {rows.map((row, idx) => (
                <tr key={row.key || idx}>
                  <td style={tdStyle}>{row.rank || idx + 1}</td>
                  <td style={tdStyle}>{row.label}</td>
                  <td style={{ ...tdStyle, color: '#2563eb', fontWeight: 900 }}>{row.teamCount || 0}</td>
                  <td style={{ ...tdStyle, color: '#be123c', fontWeight: 900 }}>{fmt(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div style={wrapStyle}>
        <div style={titleStyle}>{eventDef?.title || '히든 이벤트(포볼)'} · 팀 순위</div>
        <table style={tableStyle}>
          <colgroup>
            <col style={{ width: '10%' }} />
            <col style={{ width: '42%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '18%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>순위</th>
              <th style={thStyle}>팀</th>
              <th style={thStyle}>G합</th>
              <th style={thStyle}>최종결과</th>
              <th style={thStyle}>{pointLabel}</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && <tr><td colSpan={5} style={{ ...tdStyle, color: '#999' }}>배정된 팀이 없습니다.</td></tr>}
            {rows.map((row, idx) => (
              <tr key={row.key || idx}>
                <td style={tdStyle}>{row.rank || idx + 1}</td>
                <td style={tdStyle}>{row.label}</td>
                <td style={{ ...tdStyle, color: '#2563eb', fontWeight: 900 }}>{fmt(row.handicapSum)}</td>
                <td style={{ ...tdStyle, color: '#be123c', fontWeight: 900 }}>{fmt(row.value)}</td>
                <td style={{ ...tdStyle, color: '#1d4ed8', fontWeight: 900 }}>{fmt(row.eventScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const rows = [...(Array.isArray(data?.matchRows) ? data.matchRows : [])].sort((a, b) => {
    const diff = rankOrder === 'asc' ? (Number(a?.point || 0) - Number(b?.point || 0)) : (Number(b?.point || 0) - Number(a?.point || 0));
    if (diff) return diff;
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'ko');
  }).map((row, idx) => ({ ...row, rank: idx + 1 }));
  if (viewTab === 'room') {
    const roomRows = makeHiddenPersonalRoomRows(rows, roomNames, roomCount, rankOrder || 'desc');
    return (
      <div style={wrapStyle}>
        <div style={titleStyle}>{eventDef?.title || '히든 이벤트(개인)'} · 방 순위</div>
        <table style={tableStyle}>
          <colgroup>
            <col style={{ width: '12%' }} />
            <col style={{ width: '48%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '24%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thStyle}>순위</th>
              <th style={thStyle}>방</th>
              <th style={thStyle}>인원</th>
              <th style={thStyle}>합산점수</th>
            </tr>
          </thead>
          <tbody>
            {!roomRows.length && <tr><td colSpan={4} style={{ ...tdStyle, color: '#999' }}>방별 지목 결과가 없습니다.</td></tr>}
            {roomRows.map((row, idx) => (
              <tr key={row.key || idx}>
                <td style={tdStyle}>{row.rank || idx + 1}</td>
                <td style={tdStyle}>{row.label}</td>
                <td style={{ ...tdStyle, color: '#2563eb', fontWeight: 900 }}>{row.count || 0}</td>
                <td style={{ ...tdStyle, color: '#be123c', fontWeight: 900 }}>{fmt(row.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

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
