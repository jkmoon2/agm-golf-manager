// /src/eventTemplates/bingo/BingoSelectionMonitor.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { computeBingoCount, extractBingoPersonInput, getBingoHoleValues, getBingoMarkType, normalizeBingoSelectedHoles, normalizeBingoSpecialZones } from '../../events/bingo';

function roomLabel(roomNames, roomNo) {
  const idx = Number(roomNo) - 1;
  if (idx >= 0 && Array.isArray(roomNames) && roomNames[idx] && String(roomNames[idx]).trim()) {
    return String(roomNames[idx]).trim();
  }
  return Number.isFinite(Number(roomNo)) && Number(roomNo) >= 1 ? `${roomNo}번방` : '-';
}

function getSpecialZoneStats(state, selectedHoles, specialZones) {
  const zones = normalizeBingoSpecialZones(specialZones);
  const holeValues = getBingoHoleValues(state.values, selectedHoles);
  const filled = zones.reduce((count, position) => {
    const holeNo = Number(Array.isArray(state.board) ? state.board[position - 1] : '');
    if (!Number.isInteger(holeNo)) return count;
    const markType = getBingoMarkType(holeValues[holeNo]);
    return (markType === 'circle' || markType === 'heart') ? count + 1 : count;
  }, 0);
  return {
    total: zones.length,
    filled,
    complete: zones.length > 0 && filled === zones.length,
  };
}

