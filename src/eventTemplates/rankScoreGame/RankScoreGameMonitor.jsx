// /src/eventTemplates/rankScoreGame/RankScoreGameMonitor.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  computeRankScoreGame,
  getRankScoreGroupSide,
  getRankScorePairGroupLabel,
  normalizeRankScoreDirectPairs,
  normalizeRankScoreGameParams,
  normalizeRankScorePairs,
} from '../../events/rankScoreGame';

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
const panelStyle = { width: '100%', maxWidth: 620, maxHeight: '85dvh', overflow: 'auto', background: '#fff', borderRadius: 14, padding: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.2)', boxSizing: 'border-box' };
const btnStyle = { border: '1px solid #d7dfec', borderRadius: 10, background: '#fff', padding: '8px 10px', fontSize: 13, fontWeight: 900 };
const primaryStyle = { ...btnStyle, borderColor: '#2563eb', background: '#eaf2ff', color: '#1d4ed8' };
const dangerStyle = { ...btnStyle, borderColor: '#fecdd3', background: '#fff1f2', color: '#be123c' };
const selectStyle = { width: '100%', minWidth: 0, height: 34, border: '1px solid #d7dfec', borderRadius: 9, padding: '0 8px', fontSize: 13, background: '#fff', boxSizing: 'border-box' };

function getName(p) {
  return String(p?.nickname || p?.name || '-');
}

function fmt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return String(Math.round(n * 10) / 10).replace(/\.0$/, '');
}

