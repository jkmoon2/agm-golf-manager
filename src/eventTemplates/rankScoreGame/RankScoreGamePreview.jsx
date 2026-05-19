// /src/eventTemplates/rankScoreGame/RankScoreGamePreview.jsx
import React, { useMemo } from 'react';
import { computeRankScoreGame } from '../../events/rankScoreGame';

export default function RankScoreGamePreview({ eventDef, participants = [], inputs = {}, roomNames = [], roomCount = 0, viewTab = 'person' }) {
  const data = useMemo(() => {
    if (!eventDef) return null;
    return computeRankScoreGame(eventDef, participants, inputs, { roomNames, roomCount });
  }, [eventDef, participants, inputs, roomNames, roomCount]);

  const params = data?.params || {};
  if (!eventDef || !data) return null;

  const tab = viewTab === 'room' ? 'room' : viewTab === 'team' ? 'team' : 'person';
  const rows = tab === 'room' ? data.roomRows : tab === 'team' ? data.teamRows : data.personRows;

  if (!rows.length) {
    return <div style={emptyStyle}>표시할 데이터가 없습니다.</div>;
  }

  return (
    <div style={wrapStyle}>
      <div style={summaryStyle}>
        기준: {sourceText(params.rankingSource)} · 점수: {params.pointType === 'rank' ? '순위점수' : '환산점수'} · 계산: {calcText(params.calculationMethod)}{params.gameType === 'room' && params.calculationMethod === 'add' ? `(${params.roomAddTarget === 'slots' ? '기준순위 2명' : '방인원 전체'})` : ''} · 정렬: {params.winnerOrder === 'asc' ? '오름' : '내림'}
      </div>

      {tab === 'person' && (
        <ol style={listStyle}>
          {rows.map((row) => (
            <li key={row.key} style={itemStyle}>
              <div style={headRowStyle}>
                <div style={{ minWidth: 0 }}>
                  <span style={rankStyle}>{row.displayRank || '-'}</span>{' '}
                  <span style={nameStyle}>{row.name || '-'}</span>{' '}
                  <span style={metaStyle}>({row.roomLabel || '-'})</span>
                </div>
                <b style={scoreStyle}>{fmt(row.value)}</b>
              </div>
              <div style={detailStyle}>
                점수 {fmt(row.score)} · G{fmt(row.handicap)} · 결과 {fmt(row.resultValue)}
                {params.rankingSource === 'adjusted' ? ` · 보정 ${fmt(row.adjustment)} · 보정결과 ${fmt(row.adjustedValue)}` : ''}
                {params.rankingSource === 'manual' ? ` · 입력순위 ${fmt(row.manualValue)}` : ''}
                {' '}· 산정순위 {row.rank || '-'} · 환산 {fmt(row.convertedScore)} · 순위점수 {fmt(row.rankScore)}
              </div>
            </li>
          ))}
        </ol>
      )}

      {tab !== 'person' && (
        <ol style={listStyle}>
          {rows.map((row) => (
            <li key={row.key} style={itemStyle}>
              <div style={headRowStyle}>
                <div style={{ minWidth: 0 }}>
                  <span style={rankStyle}>{row.displayRank || '-'}</span>{' '}
                  <span style={nameStyle}>{row.label || row.name || '-'}</span>
                </div>
                <b style={scoreStyle}>{fmt(row.value)}</b>
              </div>
              <div style={membersStyle}>
                {((row.selectedMembers || row.members || [])).map((m) => `${m.name || '-'}(${fmt(m.eventScore)}점/${m.rank || '-'}위)`).join(' · ') || '멤버 없음'}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function calcText(value) {
  if (value === 'subtract') return '빼기';
  if (value === 'multiply') return '곱하기';
  if (value === 'divide') return '나누기';
  return '더하기';
}

function sourceText(value) {
  if (value === 'manual') return '참가자 직접 순위';
  if (value === 'adjusted') return '보정치 순위';
  return '결과값 순위';
}

function fmt(value) {
  if (value === '' || value == null) return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const s = n.toFixed(2);
  return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

const wrapStyle = { marginTop: 4 };
const summaryStyle = { fontSize: 12, color: '#667085', marginBottom: 8, lineHeight: 1.45 };
const emptyStyle = { color: '#999', fontSize: 13 };
const listStyle = { listStyle: 'none', padding: 0, margin: 0 };
const itemStyle = { border: '1px solid #eef2f7', borderRadius: 12, padding: 10, marginBottom: 8, background: '#fff' };
const headRowStyle = { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' };
const rankStyle = { display: 'inline-flex', justifyContent: 'center', alignItems: 'center', minWidth: 24, height: 24, borderRadius: 999, background: '#eef5ff', color: '#1d4ed8', fontWeight: 900, fontSize: 12 };
const nameStyle = { fontWeight: 800, color: '#183153' };
const metaStyle = { color: '#999', fontSize: 12 };
const scoreStyle = { color: '#cc0000', fontWeight: 900, whiteSpace: 'nowrap' };
const detailStyle = { marginTop: 6, color: '#667085', fontSize: 12, lineHeight: 1.5 };
const membersStyle = { marginTop: 6, color: '#667085', fontSize: 12, lineHeight: 1.5, wordBreak: 'keep-all' };
