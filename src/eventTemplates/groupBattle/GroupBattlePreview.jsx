// /src/eventTemplates/groupBattle/GroupBattlePreview.jsx
import React, { useMemo } from 'react';
import { computeGroupBattle } from '../../events/groupBattle';

export default function GroupBattlePreview({
  eventDef,
  participants = [],
  roomNames = [],
  order = 'asc',
}) {
  const def = eventDef ? { ...eventDef, rankOrder: order } : null;

  const data = useMemo(() => {
    if (!def) return null;
    return computeGroupBattle(def, participants, { roomNames });
  }, [def, participants, roomNames]);

  if (!def) return null;

  if (!data) return null;

  if (data.kind === 'person') {
    return (
      <div style={{ marginTop: 4 }}>
        <ol style={listStyle}>
          {(data.rows || []).map((r, i) => (
            <li key={r.id} style={itemStyle}>
              <div style={{ display:'flex', justifyContent:'space-between', gap: 8 }}>
                <div>
                  <span style={{ fontWeight: 700 }}>{i + 1}.</span>{' '}
                  <span>{r.name}</span>{' '}
                  <span style={{ color:'#999', fontSize: 12 }}>({r.roomLabel || '-'})</span>
                </div>
                <div style={{ fontWeight: 800 }}>{r.value}</div>
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color:'#555' }}>
                점수 {r.score} · G{r.handicap} · 결과 {r.score - r.handicap}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 4 }}>
      <ol style={listStyle}>
        {(data.rows || []).map((g, i) => (
          <li key={g.key || g.name || i} style={itemStyle}>
            <div style={{ display:'flex', justifyContent:'space-between', gap: 8 }}>
              <div style={{ fontWeight: 800 }}>
                {i + 1}. {g.name}
              </div>
              <div style={{ fontWeight: 900 }}>{g.value}</div>
            </div>

            {/* 멤버 한 줄 1칸 */}
            <div style={{ marginTop: 8, display:'grid', gap: 6 }}>
              {(g.members || []).map((m) => (
                <div key={m.id} style={memberRow}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap: 8 }}>
                    <div>
                      <span style={{ fontWeight: 400 }}>{m.name}</span>{' '}
                      <span style={{ color:'#999', fontSize: 12 }}>({m.roomLabel || '-'})</span>
                    </div>
                    <div style={{ fontSize: 12, color:'#555' }}>
                      점수 {m.score} · G{m.handicap} · 결과 {m.score - m.handicap}
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

const listStyle = { listStyle:'none', padding: 0, margin: 0 };
const itemStyle = { border:'1px solid #eef2f7', borderRadius: 12, padding: 10, marginBottom: 10, background:'#fff' };
const memberRow = { padding: '8px 10px', border:'1px solid #f1f5f9', borderRadius: 10, background:'#fafafa' };
