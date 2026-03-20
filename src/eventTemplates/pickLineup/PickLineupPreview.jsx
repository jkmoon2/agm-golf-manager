// /src/eventTemplates/pickLineup/PickLineupPreview.jsx
import React, { useMemo } from 'react';
import { computePickLineup } from '../../events/pickLineup';

export default function PickLineupPreview({ eventDef, participants = [], inputs = {}, roomNames = [] }) {
  const data = useMemo(() => {
    if (!eventDef) return null;
    return computePickLineup(eventDef, participants, inputs, { roomNames });
  }, [eventDef, participants, inputs, roomNames]);

  if (!eventDef || !data) return null;

  if (!data.rows.length) {
    return <div style={{ color: '#999', fontSize: 13 }}>아직 선택 데이터가 없습니다.</div>;
  }

  return (
    <div style={{ marginTop: 4 }}>
      <ol style={listStyle}>
        {data.rows.map((row, idx) => (
          <li key={row.key} style={itemStyle}>
            <div style={headRowStyle}>
              <div style={{ minWidth: 0 }}>
                <span style={rankStyle}>{idx + 1}.</span>{' '}
                <span style={selectorNameStyle}>{row.name}</span>{' '}
                <span style={selectorMetaStyle}>({row.roomLabel || '-'})</span>
              </div>
              <div style={totalStyle}>{row.value}</div>
            </div>

            <div style={membersWrapStyle}>
              {(row.members || []).map((m) => (
                <div key={`${row.key}-${m.id}`} style={memberRowStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={memberNameStyle}>{m.name}</span>{' '}
                      <span style={memberMetaStyle}>({m.room ? roomNames[Number(m.room) - 1] || `${m.room}번방` : '-'})</span>
                    </div>
                    <div style={memberValueStyle}>
                      점수 {m.score} · G{m.handicap} · 결과 {m.value}
                      {m.halved ? ' · 꼴등반띵' : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const listStyle = { listStyle: 'none', padding: 0, margin: 0 };
const itemStyle = { border: '1px solid #eef2f7', borderRadius: 12, padding: 10, marginBottom: 10, background: '#fff' };
const headRowStyle = { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' };
const rankStyle = { fontWeight: 800, color: '#111827' };
const selectorNameStyle = { fontWeight: 800, color: '#183153' };
const selectorMetaStyle = { color: '#999', fontSize: 12 };
const totalStyle = { fontWeight: 900, color: '#183153' };
const membersWrapStyle = { marginTop: 8, display: 'grid', gap: 6 };
const memberRowStyle = { padding: '8px 10px', border: '1px solid #f1f5f9', borderRadius: 10, background: '#fafafa' };
const memberNameStyle = { fontWeight: 400, color: '#183153' };
const memberMetaStyle = { color: '#999', fontSize: 12, fontWeight: 400 };
const memberValueStyle = { fontSize: 12, color: '#555', fontWeight: 400, textAlign: 'right', lineHeight: 1.45 };
