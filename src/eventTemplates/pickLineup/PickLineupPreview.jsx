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
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <span style={{ fontWeight: 700 }}>{idx + 1}.</span>{' '}
                <span>{row.name}</span>{' '}
                <span style={{ color: '#999', fontSize: 12 }}>({row.roomLabel || '-'})</span>
              </div>
              <div style={{ fontWeight: 900 }}>{row.value}</div>
            </div>

            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {(row.members || []).map((m) => (
                <div key={`${row.key}-${m.id}`} style={memberRowStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{m.name}</span>{' '}
                      <span style={{ color: '#999', fontSize: 12 }}>({m.room ? roomNames[Number(m.room) - 1] || `${m.room}번방` : '-'})</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#555' }}>
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
const memberRowStyle = { padding: '8px 10px', border: '1px solid #f1f5f9', borderRadius: 10, background: '#fafafa' };
