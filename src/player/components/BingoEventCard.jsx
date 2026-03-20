// /src/player/components/BingoEventCard.jsx

import React, { useEffect, useMemo, useState } from 'react';
import baseCss from '../screens/PlayerRoomTable.module.css';
import tCss from '../screens/PlayerEventInput.module.css';
import {
  computeBingo,
  normalizeBingoBoard,
  normalizeBingoSelectedHoles,
} from '../../events/bingo';

function formatDisplayNumber(value) {
  if (value === '' || value == null) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const s = n.toFixed(2);
  return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function getMarkText(mark) {
  if (mark === 'heart') return '♡';
  if (mark === 'circle') return '○';
  return '';
}

export default function BingoEventCard({
  eventDef,
  participants = [],
  roomMembers = [],
  roomIdx,
  roomNames = [],
  inputsByEvent = {},
  patchAccum,
  finalizeAccum,
  onBoardChange,
  eventInputRefs,
  startEventLongMinus,
  cancelEventLongPress,
}) {
  const selectedHoles = useMemo(
    () => normalizeBingoSelectedHoles(eventDef?.params?.selectedHoles),
    [eventDef?.params?.selectedHoles]
  );
  const sharedBoardInRoom = !!eventDef?.params?.sharedBoardInRoom;
  const memberIds = useMemo(
    () => roomMembers.filter(Boolean).map((p) => String(p.id)),
    [roomMembers]
  );
  const defaultEditorPid = memberIds[0] || '';
  const [editorPid, setEditorPid] = useState(defaultEditorPid);
  const [activeCellIdx, setActiveCellIdx] = useState(0);

  useEffect(() => {
    if (!memberIds.includes(String(editorPid))) {
      setEditorPid(defaultEditorPid);
    }
  }, [memberIds, editorPid, defaultEditorPid]);

  const bingoData = useMemo(() => {
    if (!eventDef) return null;
    return computeBingo(eventDef, participants, inputsByEvent, {
      roomNames,
      roomCount: Math.max(Number(roomIdx || 0), roomNames.length || 0),
    });
  }, [eventDef, participants, inputsByEvent, roomNames, roomIdx]);

  const roomData = useMemo(() => {
    return (bingoData?.rooms || []).find((room) => Number(room?.roomNo) === Number(roomIdx)) || null;
  }, [bingoData, roomIdx]);

  const editorBoard = useMemo(() => {
    if (!roomData) return selectedHoles;
    if (sharedBoardInRoom) {
      const slot = (roomData.slots || []).find((item) => item?.participantId);
      return normalizeBingoBoard(slot?.board, selectedHoles);
    }
    const slot = (roomData.slots || []).find((item) => String(item?.participantId) === String(editorPid));
    return normalizeBingoBoard(slot?.board, selectedHoles);
  }, [roomData, sharedBoardInRoom, editorPid, selectedHoles]);

  const swapHole = (holeNo) => {
    if (!editorBoard.length) return;
    const next = [...editorBoard];
    const sourceIdx = next.findIndex((value) => Number(value) === Number(holeNo));
    const targetIdx = Math.max(0, Math.min(15, Number(activeCellIdx || 0)));
    if (sourceIdx < 0 || targetIdx < 0 || sourceIdx === targetIdx) return;
    const temp = next[targetIdx];
    next[targetIdx] = next[sourceIdx];
    next[sourceIdx] = temp;
    onBoardChange(eventDef?.id, sharedBoardInRoom ? defaultEditorPid : editorPid, next, {
      sharedBoardInRoom,
      roomMemberIds: memberIds,
      selectedHoles,
    });
  };

  const resetBoard = () => {
    onBoardChange(eventDef?.id, sharedBoardInRoom ? defaultEditorPid : editorPid, selectedHoles, {
      sharedBoardInRoom,
      roomMemberIds: memberIds,
      selectedHoles,
    });
  };

  return (
    <div className={`${baseCss.card} ${tCss.eventCard}`}>
      <div className={baseCss.cardHeader}>
        <div className={`${baseCss.cardTitle} ${tCss.eventTitle}`}>{eventDef?.title}</div>
      </div>

      <div style={summaryBox}>
        <div>선택 홀: <b>{selectedHoles.join(', ')}</b></div>
        <div>빙고판: <b>{sharedBoardInRoom ? '방 공통 입력' : '개별 입력'}</b></div>
        <div style={{ color: '#64748b' }}>-1/-2 = ♡, 0 = ○, 완성된 한 줄의 ♡ 개수만큼 빙고가 올라가며 ○ 4개는 1빙고입니다.</div>
      </div>

      <div className={`${baseCss.tableWrap} ${tCss.noOverflow}`}>
        <table className={tCss.table} style={{ width: `${Math.max(110, 34 + selectedHoles.length * 5)}%` }}>
          <thead>
            <tr>
              <th>닉네임</th>
              {selectedHoles.map((holeNo) => <th key={`bingo-head-${holeNo}`}>{holeNo}</th>)}
              <th>빙고</th>
            </tr>
          </thead>
          <tbody>
            {roomMembers.map((p, rowIdx) => {
              const slot = (roomData?.slots || []).find((item) => String(item?.participantId) === String(p?.id));
              return (
                <tr key={`bingo-row-${rowIdx}`}>
                  <td>{p ? p.nickname : ''}</td>
                  {selectedHoles.map((holeNo) => {
                    const valueIndex = holeNo - 1;
                    const cellValue = p ? (inputsByEvent?.[eventDef?.id]?.person?.[p.id]?.values?.[valueIndex] ?? '') : '';
                    const inputKey = `${eventDef?.id}:${p ? p.id : 'empty'}:${valueIndex}`;
                    return (
                      <td key={`bingo-cell-${rowIdx}-${holeNo}`} className={tCss.cellEditable}>
                        <input
                          ref={(el) => {
                            if (!eventInputRefs?.current) return;
                            if (el) eventInputRefs.current[inputKey] = el;
                            else delete eventInputRefs.current[inputKey];
                          }}
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9.+\-]*"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          className={tCss.cellInput}
                          value={cellValue}
                          onChange={(e) => p && patchAccum(eventDef?.id, p.id, valueIndex, e.target.value, 18)}
                          onBlur={(e) => p && finalizeAccum(eventDef?.id, p.id, valueIndex, e.target.value, 18)}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          onPointerDown={(e) => {
                            if (p) {
                              e.stopPropagation();
                              startEventLongMinus(eventDef?.id, p.id, valueIndex, cellValue, 18);
                            }
                          }}
                          onPointerUp={() => cancelEventLongPress(inputKey)}
                          onPointerCancel={() => cancelEventLongPress(inputKey)}
                          onPointerLeave={() => cancelEventLongPress(inputKey)}
                          onTouchStart={(e) => {
                            if (p) {
                              e.stopPropagation();
                              startEventLongMinus(eventDef?.id, p.id, valueIndex, cellValue, 18);
                            }
                          }}
                          onTouchEnd={() => cancelEventLongPress(inputKey)}
                          onTouchCancel={() => cancelEventLongPress(inputKey)}
                        />
                      </td>
                    );
                  })}
                  <td className={tCss.totalCell}>{formatDisplayNumber(slot?.total)}</td>
                </tr>
              );
            })}
            <tr className={tCss.subtotalRow}>
              <td className={tCss.subtotalLabel}>방합계</td>
              {selectedHoles.map((holeNo) => {
                const sum = (roomData?.slots || []).reduce((acc, slot) => {
                  const cell = (slot?.cells || []).find((item) => Number(item?.holeNo) === Number(holeNo));
                  const raw = Number(cell?.rawValue);
                  return Number.isFinite(raw) ? acc + raw : acc;
                }, 0);
                return <td key={`bingo-sum-${holeNo}`} className={tCss.subtotalBlue}>{formatDisplayNumber(sum)}</td>;
              })}
              <td className={tCss.subtotalRed}>{formatDisplayNumber(roomData?.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={editorWrap}>
        <div style={editorHead}>
          <div>
            <div style={editorTitle}>빙고판 배치</div>
            <div style={editorSub}>{sharedBoardInRoom ? '현재 방 4명이 같은 빙고판을 사용합니다.' : '참가자별로 4×4 빙고판 위치를 정할 수 있습니다.'}</div>
          </div>
          <button type="button" onClick={resetBoard} style={miniBtn}>기본배치</button>
        </div>

        {!sharedBoardInRoom && (
          <div style={pickerRow}>
            {roomMembers.filter(Boolean).map((member) => (
              <button
                key={`board-member-${member.id}`}
                type="button"
                onClick={() => setEditorPid(String(member.id))}
                style={{ ...memberBtn, ...(String(editorPid) === String(member.id) ? memberBtnActive : null) }}
              >
                {member.nickname}
              </button>
            ))}
          </div>
        )}

        <div style={boardEditorGrid}>
          {editorBoard.map((holeNo, idx) => (
            <button
              key={`editor-cell-${idx}`}
              type="button"
              onClick={() => setActiveCellIdx(idx)}
              style={{ ...editorCell, ...(idx === activeCellIdx ? editorCellActive : null) }}
            >
              {holeNo}
            </button>
          ))}
        </div>

        <div style={chipGuide}>아래 홀을 눌러 선택한 칸과 위치를 서로 바꿉니다.</div>
        <div style={chipWrap}>
          {selectedHoles.map((holeNo) => (
            <button
              key={`bingo-hole-chip-${holeNo}`}
              type="button"
              onClick={() => swapHole(holeNo)}
              style={chipBtn}
            >
              {holeNo}홀
            </button>
          ))}
        </div>
      </div>

      <div style={previewWrap}>
        <div style={editorTitle}>실시간 빙고판 미리보기</div>
        <div style={previewGrid}>
          {(roomData?.slots || []).filter((slot) => slot?.participant).map((slot) => (
            <div key={`preview-board-${slot.participantId}`} style={previewCard}>
              <div style={previewHead}>
                <span>{slot.participant?.nickname || ''}</span>
                <b>{formatDisplayNumber(slot.total)}빙고</b>
              </div>
              <div style={previewBoard}>
                {(slot.cells || []).map((cell, idx) => (
                  <div key={`preview-cell-${slot.participantId}-${idx}`} style={previewCell}>
                    <span style={previewHoleNo}>{cell.holeNo}</span>
                    <span style={previewMark}>{getMarkText(cell.mark)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const summaryBox = {
  display: 'grid',
  gap: 4,
  padding: '0 12px 8px',
  fontSize: 12,
  lineHeight: 1.5,
};
const editorWrap = {
  display: 'grid',
  gap: 10,
  marginTop: 12,
  padding: '0 12px 12px',
};
const editorHead = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
};
const editorTitle = {
  fontWeight: 700,
  fontSize: 14,
};
const editorSub = {
  fontSize: 12,
  color: '#64748b',
  marginTop: 2,
  lineHeight: 1.4,
};
const miniBtn = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  borderRadius: 8,
  padding: '8px 10px',
  fontWeight: 600,
};
const pickerRow = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
};
const memberBtn = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  borderRadius: 999,
  padding: '8px 12px',
  fontWeight: 700,
};
const memberBtnActive = {
  borderColor: '#2563eb',
  background: '#dbeafe',
  color: '#1d4ed8',
};
const boardEditorGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 8,
};
const editorCell = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  borderRadius: 10,
  minHeight: 56,
  fontWeight: 800,
  fontSize: 18,
};
const editorCellActive = {
  borderColor: '#2563eb',
  background: '#eff6ff',
  color: '#1d4ed8',
};
const chipGuide = {
  fontSize: 12,
  color: '#64748b',
};
const chipWrap = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 8,
};
const chipBtn = {
  border: '1px solid #d1d5db',
  background: '#f8fafc',
  borderRadius: 10,
  padding: '10px 0',
  fontWeight: 700,
};
const previewWrap = {
  display: 'grid',
  gap: 10,
  marginTop: 4,
  padding: '0 12px 12px',
};
const previewGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
};
const previewCard = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 10,
  background: '#fff',
};
const previewHead = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
  fontSize: 13,
};
const previewBoard = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 4,
};
const previewCell = {
  position: 'relative',
  aspectRatio: '1 / 1',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  background: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const previewHoleNo = {
  position: 'absolute',
  top: 4,
  left: 6,
  fontSize: 11,
  color: '#64748b',
  fontWeight: 700,
};
const previewMark = {
  fontSize: 26,
  lineHeight: 1,
  fontWeight: 700,
};
