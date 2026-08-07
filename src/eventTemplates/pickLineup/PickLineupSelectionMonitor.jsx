// /src/eventTemplates/pickLineup/PickLineupSelectionMonitor.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  getParticipantGroupNo,
  getPickLineupCandidateIds,
  getPickLineupConfig,
  getPickLineupRequiredCount,
  getPickLineupSlotLabels,
  getVote1OptionIndexFromIds,
  makeVote1OptionToken,
  normalizeMemberIds,
} from '../../events/pickLineup';
import PickLineupPreview from './PickLineupPreview';

function roomLabel(roomNames, roomNo) {
  const idx = Number(roomNo) - 1;
  if (idx >= 0 && Array.isArray(roomNames) && roomNames[idx] && String(roomNames[idx]).trim()) {
    return String(roomNames[idx]).trim();
  }
  return Number.isFinite(Number(roomNo)) && Number(roomNo) >= 1 ? `${roomNo}번방` : '-';
}

function uniqueIds(arr = []) {
  const seen = new Set();
  const out = [];
  arr.forEach((id) => {
    const s = String(id ?? '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

function padIds(ids = [], count = 1) {
  const arr = Array.isArray(ids) ? ids.map((id) => String(id ?? '')) : [];
  while (arr.length < count) arr.push('');
  return arr.slice(0, count);
}

function buildSelectionSummary(eventDef, cfg, ids, byId) {
  const members = ids.map((id) => byId.get(String(id))).filter(Boolean);
  if (cfg.mode === 'jo') {
    return cfg.openGroups.map((groupNo) => {
      const found = members.find((m) => Number(getParticipantGroupNo(m)) === Number(groupNo));
      return found ? `${groupNo}조:${found.nickname}` : `${groupNo}조:-`;
    }).join(' / ');
  }
  if (cfg.mode === 'vote1') {
    const labels = getPickLineupSlotLabels(eventDef);
    const selectedIdx = getVote1OptionIndexFromIds(ids);
    return selectedIdx >= 0 ? (labels[selectedIdx] || `투표${selectedIdx + 1}`) : '-';
  }
  if (cfg.mode === 'vote2') {
    const labels = getPickLineupSlotLabels(eventDef);
    return labels.map((label, idx) => {
      const selected = byId.get(String(ids[idx] ?? ''));
      return `${label}:${selected?.nickname || '-'}`;
    }).join(' / ');
  }
  return members.map((m) => `${m.nickname}`).join(' / ');
}

function isComplete(eventDef, cfg, ids, byId) {
  const members = ids.map((id) => byId.get(String(id))).filter(Boolean);
  if (cfg.mode === 'single') {
    return members.length === cfg.pickCount;
  }
  if (cfg.mode === 'vote1') {
    const selectedIdx = getVote1OptionIndexFromIds(ids);
    return selectedIdx >= 0 && selectedIdx < cfg.voteCount;
  }
  if (cfg.mode === 'vote2') {
    if (ids.length !== cfg.voteCount) return false;
    return ids.every((id, idx) => {
      const selectedId = String(id ?? '').trim();
      const candidateIds = getPickLineupCandidateIds(eventDef, idx);
      return !!selectedId && byId.has(selectedId) && candidateIds.includes(selectedId);
    });
  }
  if (members.length !== cfg.openGroups.length) return false;
  return cfg.openGroups.every((groupNo) => members.some((m) => Number(getParticipantGroupNo(m)) === Number(groupNo)));
}

function getParticipantLabel(p, showGroup = true) {
  const name = String(p?.nickname || p?.name || '-');
  const groupNo = Number(getParticipantGroupNo(p));
  if (!showGroup || !Number.isFinite(groupNo)) return name;
  return `${name} (${groupNo}조)`;
}

function getCandidateOptions(eventDef, cfg, participants = [], slotIdx = 0) {
  const list = Array.isArray(participants) ? participants : [];
  if (cfg.mode === 'jo') {
    const groupNo = cfg.openGroups[slotIdx];
    return list.filter((p) => Number(getParticipantGroupNo(p)) === Number(groupNo));
  }
  if (cfg.mode === 'vote2') {
    const candidateIds = getPickLineupCandidateIds(eventDef, slotIdx);
    const byId = new Map(list.map((p) => [String(p?.id ?? ''), p]));
    return candidateIds.map((id) => byId.get(String(id))).filter(Boolean);
  }
  return list;
}

export default function PickLineupSelectionMonitor({
  eventDef,
  participants = [],
  inputsByEvent = {},
  roomNames = [],
  onClose,
  onToggleLock,
  onToggleReveal,
  onSaveSelection,
  onCancelSelection,
}) {
  const cfg = getPickLineupConfig(eventDef);
  const requiredCount = getPickLineupRequiredCount(eventDef);
  const safeParticipants = Array.isArray(participants) ? participants : [];
  const byId = useMemo(() => new Map(safeParticipants.map((p) => [String(p?.id ?? ''), p])), [safeParticipants]);
  const [editMode, setEditMode] = useState(false);
  const [showUnregistered, setShowUnregistered] = useState(false);
  const [draftById, setDraftById] = useState({});

  useEffect(() => {
    setEditMode(false);
    setShowUnregistered(false);
    setDraftById({});
  }, [eventDef?.id]);

  const sortedParticipants = useMemo(() => {
    const list = [...safeParticipants];
    list.sort((a, b) => {
      const roomDiff = Number(a?.room ?? 999) - Number(b?.room ?? 999);
      if (roomDiff) return roomDiff;
      const groupDiff = Number(getParticipantGroupNo(a) || 999) - Number(getParticipantGroupNo(b) || 999);
      if (groupDiff) return groupDiff;
      return String(a?.nickname || '').localeCompare(String(b?.nickname || ''), 'ko');
    });
    return list;
  }, [safeParticipants]);

  const rows = useMemo(() => {
    return sortedParticipants.map((p) => {
      const rawIds = normalizeMemberIds(inputsByEvent?.person?.[p?.id] || {});
      const ids = (cfg.mode === 'vote1' || cfg.mode === 'vote2') ? rawIds : uniqueIds(rawIds);
      const paddedIds = padIds(ids.slice(0, requiredCount), requiredCount);
      const members = paddedIds.map((id) => byId.get(String(id))).filter(Boolean);
      const complete = isComplete(eventDef, cfg, paddedIds, byId);
      const handicapSum = members.reduce((sum, m) => sum + (Number(eventDef?.params?.handicapOverrides?.[String(m?.id)]) || Number(m?.handicap ?? 0) || 0), 0);
      return {
        id: String(p?.id ?? ''),
        name: String(p?.nickname || ''),
        roomLabel: roomLabel(roomNames, p?.room),
        groupLabel: Number.isFinite(Number(getParticipantGroupNo(p))) ? `${getParticipantGroupNo(p)}조` : '',
        ids: paddedIds,
        complete,
        count: cfg.mode === 'vote1' ? (complete ? 1 : 0) : members.length,
        summary: buildSelectionSummary(eventDef, cfg, paddedIds, byId),
        handicapSum,
      };
    });
  }, [sortedParticipants, inputsByEvent, cfg, requiredCount, byId, eventDef, eventDef?.params?.handicapOverrides, roomNames]);

  const rowById = useMemo(() => new Map(rows.map((row) => [String(row.id), row])), [rows]);
  const doneCount = rows.filter((row) => row.complete).length;
  const unregisteredRows = rows.filter((row) => !row.complete);
  const locked = !!(eventDef?.params?.selectionLocked || eventDef?.params?.locked);
  const revealed = !!(eventDef?.params?.selectionRevealed || eventDef?.params?.revealed || eventDef?.params?.publicSelection || eventDef?.params?.showSelections);

  const updateDraftCell = (pid, idx, value) => {
    const key = String(pid ?? '');
    if (!key) return;
    const currentIds = padIds(rowById.get(key)?.ids || [], requiredCount);
    const base = padIds(draftById?.[key] || currentIds, requiredCount);
    const next = [...base];
    const selected = String(value ?? '');
    if (selected && cfg.mode !== 'vote1' && cfg.mode !== 'vote2') {
      for (let i = 0; i < next.length; i += 1) {
        if (i !== idx && next[i] === selected) next[i] = '';
      }
    }
    next[idx] = selected;
    setDraftById((prev) => ({ ...(prev || {}), [key]: next }));
  };

  const clearDraft = (pid) => {
    const key = String(pid ?? '');
    if (!key) return;
    setDraftById((prev) => {
      const next = { ...(prev || {}) };
      delete next[key];
      return next;
    });
  };

  const saveOne = async (p) => {
    const pid = String(p?.id ?? '');
    if (!pid) return;
    const row = rowById.get(pid);
    const ids = padIds(draftById?.[pid] || row?.ids || [], requiredCount);
    if (!isComplete(eventDef, cfg, ids, byId)) {
      alert('필요한 선택을 모두 완료한 뒤 저장하세요.');
      return;
    }
    if (typeof onSaveSelection === 'function') {
      await onSaveSelection(p, ids);
      clearDraft(pid);
    }
  };

  const cancelOne = async (p) => {
    const pid = String(p?.id ?? '');
    if (!pid) return;
    if (typeof onCancelSelection === 'function') {
      await onCancelSelection(p);
      clearDraft(pid);
    }
  };

  const renderUnregistered = () => (
    <div style={{ border: '1px solid #e5eaf2', background: '#fbfdff', borderRadius: 14, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 950, color: '#16376c', marginBottom: 8 }}>미등록 참가자</div>
      {!unregisteredRows.length && <div style={{ color: '#667085', fontSize: 13 }}>미등록 참가자가 없습니다.</div>}
      {!!unregisteredRows.length && (
        <div style={{ display: 'grid', gap: 6 }}>
          {unregisteredRows.map((row) => (
            <div key={`pick-lineup-unregistered-${row.id}`} style={{ border: '1px solid #eef2f7', borderRadius: 10, padding: '8px 10px', fontSize: 13, fontWeight: 900, color: '#16243f' }}>
              {row.name} <span style={{ color: '#667085', fontWeight: 700 }}>{[row.groupLabel, row.roomLabel].filter(Boolean).join(' · ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderEditList = () => (
    <div style={listWrap}>
      {sortedParticipants.map((p) => {
        const pid = String(p?.id ?? '');
        const row = rowById.get(pid) || {};
        const currentIds = padIds(row.ids || [], requiredCount);
        const activeIds = padIds(draftById?.[pid] || currentIds, requiredCount);
        const changed = activeIds.join('|') !== currentIds.join('|');
        const hasAnySelection = currentIds.some(Boolean);
        const complete = isComplete(eventDef, cfg, activeIds, byId);
        const slotLabels = getPickLineupSlotLabels(eventDef);
        return (
          <div key={`pick-lineup-edit-${pid}`} style={rowBox}>
            <div style={rowHead}>
              <div style={{ minWidth: 0 }}>
                <span style={rowName}>{row.name || getParticipantLabel(p, false)}</span>
                <span style={rowMeta}> ({[row.groupLabel, row.roomLabel].filter(Boolean).join(' · ')})</span>
              </div>
              <span style={row.complete ? badgeDone : badgeWait}>{row.complete ? '완료' : '대기'}</span>
            </div>

            <div style={{ display: 'grid', gap: 7, marginTop: 8 }}>
              {cfg.mode === 'vote1' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: '#475467' }}>투표안</div>
                  <select
                    value={String(activeIds[0] || '')}
                    onChange={(e) => updateDraftCell(pid, 0, e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">선택</option>
                    {slotLabels.map((label, idx) => (
                      <option key={`pick-lineup-vote1-option-${pid}-${idx}`} value={makeVote1OptionToken(idx)}>{label}</option>
                    ))}
                  </select>
                </div>
              ) : slotLabels.map((label, idx) => {
                const options = getCandidateOptions(eventDef, cfg, sortedParticipants, idx);
                const selectedId = String(activeIds[idx] || '');
                return (
                  <div key={`pick-lineup-edit-${pid}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: '#475467', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{label}</div>
                    <select
                      value={selectedId}
                      onChange={(e) => updateDraftCell(pid, idx, e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">선택</option>
                      {options.map((opt) => {
                        const value = String(opt?.id ?? '');
                        const selectedElsewhere = cfg.mode !== 'vote2' && activeIds.includes(value) && activeIds[idx] !== value;
                        return (
                          <option key={`pick-lineup-option-${pid}-${idx}-${value}`} value={value} disabled={selectedElsewhere}>
                            {getParticipantLabel(opt, cfg.mode !== 'jo')}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={metaLine} title={row.summary || ''}>{row.summary || '선택 없음'} · 선택 {activeIds.filter(Boolean).length}/{requiredCount}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {changed && <button type="button" style={btnSub} onClick={() => clearDraft(pid)}>원복</button>}
                <button type="button" style={btnPrimary} onClick={() => saveOne(p)} disabled={!complete}>저장</button>
                <button type="button" style={dangerStyle} onClick={() => cancelOne(p)} disabled={!hasAnySelection}>취소</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const modeSummary = cfg.mode === 'jo'
    ? `조 모드 (${cfg.openGroups.map((g) => `${g}조`).join(', ')})`
    : cfg.mode === 'vote1'
      ? `투표1 모드 (${cfg.voteCount}안 중 1개 선택)`
      : cfg.mode === 'vote2'
        ? `투표2 모드 (${cfg.voteCount}건)`
        : `개인 모드 (${cfg.pickCount}명 선택)`;

  return (
    <div style={backdrop} onClick={() => (typeof onClose === 'function' ? onClose() : null)}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={headerRow}>
          <div style={{ minWidth: 0 }}>
            <div style={title}>선택 현황 / 마감</div>
            <div style={subTitle}>
              {eventDef?.title || '개인/조/투표 선택 대결'} · {modeSummary}
            </div>
          </div>
          <button type="button" style={btn} onClick={() => (typeof onClose === 'function' ? onClose() : null)}>닫기</button>
        </div>

        <div style={summaryBox}>
          <div style={summaryItem}><b>{doneCount}</b> / {rows.length} 완료</div>
          <div style={summaryItem}>상태: <b style={{ color: locked ? '#dc2626' : '#2563eb' }}>{locked ? '마감' : '진행중'}</b></div>
          <div style={summaryItem}>공개: <b style={{ color: revealed ? '#2563eb' : '#dc2626' }}>{revealed ? '공개' : '비공개'}</b></div>
          <button
            type="button"
            style={revealed ? dangerStyle : btnPrimary}
            onClick={() => {
              if (typeof onToggleReveal === 'function') onToggleReveal(!revealed);
            }}
          >
            {revealed ? '비공개' : '공개'}
          </button>
          <button
            type="button"
            style={locked ? btnSub : btnPrimary}
            onClick={() => {
              if (typeof onToggleLock === 'function') onToggleLock(!locked);
            }}
          >
            {locked ? '재오픈' : '마감'}
          </button>
          <button type="button" style={editMode ? btnPrimary : btn} onClick={() => { setShowUnregistered(false); setEditMode((prev) => !prev); }}>
            수정
          </button>
          <button type="button" style={showUnregistered ? btnPrimary : btn} onClick={() => { setEditMode(false); setShowUnregistered((prev) => !prev); }}>
            미등록 {unregisteredRows.length}
          </button>
        </div>

        {showUnregistered && renderUnregistered()}

        {editMode ? renderEditList() : (
          (cfg.mode === 'vote1' || cfg.mode === 'vote2') ? (
            <div style={{ marginTop: 12 }}>
              <PickLineupPreview
                eventDef={eventDef}
                participants={participants}
                inputs={inputsByEvent}
                roomNames={roomNames}
                viewTab="vote"
              />
            </div>
          ) : (
            <div style={listWrap}>
              {rows.map((row) => (
                <div key={row.id} style={rowBox}>
                  <div style={rowHead}>
                    <div style={{ minWidth: 0 }}>
                      <span style={rowName}>{row.name}</span>
                      <span style={rowMeta}> ({row.roomLabel})</span>
                    </div>
                    <span style={row.complete ? badgeDone : badgeWait}>{row.complete ? '완료' : '대기'}</span>
                  </div>
                  <div style={rowBody}>
                    <div style={summaryText}>{row.summary || '선택 없음'}</div>
                    <div style={metaLine}>선택 {row.count}/{requiredCount} · G합 {row.handicapSum}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

const backdrop = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.25)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 9999,
};
const card = {
  width: '100%',
  maxWidth: 560,
  maxHeight: '85dvh',
  overflow: 'auto',
  background: '#fff',
  borderRadius: 14,
  padding: 12,
  boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
};
const headerRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 };
const title = { fontWeight: 800, fontSize: 16, color: '#183153' };
const subTitle = { marginTop: 4, fontSize: 12, color: '#667085', lineHeight: 1.45 };
const summaryBox = { marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const summaryItem = { padding: '8px 10px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13, color: '#334155' };
const listWrap = { marginTop: 12, display: 'grid', gap: 8 };
const rowBox = { border: '1px solid #eef2f7', borderRadius: 12, padding: 10, background: '#fff' };
const rowHead = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
const rowName = { fontWeight: 700, color: '#183153' };
const rowMeta = { fontSize: 12, color: '#98a2b3' };
const rowBody = { marginTop: 6, display: 'grid', gap: 4 };
const summaryText = { fontSize: 13, color: '#344054', lineHeight: 1.45, wordBreak: 'keep-all' };
const metaLine = { fontSize: 12, color: '#667085', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const badgeBase = { display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 8px', borderRadius: 999, fontSize: 12, border: '1px solid' };
const badgeDone = { ...badgeBase, color: '#10b981', borderColor: '#a7f3d0', background: '#ecfdf5' };
const badgeWait = { ...badgeBase, color: '#6b7280', borderColor: '#d1d5db', background: '#f9fafb' };
const btn = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer' };
const btnPrimary = { ...btn, borderColor: '#2563eb', background: '#2563eb', color: '#fff', fontWeight: 700 };
const btnSub = { ...btn, borderColor: '#d1d5db', background: '#f8fafc', color: '#344054', fontWeight: 700 };
const dangerStyle = { ...btn, borderColor: '#fecdd3', background: '#fff1f2', color: '#be123c', fontWeight: 700 };
const selectStyle = { width: '100%', minWidth: 0, height: 34, border: '1px solid #d7dfec', borderRadius: 9, padding: '0 8px', fontSize: 13, background: '#fff', boxSizing: 'border-box' };