export default function BingoSelectionMonitor({
  eventDef,
  participants = [],
  inputsByEvent = {},
  roomNames = [],
  onClose,
  onToggleLock,
  initialMode = 'status',
}) {
  const selectedHoles = normalizeBingoSelectedHoles(eventDef?.params?.selectedHoles);
  const specialZones = normalizeBingoSpecialZones(eventDef?.params?.specialZones);
  const [mode, setMode] = useState(initialMode === 'special' ? 'special' : 'status');

  useEffect(() => {
    setMode(initialMode === 'special' ? 'special' : 'status');
  }, [initialMode]);

  const rows = useMemo(() => {
    const list = Array.isArray(participants) ? [...participants] : [];
    list.sort((a, b) => {
      const roomDiff = Number(a?.room ?? 999) - Number(b?.room ?? 999);
      if (roomDiff) return roomDiff;
      return String(a?.nickname || '').localeCompare(String(b?.nickname || ''), 'ko');
    });
    return list.map((p) => {
      const state = extractBingoPersonInput(inputsByEvent?.person?.[p?.id], selectedHoles);
      const inputCount = selectedHoles.reduce((count, holeNo) => {
        const raw = state.values?.[holeNo - 1];
        return (raw === '' || raw == null) ? count : count + 1;
      }, 0);
      const boardCount = (Array.isArray(state.board) ? state.board : []).filter(Boolean).length;
      const holeValues = getBingoHoleValues(state.values, selectedHoles);
      const bingoCount = computeBingoCount(state.board, holeValues);
      const complete = inputCount === selectedHoles.length && boardCount === 16;
      const special = getSpecialZoneStats(state, selectedHoles, specialZones);
      return {
        id: String(p?.id ?? ''),
        name: String(p?.nickname || ''),
        roomLabel: roomLabel(roomNames, p?.room),
        inputCount,
        boardCount,
        bingoCount,
        complete,
        specialFilled: special.filled,
        specialTotal: special.total,
        specialComplete: special.complete,
      };
    });
  }, [participants, inputsByEvent, roomNames, selectedHoles, specialZones]);

  const doneCount = rows.filter((row) => row.complete).length;
  const specialDoneRows = rows.filter((row) => row.specialComplete);
  const locked = !!eventDef?.params?.inputLocked;

  return (
    <div style={backdrop} onClick={() => (typeof onClose === 'function' ? onClose() : null)}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={headerRow}>
          <div style={{ minWidth: 0 }}>
            <div style={title}>빙고 입력 현황 / 마감</div>
            <div style={subTitle}>{eventDef?.title || '빙고'} · 사용홀 {selectedHoles.length}개</div>
          </div>
          <button type="button" style={btn} onClick={() => (typeof onClose === 'function' ? onClose() : null)}>닫기</button>
        </div>

        <div style={tabRow}>
          <button type="button" style={mode === 'status' ? tabBtnOn : tabBtn} onClick={() => setMode('status')}>입력 현황</button>
          <button type="button" style={mode === 'special' ? tabBtnOn : tabBtn} onClick={() => setMode('special')}>Special Zone</button>
        </div>

        {mode === 'status' ? (
          <>
            <div style={summaryBox}>
              <div style={summaryItem}><b>{doneCount}</b> / {rows.length} 완료</div>
              <div style={summaryItem}>상태: <b style={{ color: locked ? '#dc2626' : '#2563eb' }}>{locked ? '마감' : '진행중'}</b></div>
              <button
                type="button"
                style={locked ? btnSub : btnPrimary}
                onClick={() => { if (typeof onToggleLock === 'function') onToggleLock(!locked); }}
              >
                {locked ? '재오픈' : '마감'}
              </button>
            </div>

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
                    <div style={summaryText}>점수입력 {row.inputCount}/{selectedHoles.length} · 빙고판 {row.boardCount}/16</div>
                    <div style={metaLine}>현재 {row.bingoCount}빙고</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={summaryBox}>
              <div style={summaryItem}>선택된 Special Zone <b>{specialZones.length}</b>칸</div>
              <div style={summaryItem}><b>{specialDoneRows.length}</b>명 완료</div>
            </div>

            {specialZones.length > 0 ? (
              <>
                <div style={chipWrap}>
                  {specialDoneRows.length > 0 ? specialDoneRows.map((row) => (
                    <span key={`done-${row.id}`} style={doneChip}>{row.name}</span>
                  )) : <span style={emptyText}>아직 모든 Special Zone을 채운 참가자가 없습니다.</span>}
                </div>

                <div style={listWrap}>
                  {rows.map((row) => (
                    <div key={`special-${row.id}`} style={rowBox}>
                      <div style={rowHead}>
                        <div style={{ minWidth: 0 }}>
                          <span style={rowName}>{row.name}</span>
                          <span style={rowMeta}> ({row.roomLabel})</span>
                        </div>
                        <span style={row.specialComplete ? badgeDone : badgeWait}>{row.specialComplete ? '완료' : '미완료'}</span>
                      </div>
                      <div style={rowBody}>
                        <div style={summaryText}>Special Zone {row.specialFilled}/{row.specialTotal}칸 채움</div>
                        <div style={metaLine}>점수 0 / -1 / -2 중 하나로 입력된 칸만 완료로 인정합니다.</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ ...emptyText, marginTop: 12 }}>설정된 Special Zone이 없습니다.</div>
            )}
          </>
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
const tabRow = { marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
const tabBtn = { border: '1px solid #d7dfea', background: '#f8fafc', color: '#475467', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const tabBtnOn = { ...tabBtn, borderColor: '#2563eb', background: '#edf4ff', color: '#1d4ed8' };
const summaryBox = { marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const summaryItem = { padding: '8px 10px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13, color: '#334155' };
const listWrap = { marginTop: 12, display: 'grid', gap: 8 };
const rowBox = { border: '1px solid #eef2f7', borderRadius: 12, padding: 10, background: '#fff' };
const rowHead = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
const rowName = { fontWeight: 700, color: '#183153' };
const rowMeta = { fontSize: 12, color: '#98a2b3' };
const rowBody = { marginTop: 6, display: 'grid', gap: 4 };
const summaryText = { fontSize: 13, color: '#344054', lineHeight: 1.45, wordBreak: 'keep-all' };
const metaLine = { fontSize: 12, color: '#667085' };
const badgeBase = { display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 8px', borderRadius: 999, fontSize: 12, border: '1px solid' };
const badgeDone = { ...badgeBase, color: '#10b981', borderColor: '#a7f3d0', background: '#ecfdf5' };
const badgeWait = { ...badgeBase, color: '#6b7280', borderColor: '#d1d5db', background: '#f9fafb' };
const btn = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer' };
const btnPrimary = { ...btn, borderColor: '#2563eb', background: '#2563eb', color: '#fff', fontWeight: 700 };
const btnSub = { ...btn, borderColor: '#d1d5db', background: '#f8fafc', color: '#344054', fontWeight: 700 };
const chipWrap = { marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 };
const doneChip = { display: 'inline-flex', alignItems: 'center', height: 30, padding: '0 12px', borderRadius: 999, background: '#fff3bf', border: '1px solid #facc15', color: '#7c2d12', fontSize: 13, fontWeight: 700 };
const emptyText = { fontSize: 13, color: '#667085', lineHeight: 1.5 };
