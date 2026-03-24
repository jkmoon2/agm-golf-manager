// /src/eventTemplates/groupRoomHoleBattle/GroupRoomHoleBattlePreview.jsx
import React from 'react';
import { computeGroupRoomHoleBattle } from '../../events/groupRoomHoleBattle';

export default function GroupRoomHoleBattlePreview({ eventDef, participants = [], inputsByEvent = {}, roomNames = [], roomCount = 0, viewTab = 'room' }) {
  const data = computeGroupRoomHoleBattle(eventDef, participants, inputsByEvent, { roomNames, roomCount });
  const expectTab = data.kind === 'group' ? 'group' : data.kind === 'person' ? 'person' : 'room';

  if (viewTab !== expectTab) {
    return <div style={empty}>현재 이벤트는 {data.kind === 'group' ? '그룹' : data.kind === 'person' ? '개인' : '방'} 모드입니다.</div>;
  }

  return (
    <ol style={list}>
      {(data.rows || []).map((row, idx) => (
        <li key={row.key} style={item}>
          <span>
            <span style={rank}>{idx + 1}.</span> {row.name}
            <small style={meta}> · 완료 {row.complete ? '완료' : '진행중'}</small>
          </span>
          <b style={{ ...score, color: row.displayColor || score.color }}>{row.displayTotal || row.value}</b>
        </li>
      ))}
    </ol>
  );
}

const empty = { padding: '14px 4px', color: '#667085', fontSize: 13 };
const list = { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 };
const item = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderRadius: 12, background: '#fff', border: '1px solid #e5e7eb' };
const rank = { display: 'inline-block', minWidth: 24, color: '#667085', fontWeight: 700 };
const meta = { color: '#98a2b3', marginLeft: 6 };
const score = { color: '#183153', fontSize: 16 };
