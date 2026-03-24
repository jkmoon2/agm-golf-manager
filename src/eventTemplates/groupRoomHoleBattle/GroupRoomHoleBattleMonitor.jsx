// /src/eventTemplates/groupRoomHoleBattle/GroupRoomHoleBattleMonitor.jsx
import React from 'react';
import { computeGroupRoomHoleBattle } from '../../events/groupRoomHoleBattle';

export default function GroupRoomHoleBattleMonitor({ eventDef, participants = [], inputsByEvent = {}, roomNames = [], roomCount = 0, onClose, onToggleLock }) {
  const data = computeGroupRoomHoleBattle(eventDef, participants, inputsByEvent, { roomNames, roomCount });
  const locked = !!eventDef?.params?.selectionLocked;
  const inputRows = Array.isArray(data.inputRows) && data.inputRows.length ? data.inputRows : (Array.isArray(data.rows) ? data.rows : []);
  const doneCount = inputRows.filter((row) => row.complete).length;
  const scoreDoneCount = data.participantRows.filter((row) => row.complete).length;
  const modeLabel = data.kind === 'group' ? '그룹 모드' : data.kind === 'person' ? '개인 모드' : '방 모드';

  return (
    <div style={backdrop} onClick={() => (typeof onClose === 'function' ? onClose() : null)}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={headerRow}>
          <div style={{ minWidth: 0 }}>
            <div style={title}>입력 현황 / 마감</div>
            <div style={subTitle}>{eventDef?.title || '그룹/방/개인 홀별 지목전'} · {modeLabel}</div>
          </div>
          <button type="button" style={btn} onClick={() => (typeof onClose === 'function' ? onClose() : null)}>닫기</button>
        </div>

        <div style={summaryBox}>
          <div style={summaryItem}><b>{doneCount}</b> / {inputRows.length} 지목 완료</div>
          <div style={summaryItem}><b>{scoreDoneCount}</b> / {data.participantRows.length} 점수 완료</div>
          <div style={summaryItem}>상태: <b style={{ color: locked ? '#dc2626' : '#2563eb' }}>{locked ? '마감' : '진행중'}</b></div>
          <button type="button" style={locked ? btnSub : btnPrimary} onClick={() => (typeof onToggleLock === 'function' ? onToggleLock(!locked) : null)}>
            {locked ? '재오픈' : '마감'}
          </button>
        </div>

        <div style={{ marginTop: 12, fontWeight: 800, color: '#183153' }}>지목 입력 현황</div>
        <div style={listWrap}>
          {inputRows.map((row) => {
            const filled = row.holes.filter((hole) => hole.ids.length === Math.max(1, Number(data.config.pickCount || 1))).length;
            return (
              <div key={row.key} style={rowBox}>
                <div style={rowHead}>
                  <div style={{ minWidth: 0 }}>
                    <span style={rowName}>{row.name}</span>
                    <span style={rowMeta}> ({data.kind === 'group' ? '그룹' : data.kind === 'person' ? '개인선택자' : '방'})</span>
                  </div>
                  <span style={row.complete ? badgeDone : badgeWait}>{row.complete ? '완료' : '대기'}</span>
                </div>
                <div style={rowBody}>
                  <div style={summaryText}>입력 홀 {filled}/{data.config.selectedHoles.length} · 합계 {data.metric === 'match' ? (row.displayValue || 'AS') : row.value}</div>
                  <div style={metaLine}>{row.holes.map((hole) => `${hole.holeNo}홀:${hole.label || '-'}`).join(' / ')}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 14, fontWeight: 800, color: '#183153' }}>홀별 점수 입력 현황</div>
        <div style={listWrap}>
          {data.participantRows.map((row) => (
            <div key={`score-${row.id}`} style={rowBox}>
              <div style={rowHead}>
                <div style={{ minWidth: 0 }}>
                  <span style={rowName}>{row.name}</span>
                </div>
                <span style={row.complete ? badgeDone : badgeWait}>{row.complete ? '완료' : '대기'}</span>
              </div>
              <div style={rowBody}>
                <div style={summaryText}>{row.values.map((value, idx) => `${data.config.selectedHoles[idx]}홀:${Number.isFinite(value) ? value : '-'}`).join(' / ')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const backdrop = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 9999 };
const card = { width: '100%', maxWidth: 620, maxHeight: '85dvh', overflow: 'auto', background: '#fff', borderRadius: 14, padding: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' };
const headerRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 };
const title = { fontWeight: 800, fontSize: 16, color: '#183153' };
const subTitle = { marginTop: 4, fontSize: 12, color: '#667085', lineHeight: 1.45 };
const summaryBox = { marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const summaryItem = { padding: '8px 10px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13, color: '#334155' };
const listWrap = { marginTop: 10, display: 'grid', gap: 8 };
const rowBox = { border: '1px solid #eef2f7', borderRadius: 12, padding: 10, background: '#fff' };
const rowHead = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
const rowName = { fontWeight: 700, color: '#183153' };
const rowMeta = { fontSize: 12, color: '#98a2b3' };
const rowBody = { marginTop: 6, display: 'grid', gap: 4 };
const summaryText = { fontSize: 13, color: '#344054', lineHeight: 1.45, wordBreak: 'keep-all' };
const metaLine = { fontSize: 12, color: '#667085', lineHeight: 1.5, wordBreak: 'keep-all' };
const badgeBase = { display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 8px', borderRadius: 999, fontSize: 12, border: '1px solid' };
const badgeDone = { ...badgeBase, color: '#10b981', borderColor: '#a7f3d0', background: '#ecfdf5' };
const badgeWait = { ...badgeBase, color: '#6b7280', borderColor: '#d1d5db', background: '#f9fafb' };
const btn = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer' };
const btnPrimary = { ...btn, borderColor: '#2563eb', background: '#2563eb', color: '#fff', fontWeight: 700 };
const btnSub = { ...btn, borderColor: '#d1d5db', background: '#f8fafc', color: '#344054', fontWeight: 700 };
