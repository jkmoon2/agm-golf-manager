// /src/eventTemplates/groupRoomHoleBattle/GroupRoomHoleBattlePreview.jsx
import React from 'react';
import { computeGroupRoomHoleBattle } from '../../events/groupRoomHoleBattle';

const RESULT_COLOR = {
  UP: '#d92d20',
  DOWN: '#175cd3',
  AS: '#111827',
};

export default function GroupRoomHoleBattlePreview({ eventDef, participants = [], inputsByEvent = {}, roomNames = [], roomCount = 0, viewTab = 'room' }) {
  const data = computeGroupRoomHoleBattle(eventDef, participants, inputsByEvent, { roomNames, roomCount });
  const expectTab = data.kind === 'group' ? 'group' : data.kind === 'person' ? 'person' : 'room';

  if (viewTab !== expectTab) {
    return <div style={empty}>현재 이벤트는 {data.kind === 'group' ? '그룹' : data.kind === 'person' ? '개인' : '방'} 모드입니다.</div>;
  }

  const isMatchLike = data?.metric === 'match';

  if (isMatchLike) {
    const holes = Array.isArray(data?.config?.selectedHoles) ? data.config.selectedHoles : [];
    return (
      <div style={wrap}>
        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>팀</th>
                {holes.map((holeNo) => <th key={`battle-preview-head-${holeNo}`} style={th}>{holeNo}</th>)}
                <th style={th}>합계</th>
              </tr>
            </thead>
            <tbody>
              {(data.rows || []).map((row) => (
                <tr key={row.key}>
                  <td style={tdName}>{row.name}</td>
                  {holes.map((holeNo) => {
                    const hole = Array.isArray(row?.holes) ? row.holes.find((item) => Number(item?.holeNo) === Number(holeNo)) : null;
                    const text = String(hole?.displayValue || '');
                    const color = RESULT_COLOR[text] || '#111827';
                    return <td key={`battle-preview-cell-${row.key}-${holeNo}`} style={{ ...td, color, fontWeight: 800 }}>{text}</td>;
                  })}
                  <td style={{ ...td, color: RESULT_COLOR[row.displayValue] || '#183153', fontWeight: 900 }}>{row.displayValue || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <ol style={list}>
      {(data.rows || []).map((row, idx) => (
        <li key={row.key} style={item}>
          <span>
            <span style={rank}>{idx + 1}.</span> {row.name}
            <small style={meta}> · 완료 {row.complete ? '완료' : '진행중'}</small>
          </span>
          <b style={score}>{row.displayValue || row.value}</b>
        </li>
      ))}
    </ol>
  );
}

const empty = { padding: '14px 4px', color: '#667085', fontSize: 13 };
const wrap = { display: 'grid', gap: 10 };
const tableWrap = { overflowX: 'auto', border: '2px solid #4a8cff', borderRadius: 16, background: '#fff' };
const table = { width: '100%', borderCollapse: 'collapse', minWidth: 360 };
const th = { padding: '10px 8px', borderBottom: '1px solid #dbe4f0', background: '#f8fbff', color: '#183153', fontSize: 13, fontWeight: 800, textAlign: 'center', whiteSpace: 'nowrap' };
const td = { padding: '10px 8px', borderBottom: '1px solid #eef2f7', color: '#183153', fontSize: 13, textAlign: 'center', whiteSpace: 'nowrap' };
const tdName = { ...td, fontWeight: 800 };
const list = { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 };
const item = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderRadius: 12, background: '#fff', border: '1px solid #e5e7eb' };
const rank = { display: 'inline-block', minWidth: 24, color: '#667085', fontWeight: 700 };
const meta = { color: '#98a2b3', marginLeft: 6 };
const score = { color: '#183153', fontSize: 16 };
