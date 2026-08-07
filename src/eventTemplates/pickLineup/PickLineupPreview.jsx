// /src/eventTemplates/pickLineup/PickLineupPreview.jsx
import React, { useMemo } from 'react';
import { computePickLineup, getPickLineupConfig } from '../../events/pickLineup';

export default function PickLineupPreview({ eventDef, participants = [], inputs = {}, roomNames = [], roomCount = 0, viewTab = 'person' }) {
  const data = useMemo(() => {
    if (!eventDef) return null;
    return computePickLineup(eventDef, participants, inputs, { roomNames, roomCount });
  }, [eventDef, participants, inputs, roomNames, roomCount]);

  if (!eventDef || !data) return null;

  const cfg = getPickLineupConfig(eventDef);
  if (cfg.mode === 'vote') {
    if (viewTab !== 'vote') {
      return <div style={{ color: '#999', fontSize: 13 }}>투표 모드는 미리보기 조건에서 “투표”를 선택하세요.</div>;
    }
    return <VoteResult data={data} />;
  }

  if (viewTab === 'vote') {
    return <div style={{ color: '#999', fontSize: 13 }}>투표 모드 이벤트에서만 투표 결과를 표시합니다.</div>;
  }

  const isRoomView = viewTab === 'room';
  const rows = isRoomView ? (Array.isArray(data.roomRows) ? data.roomRows : []) : (Array.isArray(data.rows) ? data.rows : []);

  if (!rows.length || !data.rows.length) {
    return <div style={{ color: '#999', fontSize: 13 }}>아직 선택 데이터가 없습니다.</div>;
  }

  if (isRoomView) {
    return (
      <div style={{ marginTop: 4 }}>
        <ol style={listStyle}>
          {rows.map((row, idx) => (
            <li key={row.key || `room-${row.room}`} style={itemStyle}>
              <div style={headRowStyle}>
                <div style={{ minWidth: 0 }}>
                  <span style={rankStyle}>{idx + 1}.</span>{' '}
                  <span style={selectorNameStyle}>{row.name || `${row.room}번방`}</span>{' '}
                  <span style={selectorMetaStyle}>({row.count || 0}명 선택완료)</span>
                </div>
                <div style={totalStyle}>{row.value}</div>
              </div>

              <div style={membersWrapStyle}>
                {(row.selectors || []).length ? (
                  (row.selectors || []).map((selector) => (
                    <div key={`${row.key}-${selector.selectorId}`} style={memberRowStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <div style={{ minWidth: 0 }}>
                          <span style={memberNameStyle}>{selector.name}</span>{' '}
                          <span style={memberMetaStyle}>선택 {Array.isArray(selector.members) ? selector.members.map((m) => m.name).join(' / ') : '-'}</span>
                        </div>
                        <div style={memberValueStyle}>합계 {selector.value}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={emptyRoomStyle}>선택 완료 참가자가 없습니다.</div>
                )}
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
        {rows.map((row, idx) => (
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

function VoteResult({ data }) {
  const sections = Array.isArray(data?.voteSections) ? data.voteSections : [];
  const totalVoterCount = Number(data?.totalVoterCount || 0);
  const completedVoterCount = Number(data?.completedVoterCount || 0);
  const hasCandidate = sections.some((section) => Array.isArray(section?.rows) && section.rows.length > 0);

  if (!sections.length || !hasCandidate) {
    return <div style={{ color: '#999', fontSize: 13 }}>투표 후보 참가자가 설정되지 않았습니다.</div>;
  }

  return (
    <div style={voteWrap}>
      <div style={voteSummary}>
        투표 완료 <b style={{ color: '#1d4ed8' }}>{completedVoterCount}</b> / {totalVoterCount}명
      </div>

      {sections.map((section) => (
        <div key={section.key} style={voteSection}>
          <div style={voteSectionHead}>
            <span style={voteSectionTitle}>{section.title}</span>
            <span style={voteSectionMeta}>총 {section.totalVotes || 0}표</span>
          </div>

          <div style={voteTableWrap}>
            <table style={voteTable}>
              <colgroup>
                <col style={{ width: 46 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 54 }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th style={voteTh}>순위</th>
                  <th style={voteTh}>참가자</th>
                  <th style={voteTh}>득표</th>
                  <th style={voteTh}>투표자</th>
                </tr>
              </thead>
              <tbody>
                {(section.rows || []).map((row) => (
                  <tr key={row.key}>
                    <td style={{ ...voteTd, color: '#1d4ed8', fontWeight: 900 }}>{row.displayRank || row.rank || '-'}</td>
                    <td style={{ ...voteTd, fontWeight: 900, color: '#183153' }}>{row.name}</td>
                    <td style={{ ...voteTd, color: '#be123c', fontWeight: 900 }}>{row.voteCount || 0}표</td>
                    <td style={{ ...voteTd, textAlign: 'left', lineHeight: 1.45 }}>
                      {Array.isArray(row.voterNames) && row.voterNames.length ? row.voterNames.join(', ') : '없음'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
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
const emptyRoomStyle = { color: '#999', fontSize: 12, padding: '4px 2px' };

const voteWrap = { display: 'grid', gap: 10, marginTop: 4 };
const voteSummary = {
  border: '1px solid #dbeafe',
  background: '#eff6ff',
  borderRadius: 10,
  padding: '9px 10px',
  color: '#334155',
  fontSize: 13,
};
const voteSection = {
  border: '1px solid #e5eaf2',
  borderRadius: 12,
  background: '#fff',
  overflow: 'hidden',
};
const voteSectionHead = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '10px 12px',
  background: '#f8fafc',
  borderBottom: '1px solid #e5eaf2',
};
const voteSectionTitle = { fontSize: 14, fontWeight: 950, color: '#16376c' };
const voteSectionMeta = { fontSize: 12, fontWeight: 800, color: '#667085' };
const voteTableWrap = { width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' };
const voteTable = { width: '100%', minWidth: 360, borderCollapse: 'collapse', tableLayout: 'fixed' };
const voteTh = { border: '1px solid #dfe5ee', background: '#f8fafc', padding: '7px 5px', textAlign: 'center', fontSize: 12, color: '#344054' };
const voteTd = { border: '1px solid #e5eaf2', padding: '8px 6px', textAlign: 'center', fontSize: 12, color: '#344054', wordBreak: 'keep-all' };
