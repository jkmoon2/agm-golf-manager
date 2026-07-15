// /src/eventTemplates/hiddenEvent/HiddenEventMonitor.jsx

import React, { useEffect, useMemo, useState } from 'react';
import { computeHiddenEvent, getHiddenFourballPairsFromPerson, normalizeHiddenEventParams, normalizeHiddenFourballPairs } from '../../events/hiddenEvent';
import { getRankScoreGroupSide } from '../../events/rankScoreGame';

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
const selectStyle = { width: '100%', minWidth: 0, height: 34, border: '1px solid #d7dfec', borderRadius: 9, padding: '0 8px', fontSize: 13, background: '#fff', boxSizing: 'border-box' };

function getName(p) {
  return String(p?.nickname || p?.name || '-');
}

function getGroupNo(p) {
  const n = Number(p?.group ?? p?.groupNo ?? p?.groupNumber ?? p?.jo ?? p?.joNo);
  return Number.isFinite(n) ? n : 0;
}

function getHiddenOpponentId(slot) {
  if (!slot) return '';
  if (typeof slot === 'string' || typeof slot === 'number') return String(slot || '');
  if (slot.opponentId != null) return String(slot.opponentId || '');
  if (slot.partnerId != null) return String(slot.partnerId || '');
  if (slot.targetId != null) return String(slot.targetId || '');
  return '';
}