export default function RankScoreGameMonitor({
  eventDef,
  participants = [],
  inputsByEvent = {},
  roomNames = [],
  roomCount = 0,
  onClose,
  onToggleReveal,
  onAssignPair,
  onCancelPair,
  onRandomAssign,
  onAssignDirectPair,
  onCancelDirectPair,
}) {
  const cfg = normalizeRankScoreGameParams(eventDef?.params);
  const isDirectPairGame = cfg.gameType === 'directPair';
  const isRandomPairGame = cfg.gameType === 'randomPair';
  const pairs = useMemo(() => isDirectPairGame
    ? normalizeRankScoreDirectPairs(inputsByEvent?.shared?.rankScoreDirectPairs || {})
    : normalizeRankScorePairs(inputsByEvent?.shared?.rankScorePairs || {}), [inputsByEvent, isDirectPairGame]);
  const safeParticipants = Array.isArray(participants) ? participants : [];
  const [draftById, setDraftById] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [showUnregistered, setShowUnregistered] = useState(false);

  useEffect(() => {
    setDraftById({});
    setEditMode(false);
    setShowUnregistered(false);
  }, [eventDef?.id, JSON.stringify(pairs || {})]);

  const groupLabelA = getRankScorePairGroupLabel(cfg.pairGroups, 'A');
  const groupLabelB = getRankScorePairGroupLabel(cfg.pairGroups, 'B');

  const resultData = useMemo(() => computeRankScoreGame(eventDef, safeParticipants, inputsByEvent, { roomNames, roomCount }), [eventDef, safeParticipants, inputsByEvent, roomNames, roomCount]);
  const summaryRows = Array.isArray(resultData?.teamRows) ? resultData.teamRows : [];

  const candidatesById = useMemo(() => {
    const map = {};
    safeParticipants.forEach((me) => {
      const meId = String(me?.id ?? '');
      if (!meId) return;

      if (isDirectPairGame) {
        const myGroup = Number(me?.group ?? me?.groupNo ?? me?.groupNumber ?? me?.jo ?? me?.joNo);
        map[meId] = safeParticipants.filter((p) => {
          const pid = String(p?.id ?? '');
          if (!pid || pid === meId) return false;
          if (cfg.directExcludeSameGroupTargets !== false) {
            const targetGroup = Number(p?.group ?? p?.groupNo ?? p?.groupNumber ?? p?.jo ?? p?.joNo);
            if (Number.isFinite(myGroup) && Number.isFinite(targetGroup) && myGroup === targetGroup) return false;
          }
          return true;
        });
        return;
      }

      const mySide = getRankScoreGroupSide(me, cfg);
      const targetSide = mySide === 'A' ? 'B' : mySide === 'B' ? 'A' : '';
      map[meId] = safeParticipants.filter((p) => {
        const pid = String(p?.id ?? '');
        if (!pid || pid === meId) return false;
        if (!targetSide || getRankScoreGroupSide(p, cfg) !== targetSide) return false;
        const pairedWith = pairs[pid];
        return !pairedWith || String(pairedWith) === meId;
      });
    });
    return map;
  }, [safeParticipants, cfg, pairs, isDirectPairGame]);

  const pairedCount = isDirectPairGame
    ? Object.keys(pairs || {}).length
    : Object.keys(pairs || {}).filter((id) => String(id) < String(pairs[id] || '')).length;

  const registeredIdSet = useMemo(() => {
    const set = new Set();
    if (isDirectPairGame) {
      Object.keys(pairs || {}).forEach((id) => { if (id) set.add(String(id)); });
    } else if (isRandomPairGame) {
      Object.entries(pairs || {}).forEach(([a, b]) => {
        if (a) set.add(String(a));
        if (b) set.add(String(b));
      });
    }
    return set;
  }, [pairs, isDirectPairGame, isRandomPairGame]);

  const unregisteredParticipants = useMemo(() => safeParticipants.filter((p) => {
    const pid = String(p?.id ?? '');
    return pid && !registeredIdSet.has(pid);
  }), [safeParticipants, registeredIdSet]);

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
    if (isDirectPairGame) {
      if (typeof onAssignDirectPair === 'function') await onAssignDirectPair(me, partner);
      return;
    }
    if (typeof onAssignPair === 'function') await onAssignPair(me, partner);
  };

  const cancelOne = async (me) => {
    if (!me) return;
    if (isDirectPairGame) {
      if (typeof onCancelDirectPair === 'function') await onCancelDirectPair(me);
      return;
    }
    if (typeof onCancelPair === 'function') await onCancelPair(me);
  };

  const renderUnregistered = () => (
    <div style={{ border: '1px solid #e5eaf2', background: '#fbfdff', borderRadius: 14, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 950, color: '#16376c', marginBottom: 8 }}>미등록 참가자</div>
      {!unregisteredParticipants.length && <div style={{ color: '#667085', fontSize: 13 }}>미등록 참가자가 없습니다.</div>}
      {!!unregisteredParticipants.length && (
        <div style={{ display: 'grid', gap: 6 }}>
          {unregisteredParticipants.map((p) => (
            <div key={`rank-score-unregistered-${p?.id}`} style={{ border: '1px solid #eef2f7', borderRadius: 10, padding: '8px 10px', fontSize: 13, fontWeight: 900, color: '#16243f' }}>
              {getName(p)} <span style={{ color: '#667085', fontWeight: 700 }}>{p?.group ? `${p.group}조` : ''}{p?.room ? ` · ${p.room}번방` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSummary = () => (
    <div style={{ display: 'grid', gap: 8 }}>
      {!summaryRows.length && <div style={{ color: '#999', fontSize: 13, border: '1px dashed #d7dfec', borderRadius: 12, padding: 12 }}>{isDirectPairGame ? '아직 참가자가 직접 선택한 포볼팀이 없습니다.' : '아직 포볼팀이 배정되지 않았습니다.'}</div>}
      {summaryRows.map((row, idx) => (
        <div key={`rank-score-summary-${row.key || idx}`} style={{ border: '1px solid #e5eaf2', borderRadius: 12, padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <b>{idx + 1}. {row.label || row.name || '-'}</b>
            <b style={{ color: '#be123c' }}>{fmt(row.value)}</b>
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: '#2563eb', fontWeight: 800 }}>
            {Array.isArray(row.members) ? row.members.map((m) => `${m.name || '-'}(${fmt(m.eventScore)}점)`).join(' · ') : ''}
          </div>
        </div>
      ))}
    </div>
  );

  const renderEditList = () => (
    <div style={{ display: 'grid', gap: 8 }}>
      {safeParticipants.map((p) => {
        const pid = String(p?.id ?? '');
        const partnerId = String(pairs?.[pid] || '');
        const partner = partnerId ? safeParticipants.find((x) => String(x?.id ?? '') === partnerId) : null;
        const side = isDirectPairGame ? `${Number(p?.group ?? 0) || '-'}조` : (getRankScoreGroupSide(p, cfg) || '-');
        const candidates = candidatesById[pid] || [];
        return (
          <div key={`rank-score-monitor-${pid}`} style={{ border: '1px solid #e5eaf2', borderRadius: 12, padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ color: '#16243f' }}>{getName(p)}</b>
                <span style={{ marginLeft: 6, color: '#667085', fontSize: 12 }}>{isDirectPairGame ? side : `${side}그룹`}</span>
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
                    <option key={`rank-score-candidate-${pid}-${c.id}`} value={c.id}>{getName(c)}</option>
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

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 950, color: '#16243f' }}>{eventDef?.title || '대회 순위 점수 게임'}</div>
            <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>
              {isRandomPairGame ? `포볼 · ${groupLabelA} ↔ ${groupLabelB}` : (isDirectPairGame ? '포볼 선택' : '방대방')} · {cfg.revealed === false ? '비공개' : '공개'} · 배정 {pairedCount}팀
            </div>
          </div>
          <button type="button" style={btnStyle} onClick={onClose}>닫기</button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button type="button" style={cfg.revealed === false ? primaryStyle : dangerStyle} onClick={() => onToggleReveal && onToggleReveal(!(cfg.revealed !== false))}>
            {cfg.revealed === false ? '공개로 전환' : '비공개로 전환'}
          </button>
          {(isRandomPairGame || isDirectPairGame) && (
            <button type="button" style={editMode ? primaryStyle : btnStyle} onClick={() => setEditMode((prev) => !prev)}>
              수정
            </button>
          )}
          {(isRandomPairGame || isDirectPairGame) && (
            <button type="button" style={showUnregistered ? primaryStyle : btnStyle} onClick={() => setShowUnregistered((prev) => !prev)}>
              미등록 {unregisteredParticipants.length}
            </button>
          )}
          {isRandomPairGame && editMode && (
            <button type="button" style={primaryStyle} onClick={() => onRandomAssign && onRandomAssign()}>
              무작위 배정
            </button>
          )}
        </div>

        {showUnregistered && renderUnregistered()}

        {!isRandomPairGame && !isDirectPairGame ? (
          <div style={{ color: '#667085', fontSize: 13, border: '1px dashed #d7dfec', borderRadius: 12, padding: 12 }}>
            방대방 게임은 참가자별 포볼 배정 대상이 아닙니다. 공개/비공개만 사용할 수 있습니다.
          </div>
        ) : (
          editMode ? renderEditList() : renderSummary()
        )}
      </div>
    </div>
  );
}
