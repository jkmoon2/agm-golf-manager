// /src/eventTemplates/holeRankForce/HoleRankForcePreview.jsx

import React, { useMemo } from 'react';
import { computeHoleRankForce } from '../../events/holeRankForce';

export default function HoleRankForcePreview({
  eventDef,
  participants = [],
  inputsByEvent = {},
  roomNames = [],
  roomCount = 0,
}) {
  const data = useMemo(() => {
    if (!eventDef) return null;
    return computeHoleRankForce(eventDef, participants, inputsByEvent, { roomNames, roomCount });
  }, [eventDef, participants, inputsByEvent, roomNames, roomCount]);

  if (!eventDef || !data) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={summaryBox}>
        <div>사용 홀: <b>{(data.selectedHoles || []).join(', ')}</b></div>
        <div>참가자: <b>{(data.selectedSlots || []).map((n) => `참가자${n}`).join(', ')}</b></div>
      </div>

      <ol style={listStyle}>
        {(data.personRows || []).map((row, idx) => (
          <li key={row.key} style={itemStyle}>
            <div style={{ display:'flex', justifyContent:'space-between', gap: 8 }}>
              <div>
                <span style={{ fontWeight: 700 }}>{idx + 1}.</span>{' '}
                <span>{row.name}</span>{' '}
                <span style={{ color:'#999', fontSize: 12 }}>({row.roomLabel || '-'}, 참가자{row.slotNo})</span>
              </div>
              <div style={{ fontWeight: 900 }}>{row.value}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const summaryBox = {
  display: 'grid',
  gap: 4,
  padding: 10,
  border: '1px solid #eef2f7',
  borderRadius: 12,
  background: '#fff',
  marginBottom: 10,
  fontSize: 13,
};
const listStyle = { listStyle:'none', padding: 0, margin: 0 };
const itemStyle = { border:'1px solid #eef2f7', borderRadius: 12, padding: 10, marginBottom: 10, background:'#fff' };
