// /src/eventTemplates/pickLineup/PickLineupEditor.jsx
import React, { useMemo, useState } from 'react';
import {
  getParticipantGroupNo,
  getPickLineupConfig,
  normalizeOpenGroups,
  normalizeVoteSlots,
} from '../../events/pickLineup';

export default function PickLineupEditor({ participants = [], value, onChange }) {
  const safe = value && typeof value === 'object' ? value : {};
  const cfg = getPickLineupConfig({ template: 'pick-lineup', params: safe });
  const mode = cfg.mode;
  const pickCount = cfg.pickCount;
  const openGroups = normalizeOpenGroups(cfg.openGroups);
  const lastPlaceHalf = !!cfg.lastPlaceHalf;
  const voteCount = cfg.voteCount;
  const voteSlots = normalizeVoteSlots(cfg.voteSlots, voteCount);
  const vote1CalcMethod = cfg.vote1CalcMethod;

  const [openKey, setOpenKey] = useState('');

  const safeParticipants = useMemo(() => {
    const list = Array.isArray(participants) ? [...participants] : [];
    list.sort((a, b) => {
      const groupDiff = Number(getParticipantGroupNo(a) || 999) - Number(getParticipantGroupNo(b) || 999);
      if (groupDiff) return groupDiff;
      const roomDiff = Number(a?.room ?? 999) - Number(b?.room ?? 999);
      if (roomDiff) return roomDiff;
      return String(a?.nickname || '').localeCompare(String(b?.nickname || ''), 'ko');
    });
    return list;
  }, [participants]);

  const allParticipantIds = useMemo(() => (
    safeParticipants
      .map((p) => String(p?.id ?? '').trim())
      .filter(Boolean)
  ), [safeParticipants]);

  const groupCounts = useMemo(() => {
    const out = { 1: 0, 2: 0, 3: 0, 4: 0 };
    safeParticipants.forEach((p) => {
      const g = getParticipantGroupNo(p);
      if (g >= 1 && g <= 4) out[g] += 1;
    });
    return out;
  }, [safeParticipants]);

  const emit = (patch) => {
    if (typeof onChange === 'function') {
      onChange({
        ...safe,
        mode,
        pickCount,
        openGroups,
        lastPlaceHalf,
        voteCount,
        voteSlots,
        vote1CalcMethod,
        ...patch,
      });
    }
  };

  const toggleGroup = (groupNo) => {
    const has = openGroups.includes(groupNo);
    let next = has ? openGroups.filter((x) => x !== groupNo) : [...openGroups, groupNo];
    next = normalizeOpenGroups(next);
    if (!next.length) next = [1];
    emit({ openGroups: next, lastPlaceHalf: (next.length === 4 ? lastPlaceHalf : false) });
  };

  const updateVoteCount = (nextValue) => {
    const nextCount = Math.max(1, Math.min(8, Number(nextValue || 1)));
    emit({
      voteCount: nextCount,
      voteSlots: normalizeVoteSlots(voteSlots, nextCount),
    });
  };

  const updateVoteSlot = (slotIdx, patch) => {
    const next = normalizeVoteSlots(voteSlots, voteCount).map((slot, idx) => (
      idx === slotIdx ? { ...slot, ...patch } : slot
    ));
    emit({ voteSlots: next });
  };

  const toggleVoteCandidate = (slotIdx, participantId) => {
    const id = String(participantId ?? '').trim();
    if (!id) return;
    const slot = voteSlots[slotIdx] || { title: `투표${slotIdx + 1}`, candidateIds: [] };
    const current = Array.isArray(slot.candidateIds) ? slot.candidateIds.map(String) : [];
    const nextIds = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id];
    updateVoteSlot(slotIdx, { candidateIds: nextIds });
  };

  const setAllVoteCandidates = (slotIdx, checked) => {
    updateVoteSlot(slotIdx, { candidateIds: checked ? allParticipantIds : [] });
  };

  const summaryCount = `${pickCount}명`;
  const summaryGroups = openGroups.map((g) => `${g}조`).join(', ') || '1조';

  return (
    <div style={box}>
      <div style={titleRow}>
        <div style={{ fontWeight: 700 }}>개인/조 선택 대결 설정</div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <label style={labelBox}>
          <span style={fieldLabel}>모드</span>
          <select
            value={mode}
            onChange={(e) => {
              const raw = e.target.value;
              const nextMode = raw === 'jo' ? 'jo' : (raw === 'vote1' ? 'vote1' : (raw === 'vote2' ? 'vote2' : 'single'));
              emit({
                mode: nextMode,
                pickCount,
                openGroups: nextMode === 'jo' ? (openGroups.length ? openGroups : [1]) : openGroups,
                lastPlaceHalf: nextMode === 'jo' && openGroups.length === 4 ? lastPlaceHalf : false,
                voteCount,
                voteSlots: normalizeVoteSlots(voteSlots, voteCount),
              });
              setOpenKey('');
            }}
            style={select}
          >
            <option value="single">개인 모드</option>
            <option value="jo">조 모드</option>
            <option value="vote1">투표1 모드</option>
            <option value="vote2">투표2 모드</option>
          </select>
        </label>

        {mode === 'single' && (
          <AccordionBox
            title="선택 인원 수"
            summary={summaryCount}
            open={openKey === 'count'}
            onToggle={() => setOpenKey((prev) => (prev === 'count' ? '' : 'count'))}
          >
            <label style={labelBox}>
              <span style={fieldLabel}>선택 인원 수</span>
              <select
                value={pickCount}
                onChange={(e) => emit({ pickCount: Math.max(1, Math.min(4, Number(e.target.value || 1))) })}
                style={select}
              >
                <option value={1}>1명</option>
                <option value={2}>2명</option>
                <option value={3}>3명</option>
                <option value={4}>4명</option>
              </select>
            </label>
          </AccordionBox>
        )}

        {mode === 'jo' && (
          <>
            <AccordionBox
              title="오픈할 조"
              summary={`선택 조: ${summaryGroups}`}
              open={openKey === 'groups'}
              onToggle={() => setOpenKey((prev) => (prev === 'groups' ? '' : 'groups'))}
            >
              <div style={pillGridStyle}>
                {[1, 2, 3, 4].map((groupNo) => {
                  const active = openGroups.includes(groupNo);
                  return (
                    <button
                      key={groupNo}
                      type="button"
                      onClick={() => toggleGroup(groupNo)}
                      style={{ ...pillStyle, ...(active ? pillOnStyle : {}) }}
                    >
                      {groupNo}조 ({groupCounts[groupNo] || 0})
                    </button>
                  );
                })}
              </div>
            </AccordionBox>

            {openGroups.length === 4 && (
              <label style={checkRowStyle}>
                <input
                  type="checkbox"
                  checked={lastPlaceHalf}
                  onChange={(e) => emit({ lastPlaceHalf: !!e.target.checked })}
                />
                <span>꼴등반띵 적용</span>
              </label>
            )}
          </>
        )}

        {(mode === 'vote1' || mode === 'vote2') && (
          <>
            <AccordionBox
              title="투표 건수"
              summary={`${voteCount}건`}
              open={openKey === 'vote-count'}
              onToggle={() => setOpenKey((prev) => (prev === 'vote-count' ? '' : 'vote-count'))}
            >
              <label style={labelBox}>
                <span style={fieldLabel}>투표 건수</span>
                <select value={voteCount} onChange={(e) => updateVoteCount(e.target.value)} style={select}>
                  <option value={1}>1건</option>
                  <option value={2}>2건</option>
                  <option value={3}>3건</option>
                  <option value={4}>4건</option>
                  <option value={5}>5건</option>
                  <option value={6}>6건</option>
                  <option value={7}>7건</option>
                  <option value={8}>8건</option>
                </select>
              </label>
            </AccordionBox>

            {mode === 'vote1' && (
              <label style={labelBox}>
                <span style={fieldLabel}>투표안 결과 계산</span>
                <select
                  value={vote1CalcMethod}
                  onChange={(e) => emit({ vote1CalcMethod: e.target.value === 'min' ? 'min' : 'sum' })}
                  style={select}
                >
                  <option value="sum">구성 참가자 결과 합계</option>
                  <option value="min">구성 참가자 중 가장 낮은 결과 1명</option>
                </select>
              </label>
            )}

            {voteSlots.map((slot, slotIdx) => {
              const slotKey = `vote-slot-${slotIdx}`;
              const selectedIds = Array.isArray(slot?.candidateIds) ? slot.candidateIds.map(String) : [];
              const selectedCount = selectedIds.length;
              return (
                <AccordionBox
                  key={slotKey}
                  title={`투표${slotIdx + 1} 설정`}
                  summary={`${String(slot?.title ?? '').trim() || `투표${slotIdx + 1}`} · ${mode === 'vote1' ? '구성' : '후보'} ${selectedCount}명`}
                  open={openKey === slotKey}
                  onToggle={() => setOpenKey((prev) => (prev === slotKey ? '' : slotKey))}
                >
                  <div style={{ display: 'grid', gap: 10 }}>
                    <label style={labelBox}>
                      <span style={fieldLabel}>타이틀</span>
                      <input
                        type="text"
                        value={slot?.title || ''}
                        placeholder={`투표${slotIdx + 1}`}
                        onChange={(e) => updateVoteSlot(slotIdx, { title: e.target.value })}
                        style={textInput}
                      />
                    </label>

                    <div style={candidateHeader}>
                      <span style={fieldLabel}>{mode === 'vote1' ? '투표안에 포함할 참가자' : '리스트에 표시할 참가자'}</span>
                      <div style={candidateActions}>
                        <button type="button" style={miniButton} onClick={() => setAllVoteCandidates(slotIdx, true)}>전체 선택</button>
                        <button type="button" style={miniButton} onClick={() => setAllVoteCandidates(slotIdx, false)}>전체 해제</button>
                      </div>
                    </div>

                    {!safeParticipants.length && (
                      <div style={emptyText}>등록된 참가자가 없습니다.</div>
                    )}

                    {!!safeParticipants.length && (
                      <div style={candidateGridStyle}>
                        {safeParticipants.map((p) => {
                          const id = String(p?.id ?? '').trim();
                          const active = selectedIds.includes(id);
                          const groupNo = getParticipantGroupNo(p);
                          return (
                            <button
                              key={`${slotKey}-${id}`}
                              type="button"
                              onClick={() => toggleVoteCandidate(slotIdx, id)}
                              style={{ ...candidatePillStyle, ...(active ? pillOnStyle : {}) }}
                              title={String(p?.nickname || '')}
                            >
                              <span style={candidateName}>{p?.nickname || '-'}</span>
                              <span style={candidateMeta}>{Number.isFinite(Number(groupNo)) ? `${groupNo}조` : ''}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </AccordionBox>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function AccordionBox({ title, summary, open, onToggle, children }) {
  return (
    <div style={sectionBox}>
      <button type="button" onClick={onToggle} style={sectionButton}>
        <div style={{ display: 'grid', gap: 2, textAlign: 'left', minWidth: 0 }}>
          <span style={sectionTitle}>{title}</span>
          <span style={sectionSummary}>{summary || '기본값'}</span>
        </div>
        <span style={arrow}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={sectionBody}>{children}</div>}
    </div>
  );
}

const box = {
  display: 'grid',
  gap: 10,
  padding: 12,
  marginTop: 10,
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  background: '#fff',
  maxWidth: '100%',
  overflow: 'hidden',
  boxSizing: 'border-box',
};
const titleRow = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};
const labelBox = {
  display: 'grid',
  gap: 6,
  minWidth: 0,
};
const fieldLabel = {
  fontSize: 13,
  fontWeight: 700,
  color: '#344054',
};
const select = {
  width: '100%',
  height: 42,
  borderRadius: 10,
  border: '1px solid #d0d7de',
  background: '#fff',
  padding: '0 12px',
  fontSize: 14,
  boxSizing: 'border-box',
};
const textInput = {
  ...select,
  appearance: 'none',
};
const sectionBox = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  overflow: 'hidden',
  maxWidth: '100%',
  boxSizing: 'border-box',
};
const sectionButton = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '12px 14px',
  background: '#fff',
  border: 'none',
  cursor: 'pointer',
  boxSizing: 'border-box',
};
const sectionTitle = {
  fontSize: 14,
  fontWeight: 700,
  color: '#111827',
};
const sectionSummary = {
  fontSize: 12,
  color: '#667085',
  lineHeight: 1.45,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const sectionBody = {
  padding: '0 14px 14px',
  background: '#fff',
  boxSizing: 'border-box',
};
const arrow = { fontSize: 12, color: '#667085', flexShrink: 0 };
const pillGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
  marginTop: 2,
};
const pillStyle = {
  width: '100%',
  border: '1px solid #cfd8e3',
  background: '#fff',
  color: '#1f2937',
  borderRadius: 999,
  padding: '8px 10px',
  fontSize: 13,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  boxSizing: 'border-box',
};
const pillOnStyle = {
  border: '1px solid #8bb6ff',
  color: '#1d4ed8',
  background: '#eef5ff',
  fontWeight: 700,
};
const checkRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 2,
  fontSize: 13,
  color: '#111827',
};
const candidateHeader = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  flexWrap: 'wrap',
};
const candidateActions = {
  display: 'flex',
  gap: 6,
};
const miniButton = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#344054',
  borderRadius: 8,
  padding: '6px 8px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};
const candidateGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 7,
  maxHeight: 280,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
};
const candidatePillStyle = {
  ...pillStyle,
  borderRadius: 10,
  minHeight: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
  textAlign: 'left',
};
const candidateName = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const candidateMeta = {
  flexShrink: 0,
  fontSize: 11,
  color: '#667085',
};
const emptyText = {
  color: '#98a2b3',
  fontSize: 13,
  padding: '8px 0',
};