export default function HiddenEventMonitor({
  eventDef,
  participants = [],
  inputsByEvent = {},
  roomNames = [],
  onClose,
  onToggleReveal,
  onToggleLock,
  onAssignFourball,
  onAssignSelection,
  onCancelSelection,
}) {
  const cfg = normalizeHiddenEventParams(eventDef?.params);
  const data = computeHiddenEvent(eventDef, participants, inputsByEvent, { roomNames });
  const personalRows = Array.isArray(data?.matchRows) ? data.matchRows : [];
  const teamRows = Array.isArray(data?.teamRows) ? data.teamRows : [];
  const fourballTitle = cfg.fourballMode === 'select' ? '포볼 참가자 직접지목' : (cfg.fourballMode === 'self' ? '포볼 참가자 무작위배정' : '포볼 히든팀');
  const fourballPointLabel = cfg.pointType === 'converted' ? '환산점수' : '순위점수';
  const safeParticipants = Array.isArray(participants) ? participants : [];
  const [directionFilter, setDirectionFilter] = useState('');
  const [showUnregistered, setShowUnregistered] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draftById, setDraftById] = useState({});

  useEffect(() => {
    setDirectionFilter('');
    setShowUnregistered(false);
    setEditMode(false);
    setDraftById({});
  }, [eventDef?.id]);

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

  const registeredIdSet = useMemo(() => {
    const set = new Set();
    const person = (inputsByEvent?.person && typeof inputsByEvent.person === 'object') ? inputsByEvent.person : {};
    if (cfg.mode === 'personal' || (cfg.mode === 'fourball' && cfg.fourballMode === 'select')) {
      Object.entries(person).forEach(([selectorId, rec]) => {
        if (selectorId && getHiddenOpponentId(rec)) set.add(String(selectorId));
      });
    } else if (cfg.mode === 'fourball' && cfg.fourballMode === 'self') {
      const pairs = normalizeHiddenFourballPairs({
        ...normalizeHiddenFourballPairs(inputsByEvent?.shared?.hiddenFourballPairs || inputsByEvent?.shared?.pairs || {}),
        ...getHiddenFourballPairsFromPerson(person),
      });
      Object.entries(pairs).forEach(([a, b]) => {
        if (a) set.add(String(a));
        if (b) set.add(String(b));
      });
    } else if (cfg.mode === 'fourball') {
      const pairs = normalizeHiddenFourballPairs(inputsByEvent?.shared?.hiddenFourballPairs || inputsByEvent?.shared?.pairs || {});
      Object.entries(pairs).forEach(([a, b]) => {
        if (a) set.add(String(a));
        if (b) set.add(String(b));
      });
    }
    return set;
  }, [cfg.mode, cfg.fourballMode, inputsByEvent]);

  const unregisteredParticipants = useMemo(() => {
    if (!(cfg.mode === 'personal' || cfg.mode === 'fourball')) return [];
    return safeParticipants.filter((p) => {
      const pid = String(p?.id ?? '');
      return pid && !registeredIdSet.has(pid);
    });
  }, [cfg.mode, safeParticipants, registeredIdSet]);

  const showDirectionButtons = cfg.mode === 'personal' || (cfg.mode === 'fourball' && cfg.fourballMode === 'select');
  const showUnregisteredButton = cfg.mode === 'personal' || cfg.mode === 'fourball';
  const directionButtonStyle = (key) => directionFilter === key ? primaryStyle : btnStyle;
  const unregisteredButtonStyle = showUnregistered ? primaryStyle : btnStyle;

  const currentPartnerById = useMemo(() => {
    const map = {};
    const person = (inputsByEvent?.person && typeof inputsByEvent.person === 'object') ? inputsByEvent.person : {};
    if (cfg.mode === 'personal' || (cfg.mode === 'fourball' && cfg.fourballMode === 'select')) {
      Object.entries(person).forEach(([selectorId, rec]) => {
        const opponentId = getHiddenOpponentId(rec);
        if (selectorId && opponentId) map[String(selectorId)] = String(opponentId);
      });
    } else if (cfg.mode === 'fourball' && cfg.fourballMode === 'self') {
      Object.assign(map, normalizeHiddenFourballPairs({
        ...normalizeHiddenFourballPairs(inputsByEvent?.shared?.hiddenFourballPairs || inputsByEvent?.shared?.pairs || {}),
        ...getHiddenFourballPairsFromPerson(person),
      }));
    } else if (cfg.mode === 'fourball') {
      Object.assign(map, normalizeHiddenFourballPairs(inputsByEvent?.shared?.hiddenFourballPairs || inputsByEvent?.shared?.pairs || {}));
    }
    return map;
  }, [cfg.mode, cfg.fourballMode, inputsByEvent]);

  const candidatesById = useMemo(() => {
    const map = {};
    safeParticipants.forEach((me) => {
      const meId = String(me?.id ?? '');
      if (!meId) return;
      const myGroup = getGroupNo(me);

      if (cfg.mode === 'personal') {
        const onlySameGroup = !!(cfg.sameGroupOnly || cfg.sameGroupTargetOnly || cfg.sameGroupTargetsOnly || cfg.onlySameGroup || cfg.targetScope === 'sameGroup');
        map[meId] = safeParticipants.filter((p) => {
          const pid = String(p?.id ?? '');
          if (!pid || pid === meId) return false;
          if (onlySameGroup && myGroup && getGroupNo(p) !== myGroup) return false;
          return true;
        });
        return;
      }

      if (cfg.fourballMode === 'select') {
        map[meId] = safeParticipants.filter((p) => {
          const pid = String(p?.id ?? '');
          if (!pid || pid === meId) return false;
          if (cfg.excludeSameGroupTargets !== false && myGroup && getGroupNo(p) === myGroup) return false;
          return true;
        });
        return;
      }

      const mySide = getRankScoreGroupSide(me, { pairGroups: cfg.pairGroups });
      const targetSide = mySide === 'A' ? 'B' : mySide === 'B' ? 'A' : '';
      map[meId] = safeParticipants.filter((p) => {
        const pid = String(p?.id ?? '');
        if (!pid || pid === meId) return false;
        if (!targetSide || getRankScoreGroupSide(p, { pairGroups: cfg.pairGroups }) !== targetSide) return false;
        const pairedWith = currentPartnerById[pid];
        return !pairedWith || String(pairedWith) === meId;
      });
    });
    return map;
  }, [safeParticipants, cfg, currentPartnerById]);

  const assignOne = async (me) => {
    const meId = String(me?.id ?? '');
    const partnerId = String(draftById?.[meId] || '');
    if (!meId || !partnerId) {
      alert('배정할 상대를 선택하세요.');
      return;
    }
    const partner = safeParticipants.find((p) => String(p?.id ?? '') === partnerId);
    if (!partner) {
      alert('선택한 상대를 찾을 수 없습니다.');
      return;
    }
    if (typeof onAssignSelection === 'function') await onAssignSelection(me, partner);
  };

  const cancelOne = async (me) => {
    if (!me) return;
    if (typeof onCancelSelection === 'function') await onCancelSelection(me);
  };

  const renderUnregistered = () => (
    <div style={{ border: '1px solid #e5eaf2', background: '#fbfdff', borderRadius: 14, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 950, color: '#16376c', marginBottom: 8 }}>미등록 참가자</div>
      {!unregisteredParticipants.length && <div style={{ color: '#667085', fontSize: 13 }}>미등록 참가자가 없습니다.</div>}
      {!!unregisteredParticipants.length && (
        <div style={{ display: 'grid', gap: 6 }}>
          {unregisteredParticipants.map((p) => (
            <div key={`hidden-unregistered-${p?.id}`} style={{ border: '1px solid #eef2f7', borderRadius: 10, padding: '8px 10px', fontSize: 13, fontWeight: 900, color: '#16243f' }}>
              {getName(p)} <span style={{ color: '#667085', fontWeight: 700 }}>{p?.group ? `${p.group}조` : ''}{p?.room ? ` · ${p.room}번방` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderEditList = () => (
    <div style={{ display: 'grid', gap: 8 }}>
      {safeParticipants.map((p) => {
        const pid = String(p?.id ?? '');
        const partnerId = String(currentPartnerById?.[pid] || '');
        const partner = partnerId ? safeParticipants.find((x) => String(x?.id ?? '') === partnerId) : null;
        const side = cfg.mode === 'fourball' && cfg.fourballMode !== 'select'
          ? (getRankScoreGroupSide(p, { pairGroups: cfg.pairGroups }) || '-')
          : `${getGroupNo(p) || '-'}조`;
        const candidates = candidatesById[pid] || [];
        return (
          <div key={`hidden-edit-${pid}`} style={{ border: '1px solid #e5eaf2', borderRadius: 12, padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ color: '#16243f' }}>{getName(p)}</b>
                <span style={{ marginLeft: 6, color: '#667085', fontSize: 12 }}>{cfg.mode === 'fourball' && cfg.fourballMode !== 'select' ? `${side}그룹` : side}</span>
              </div>
              <div style={{ color: partner ? '#1d4ed8' : '#999', fontSize: 12, fontWeight: 900 }}>
                {partner ? `배정: ${getName(partner)}` : '미배정'}
              </div>
            </div>

            {partner ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" style={dangerStyle} onClick={() => cancelOne(p)}>취소</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <select
                  value={draftById?.[pid] || ''}
                  onChange={(e) => setDraftById((prev) => ({ ...(prev || {}), [pid]: e.target.value }))}
                  style={selectStyle}
                >
                  <option value="">상대 선택</option>
                  {candidates.map((c) => (
                    <option key={`hidden-candidate-${pid}-${c.id}`} value={c.id}>{getName(c)}</option>
                  ))}
                </select>
                <button type="button" style={primaryStyle} onClick={() => assignOne(p)} disabled={!draftById?.[pid]}>배정</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderFourballSummary = () => (
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
  );

  const renderPersonalSummary = () => (
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
  );

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
          <button type="button" style={editMode ? primaryStyle : btnStyle} onClick={() => setEditMode((prev) => !prev)}>
            수정
          </button>
          {cfg.mode === 'fourball' && cfg.fourballMode !== 'select' && editMode && (
            <button type="button" style={primaryStyle} onClick={onAssignFourball}>포볼 무작위 배정</button>
          )}
          {showDirectionButtons && !editMode && (
            <>
              <button
                type="button"
                style={directionButtonStyle('upward')}
                onClick={() => { setShowUnregistered(false); setDirectionFilter((prev) => prev === 'upward' ? '' : 'upward'); }}
              >
                상향
              </button>
              <button
                type="button"
                style={directionButtonStyle('downward')}
                onClick={() => { setShowUnregistered(false); setDirectionFilter((prev) => prev === 'downward' ? '' : 'downward'); }}
              >
                하향
              </button>
            </>
          )}
          {showUnregisteredButton && (
            <button
              type="button"
              style={unregisteredButtonStyle}
              onClick={() => { setDirectionFilter(''); setShowUnregistered((prev) => !prev); }}
            >
              미등록 {unregisteredParticipants.length}
            </button>
          )}
        </div>

        {showUnregistered && renderUnregistered()}

        {editMode ? renderEditList() : (cfg.mode === 'fourball' ? renderFourballSummary() : renderPersonalSummary())}
      </div>
    </div>
  );
}
