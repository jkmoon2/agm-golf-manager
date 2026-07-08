// /src/eventTemplates/hiddenEvent/HiddenEventMonitor.jsx

import React, { useEffect, useMemo, useState } from 'react';
import { computeHiddenEvent, normalizeHiddenEventParams, normalizeHiddenPersonalPoints } from '../../events/hiddenEvent';

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
const inputStyle = { width: '100%', minWidth: 0, height: 34, border: '1px solid #d7dfec', borderRadius: 9, padding: '0 10px', fontSize: 13, background: '#fff', boxSizing: 'border-box' };
const labelStyle = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 800, color: '#25344d', minWidth: 0 };

export default function HiddenEventMonitor({ eventDef, participants = [], inputsByEvent = {}, roomNames = [], onClose, onToggleReveal, onToggleLock, onAssignFourball, onSavePersonalPoints }) {
  const cfg = normalizeHiddenEventParams(eventDef?.params);
  const data = computeHiddenEvent(eventDef, participants, inputsByEvent, { roomNames });
  const personalRows = Array.isArray(data?.matchRows) ? data.matchRows : [];
  const teamRows = Array.isArray(data?.teamRows) ? data.teamRows : [];
  const fourballTitle = cfg.fourballMode === 'select' ? '포볼 참가자 직접지목' : (cfg.fourballMode === 'self' ? '포볼 참가자 무작위배정' : '포볼 히든팀');
  const fourballPointLabel = cfg.pointType === 'converted' ? '환산점수' : '순위점수';
  const [pointDraft, setPointDraft] = useState(() => normalizeHiddenPersonalPoints(cfg.personalPoints));
  const [directionFilter, setDirectionFilter] = useState('');

  useEffect(() => {
    setPointDraft(normalizeHiddenPersonalPoints(cfg.personalPoints));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventDef?.id, JSON.stringify(cfg.personalPoints || {})]);

  const updatePointDraft = (key, value) => {
    setPointDraft((prev) => ({ ...(prev || {}), [key]: value }));
  };

  const savePointDraft = async () => {
    const next = normalizeHiddenPersonalPoints(pointDraft);
    if (typeof onSavePersonalPoints === 'function') {
      await onSavePersonalPoints(next);
      alert('히든 이벤트 점수 설정이 저장되었습니다.');
    }
  };


  const getFourballDirection = (row) => {
    const members = Array.isArray(row?.members) ? row.members : [];
    const from = Number(members?.[0]?.group ?? 0);
    const to = Number(members?.[1]?.group ?? 0);
    if (!Number.isFinite(from) || !Number.isFinite(to) || !from || !to || from === to) return '';
    return from > to ? 'upward' : 'downward';
  };

  const visiblePersonalRows = useMemo(() => {
    if (!directionFilter) return personalRows;
    return personalRows.filter((row) => row?.selectionPointKind === directionFilter);
  }, [personalRows, directionFilter]);

  const visibleTeamRows = useMemo(() => {
    if (!directionFilter) return teamRows;
    return teamRows.filter((row) => getFourballDirection(row) === directionFilter);
  }, [teamRows, directionFilter]);

  const showDirectionButtons = cfg.mode === 'personal' || (cfg.mode === 'fourball' && cfg.fourballMode === 'select');
  const directionButtonStyle = (key) => directionFilter === key ? primaryStyle : btnStyle;

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
          {cfg.mode === 'fourball' && cfg.fourballMode !== 'select' && (
            <button type="button" style={primaryStyle} onClick={onAssignFourball}>포볼 무작위 배정</button>
          )}
          {showDirectionButtons && (
            <>
              <button
                type="button"
                style={directionButtonStyle('upward')}
                onClick={() => setDirectionFilter((prev) => prev === 'upward' ? '' : 'upward')}
              >
                상향
              </button>
              <button
                type="button"
                style={directionButtonStyle('downward')}
                onClick={() => setDirectionFilter((prev) => prev === 'downward' ? '' : 'downward')}
              >
                하향
              </button>
            </>
          )}
        </div>

        {cfg.mode === 'personal' && (
          <div style={{ border: '1px solid #e5eaf2', background: '#fbfdff', borderRadius: 14, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 950, color: '#16376c', marginBottom: 8 }}>개인 1대1 점수 설정</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <label style={labelStyle}>승리
                <input style={inputStyle} type="number" inputMode="decimal" value={pointDraft.win ?? ''} onChange={(e) => updatePointDraft('win', e.target.value)} />
              </label>
              <label style={labelStyle}>패배
                <input style={inputStyle} type="number" inputMode="decimal" value={pointDraft.lose ?? ''} onChange={(e) => updatePointDraft('lose', e.target.value)} />
              </label>
              <label style={labelStyle}>비김
                <input style={inputStyle} type="number" inputMode="decimal" value={pointDraft.draw ?? ''} onChange={(e) => updatePointDraft('draw', e.target.value)} />
              </label>
              <label style={labelStyle}>맞지목
                <input style={inputStyle} type="number" inputMode="decimal" value={pointDraft.mutual ?? ''} onChange={(e) => updatePointDraft('mutual', e.target.value)} />
              </label>
              <label style={labelStyle}>상향 선택
                <input style={inputStyle} type="number" inputMode="decimal" value={pointDraft.upward ?? ''} onChange={(e) => updatePointDraft('upward', e.target.value)} />
              </label>
              <label style={labelStyle}>하향 선택
                <input style={inputStyle} type="number" inputMode="decimal" value={pointDraft.downward ?? ''} onChange={(e) => updatePointDraft('downward', e.target.value)} />
              </label>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: '#667085', lineHeight: 1.45 }}>
              *상향선택 : 높은조→낮은조 선택후 승리(가산)<br />
              *하향선택 : 낮은조→높은조 선택후 패배(감산)
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" style={primaryStyle} onClick={savePointDraft}>점수 설정 저장</button>
            </div>
          </div>
        )}

        {cfg.mode === 'fourball' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {!visibleTeamRows.length && <div style={{ color: '#999', fontSize: 13, border: '1px dashed #d7dfec', borderRadius: 12, padding: 12 }}>{cfg.fourballMode === 'select' ? '아직 참가자 지목 포볼팀이 없습니다.' : (cfg.fourballMode === 'self' ? '아직 참가자 버튼 무작위 배정 팀원이 없습니다.' : '아직 포볼팀이 배정되지 않았습니다.')}</div>}
            {visibleTeamRows.map((row, idx) => (
              <div key={row.key} style={{ border: '1px solid #e5eaf2', borderRadius: 12, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b>{idx + 1}. {row.label}</b>
                  <b style={{ color: '#be123c' }}>{fmt(row.value)}</b>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#2563eb', fontWeight: 800 }}>G합 {fmt(row.handicapSum)}{row.directAdjustment ? ` · 조간보정 ${row.directAdjustment > 0 ? '+' : ''}${fmt(row.directAdjustment)}` : ''}{getFourballDirection(row) ? ` · ${getFourballDirection(row) === 'upward' ? '상향' : '하향'}` : ''} · {fourballPointLabel} {fmt(row.eventScore)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {!visiblePersonalRows.length && <div style={{ color: '#999', fontSize: 13, border: '1px dashed #d7dfec', borderRadius: 12, padding: 12 }}>아직 참가자 선택이 없습니다.</div>}
            {visiblePersonalRows.map((row, idx) => (
              <div key={row.key} style={{ border: '1px solid #e5eaf2', borderRadius: 12, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b>{idx + 1}. {row.name} → {row.opponentName}</b>
                  <b style={{ color: row.status === 'win' ? '#1d4ed8' : row.status === 'lose' ? '#be123c' : '#64748b' }}>{row.resultText} · {fmt(row.point)}점</b>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#667085' }}>
                  {row.name} 결과 {fmt(row.value)} / {row.opponentName} 결과 {fmt(row.opponentValue)} · 조핸디 {row.adjustment > 0 ? '+' : ''}{fmt(row.adjustment)}{row.mutual ? ` · 맞지목 ${row.mutualPoint > 0 ? '+' : ''}${fmt(row.mutualPoint)}` : ''}{row.selectionPoint ? ` · ${row.selectionPointKind === 'upward' ? '상향' : '하향'} ${row.selectionPoint > 0 ? '+' : ''}${fmt(row.selectionPoint)}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
