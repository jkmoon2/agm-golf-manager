// /src/eventTemplates/hiddenEvent/HiddenEventMonitor.jsx

import React from 'react';
import { computeHiddenEvent, normalizeHiddenEventParams } from '../../events/hiddenEvent';

const fmt = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return String(Math.round(n * 10) / 10).replace(/\.0$/, '');
};

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const panelStyle = { width: '100%', maxWidth: 560, maxHeight: '85dvh', overflow: 'auto', background: '#fff', borderRadius: 14, padding: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.2)', boxSizing: 'border-box' };
const btnStyle = { border: '1px solid #d7dfec', borderRadius: 10, background: '#fff', padding: '9px 12px', fontSize: 13, fontWeight: 900 };
const primaryStyle = { ...btnStyle, borderColor: '#2563eb', background: '#eaf2ff', color: '#1d4ed8' };
const dangerStyle = { ...btnStyle, borderColor: '#fecdd3', background: '#fff1f2', color: '#be123c' };

export default function HiddenEventMonitor({ eventDef, participants = [], inputsByEvent = {}, roomNames = [], onClose, onToggleReveal, onToggleLock, onAssignFourball }) {
  const cfg = normalizeHiddenEventParams(eventDef?.params);
  const data = computeHiddenEvent(eventDef, participants, inputsByEvent, { roomNames });
  const personalRows = Array.isArray(data?.matchRows) ? data.matchRows : [];
  const teamRows = Array.isArray(data?.teamRows) ? data.teamRows : [];
  const fourballTitle = cfg.fourballMode === 'self' ? '포볼 참가자 무작위배정' : '포볼 히든팀';

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 950, color: '#16243f' }}>{eventDef?.title || '히든 이벤트'}</div>
            <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>{cfg.mode === 'fourball' ? fourballTitle : '개인 1대1 지목'} · {cfg.revealed ? '공개' : '비공개'} · {cfg.selectionLocked ? '마감' : '진행중'}</div>
          </div>
          <button type="button" style={btnStyle} onClick={onClose}>닫기</button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button type="button" style={cfg.revealed ? dangerStyle : primaryStyle} onClick={() => onToggleReveal && onToggleReveal(!cfg.revealed)}>
            {cfg.revealed ? '다시 비공개' : '전체 공개'}
          </button>
          <button type="button" style={cfg.selectionLocked ? dangerStyle : primaryStyle} onClick={() => onToggleLock && onToggleLock(!cfg.selectionLocked)}>
            {cfg.selectionLocked ? '마감 해제' : '마감'}
          </button>
          {cfg.mode === 'fourball' && cfg.fourballMode !== 'self' && (
            <button type="button" style={primaryStyle} onClick={onAssignFourball}>포볼팀 무작위 배정</button>
          )}
        </div>

        {cfg.mode === 'fourball' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {!teamRows.length && <div style={{ color: '#999', fontSize: 13, border: '1px dashed #d7dfec', borderRadius: 12, padding: 12 }}>{cfg.fourballMode === 'self' ? '아직 참가자 버튼 무작위 배정 팀원이 없습니다.' : '아직 포볼팀이 배정되지 않았습니다.'}</div>}
            {teamRows.map((row, idx) => (
              <div key={row.key} style={{ border: '1px solid #e5eaf2', borderRadius: 12, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b>{idx + 1}. {row.label}</b>
                  <b style={{ color: '#be123c' }}>{fmt(row.value)}</b>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#2563eb', fontWeight: 800 }}>G합 {fmt(row.handicapSum)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {!personalRows.length && <div style={{ color: '#999', fontSize: 13, border: '1px dashed #d7dfec', borderRadius: 12, padding: 12 }}>아직 참가자 선택이 없습니다.</div>}
            {personalRows.map((row, idx) => (
              <div key={row.key} style={{ border: '1px solid #e5eaf2', borderRadius: 12, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b>{idx + 1}. {row.name} → {row.opponentName}</b>
                  <b style={{ color: row.status === 'win' ? '#1d4ed8' : row.status === 'lose' ? '#be123c' : '#64748b' }}>{row.resultText}</b>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#667085' }}>
                  {row.name} 결과 {fmt(row.value)} / {row.opponentName} 결과 {fmt(row.opponentValue)} · 조핸디 {row.adjustment > 0 ? '+' : ''}{fmt(row.adjustment)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
