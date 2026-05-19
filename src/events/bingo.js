// /src/events/bingo.js
// 빙고 이벤트 계산/정규화 유틸

import { buildTeamsByRoom } from './utils';

export const BINGO_LINES_4X4 = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 11],
  [12, 13, 14, 15],
  [0, 4, 8, 12],
  [1, 5, 9, 13],
  [2, 6, 10, 14],
  [3, 7, 11, 15],
  [0, 5, 10, 15],
  [3, 6, 9, 12],
];

export const BINGO_LINES_3X3 = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const LARGE_BINGO_LINES_6X6 = [
  [0, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10, 11],
  [12, 13, 14, 15, 16, 17],
  [18, 19, 20, 21, 22, 23],
  [24, 25, 26, 27, 28, 29],
  [30, 31, 32, 33, 34, 35],
  [0, 6, 12, 18, 24, 30],
  [1, 7, 13, 19, 25, 31],
  [2, 8, 14, 20, 26, 32],
  [3, 9, 15, 21, 27, 33],
  [4, 10, 16, 22, 28, 34],
  [5, 11, 17, 23, 29, 35],
  [0, 7, 14, 21, 28, 35],
  [5, 10, 15, 20, 25, 30],
];

// 기존 export 이름 유지(4×4 기본)
export const BINGO_LINES = BINGO_LINES_4X4;

const ALL_HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const ALL_POSITIONS = Array.from({ length: 16 }, (_, i) => i + 1);
const EMPTY_BOARD = Array.from({ length: 16 }, () => '');
const EMPTY_BOARD_3X3 = Array.from({ length: 9 }, () => '');

function asNum(v) {
  if (v === '' || v == null) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function sortRowsByRankOrder(rows = [], rankOrder = 'desc', labelKey = 'name') {
  const sign = rankOrder === 'asc' ? 1 : -1;
  const safe = Array.isArray(rows) ? [...rows] : [];
  safe.sort((a, b) => {
    const diff = sign * ((Number(a?.value) || 0) - (Number(b?.value) || 0));
    if (diff) return diff;
    return String(a?.[labelKey] || a?.label || '').localeCompare(String(b?.[labelKey] || b?.label || ''), 'ko');
  });
  return safe;
}

export function defaultBingoParams() {
  return {
    selectedHoles: [...ALL_HOLES],
    specialZones: [],
    inputLocked: false,
    scoreHoleCount: 18,
    boardCellCount: 16,
  };
}

export function normalizeBingoBoardCellCount(raw) {
  return Number(raw) === 9 ? 9 : 16;
}

export function getBingoGridSize(boardCellCount) {
  return normalizeBingoBoardCellCount(boardCellCount) === 9 ? 3 : 4;
}

export function getBingoLines(boardCellCount) {
  return normalizeBingoBoardCellCount(boardCellCount) === 9 ? BINGO_LINES_3X3 : BINGO_LINES_4X4;
}

function getTargetCellCountFromHoles(allowedHoles, explicitCellCount) {
  if (Number(explicitCellCount) === 9) return 9;
  if (Number(explicitCellCount) === 16) return 16;
  const arr = Array.isArray(allowedHoles) ? allowedHoles : [];
  return arr.length === 9 ? 9 : 16;
}

export function normalizeBingoScoreHoleCount(raw) {
  const n = Number(raw);
  if (n === 9 || n === 16 || n === 18) return n;
  return 18;
}

export function normalizeBingoSelectedHoles(raw, targetCellCount) {
  const arr = Array.isArray(raw) ? raw : defaultBingoParams().selectedHoles;
  const uniq = Array.from(new Set(arr.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 18)));
  uniq.sort((a, b) => a - b);
  // 기존 4×4 운영 방식처럼 기본값은 전체 18홀 선택 상태를 유지합니다.
  // 3×3도 처음에는 전체 선택 → 운영자가 터치로 해제해서 9개에 맞춥니다.
  if (!uniq.length) return defaultBingoParams().selectedHoles;
  return uniq;
}

export function isValidBingoSelectedHoles(raw, targetCellCount = 16) {
  return normalizeBingoSelectedHoles(raw, targetCellCount).length === normalizeBingoBoardCellCount(targetCellCount);
}

export function normalizeBingoSpecialZones(raw, boardCellCount = 16) {
  const max = normalizeBingoBoardCellCount(boardCellCount);
  const arr = Array.isArray(raw) ? raw : [];
  const uniq = Array.from(new Set(arr.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= max)));
  uniq.sort((a, b) => a - b);
  return uniq;
}

export function normalizeBingoBoard(rawBoard, allowedHoles, boardCellCount) {
  const allowed = normalizeBingoSelectedHoles(allowedHoles, boardCellCount);
  const cellCount = getTargetCellCountFromHoles(allowed, boardCellCount);
  const empty = Array.from({ length: cellCount }, () => '');
  const used = new Set();
  const next = empty.map((_, idx) => {
    const raw = Array.isArray(rawBoard) ? rawBoard[idx] : '';
    const n = Number(raw);
    if (!Number.isInteger(n) || !allowed.includes(n) || used.has(n)) return '';
    used.add(n);
    return n;
  });
  return next;
}

export function getNextBingoHole(board, allowedHoles, boardCellCount) {
  const safeBoard = normalizeBingoBoard(board, allowedHoles, boardCellCount);
  const used = new Set(safeBoard.filter(Boolean).map(Number));
  return normalizeBingoSelectedHoles(allowedHoles, boardCellCount).find((holeNo) => !used.has(holeNo)) || '';
}

export function getBingoMarkType(score) {
  const n = asNum(score);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'circle';
  if (n === -1 || n === -2) return 'heart';
  return '';
}

export function scoreLineBingo(markTypes = []) {
  if (!Array.isArray(markTypes) || !markTypes.length) return 0;
  if (markTypes.some((type) => type !== 'circle' && type !== 'heart')) return 0;
  const hearts = markTypes.filter((type) => type === 'heart').length;
  return Math.max(1, hearts);
}

export function computeBingoCount(board, holeValues, boardCellCount) {
  const safeBoard = normalizeBingoBoard(board, ALL_HOLES, boardCellCount || (Array.isArray(board) && board.length === 9 ? 9 : 16));
  const valueMap = (holeValues && typeof holeValues === 'object') ? holeValues : {};
  return getBingoLines(safeBoard.length).reduce((sum, line) => {
    const marks = line.map((boardIdx) => {
      const holeNo = Number(safeBoard[boardIdx]);
      if (!Number.isInteger(holeNo)) return '';
      return getBingoMarkType(valueMap[holeNo]);
    });
    return sum + scoreLineBingo(marks);
  }, 0);
}

export function getBingoHoleValues(slotValues, selectedHoles) {
  const arr = Array.isArray(slotValues) ? slotValues : [];
  const holes = normalizeBingoSelectedHoles(selectedHoles);
  const out = {};
  holes.forEach((holeNo) => {
    const raw = arr[holeNo - 1];
    const n = asNum(raw);
    out[holeNo] = Number.isFinite(n) ? n : '';
  });
  return out;
}

export function extractBingoPersonInput(slot, selectedHoles, boardCellCount) {
  const src = slot && typeof slot === 'object' ? slot : {};
  const values = Array.isArray(src.values) ? [...src.values] : [];
  while (values.length < 18) values.push('');
  return {
    values,
    board: normalizeBingoBoard(src.board, selectedHoles, boardCellCount),
    roomShared: !!src.roomShared,
  };
}

function getRoomLabel(roomNo, roomNames = []) {
  const idx = Number(roomNo) - 1;
  const name = Array.isArray(roomNames) ? roomNames[idx] : '';
  if (String(name || '').trim()) return String(name).trim();
  return Number.isFinite(Number(roomNo)) && Number(roomNo) >= 1 ? `${roomNo}번방` : '-';
}

export function normalizeBingoLargeOrder(rawOrder, roomMemberIds = []) {
  const ids = (Array.isArray(roomMemberIds) ? roomMemberIds : []).map((id) => String(id || '')).filter(Boolean);
  const seen = new Set();
  const out = [];
  (Array.isArray(rawOrder) ? rawOrder : []).forEach((id) => {
    const key = String(id || '');
    if (!key || !ids.includes(key) || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  });
  ids.forEach((id) => {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  });
  while (out.length < 4) out.push('');
  return out.slice(0, 4);
}

export function buildLargeBingoPreview(boardRows = [], order = [], specialZones = []) {
  const rows = Array.isArray(boardRows) ? boardRows : [];
  const ids = rows.map((row) => String(row?.pid ?? row?.participantId ?? row?.id ?? '')).filter(Boolean);
  const safeOrder = normalizeBingoLargeOrder(order, ids);
  const byId = new Map(rows.map((row) => [String(row?.pid ?? row?.participantId ?? row?.id ?? ''), row]));
  const bigCells = Array.from({ length: 36 }, (_, idx) => {
    const r = Math.floor(idx / 6);
    const c = idx % 6;
    const quad = (r < 3 ? 0 : 2) + (c < 3 ? 0 : 1);
    const inner = (r % 3) * 3 + (c % 3);
    const pid = safeOrder[quad] || '';
    const row = byId.get(String(pid || '')) || null;
    const board = normalizeBingoBoard(row?.board, ALL_HOLES, 9);
    const holeNo = Number(board[inner]);
    const mark = Number.isInteger(holeNo) ? getBingoMarkType(row?.holeValues?.[holeNo]) : '';
    return {
      idx,
      pid,
      name: String(row?.name || ''),
      holeNo: Number.isInteger(holeNo) ? holeNo : '',
      mark,
      specialZone: normalizeBingoSpecialZones(specialZones, 9).includes(inner + 1),
    };
  });
  const total = LARGE_BINGO_LINES_6X6.reduce((sum, line) => sum + scoreLineBingo(line.map((idx) => bigCells[idx]?.mark || '')), 0);
  return { order: safeOrder, cells: bigCells, total };
}

export function buildBingoRoomRowsFromPersonRows(personRows = [], roomCount = 0, roomNames = []) {
  const safeRows = Array.isArray(personRows) ? personRows : [];
  const maxRoom = Math.max(
    Number(roomCount || 0) || 0,
    ...safeRows.map((row) => Number(row?.room || 0) || 0),
  );
  return Array.from({ length: Math.max(0, maxRoom) }, (_, idx) => {
    const roomNo = idx + 1;
    const members = safeRows.filter((row) => Number(row?.room || 0) === roomNo);
    const total = members.reduce((sum, row) => sum + (Number(row?.value) || 0), 0);
    return {
      key: String(roomNo),
      room: roomNo,
      name: getRoomLabel(roomNo, roomNames),
      value: total,
      memberCount: members.length,
    };
  });
}

export function buildBingoTeamRowsFromPersonRows(personRows = [], participants = [], roomCount = 0, roomNames = []) {
  const safeRows = Array.isArray(personRows) ? personRows : [];
  const valueMap = new Map(safeRows.map((row) => [String(row?.id ?? ''), Number(row?.value) || 0]));
  try {
    const built = buildTeamsByRoom(participants, Number(roomCount || 0));
    const teams = Array.isArray(built?.teamsByRoom) ? built.teamsByRoom.flat() : [];
    return teams.map((team) => {
      const members = Array.isArray(team?.members) ? team.members : [];
      const roomNo = Number(team?.roomIdx) + 1;
      const teamName = String(team?.key || '').includes('-') ? String(team.key).split('-')[1] : 'A';
      return {
        key: String(team?.key || `${roomNo}-${teamName}`),
        label: `${getRoomLabel(roomNo, roomNames)} ${teamName}팀`,
        value: members.reduce((sum, member) => sum + (valueMap.get(String(member?.id ?? '')) || 0), 0),
      };
    });
  } catch {
    return [];
  }
}

export function computeBingo(eventDef, participants = [], inputsByEvent = {}, options = {}) {
  const params = eventDef?.params || {};
  const roomNames = Array.isArray(options?.roomNames) ? options.roomNames : [];
  const roomCount = Number(options?.roomCount || 0) || Math.max(0, ...participants.map((p) => Number(p?.room || 0)));
  const rankOrder = eventDef?.rankOrder === 'asc' ? 'asc' : 'desc';
  const boardCellCount = normalizeBingoBoardCellCount(params.boardCellCount);
  const selectedHoles = normalizeBingoSelectedHoles(params.selectedHoles, boardCellCount);
  const specialZones = normalizeBingoSpecialZones(params.specialZones, boardCellCount);
  const byEvent = inputsByEvent?.[eventDef?.id] || {};
  const byEventPerson = byEvent?.person || {};
  const byEventShared = byEvent?.shared || {};

  const personRowsBase = (Array.isArray(participants) ? participants : []).map((p) => {
    const pid = String(p?.id ?? '');
    const personInput = extractBingoPersonInput(byEventPerson?.[pid], selectedHoles, boardCellCount);
    const holeValues = getBingoHoleValues(personInput.values, selectedHoles);
    const bingoCount = computeBingoCount(personInput.board, holeValues, boardCellCount);
    const roomNo = Number(p?.room || 0);
    return {
      key: pid || String(Math.random()),
      id: pid,
      name: String(p?.nickname || ''),
      participant: p,
      room: roomNo,
      roomLabel: getRoomLabel(roomNo, roomNames),
      value: bingoCount,
      board: personInput.board,
      holeValues,
      roomShared: !!personInput.roomShared,
    };
  }).filter((row) => row.id !== '');

  const roomDetails = Array.from({ length: Math.max(0, roomCount) }, (_, idx) => {
    const roomNo = idx + 1;
    const members = personRowsBase.filter((row) => Number(row?.room || 0) === roomNo);
    const slots = members.map((row) => ({
      participantId: row.id,
      participant: row.participant,
      name: row.name,
      board: row.board,
      holeValues: row.holeValues,
      total: row.value,
      cells: (row.board || []).map((holeNo, cellIdx) => ({
        cellIdx,
        holeNo,
        rawValue: row.holeValues?.[holeNo],
        mark: getBingoMarkType(row.holeValues?.[holeNo]),
      })),
    }));
    const largeOrders = byEventShared?.largeBingoOrders && typeof byEventShared.largeBingoOrders === 'object' ? byEventShared.largeBingoOrders : {};
    const largeOrder = normalizeBingoLargeOrder(largeOrders[String(roomNo)], slots.map((slot) => slot.participantId));
    const largeBingo = boardCellCount === 9
      ? buildLargeBingoPreview(slots.map((slot) => ({ pid: slot.participantId, name: slot.name, board: slot.board, holeValues: slot.holeValues })), largeOrder, specialZones)
      : null;
    return {
      key: String(roomNo),
      roomNo,
      name: getRoomLabel(roomNo, roomNames),
      slots,
      total: slots.reduce((sum, slot) => sum + (Number(slot?.total) || 0), 0),
      largeBingo,
    };
  });

  const largeRoomRows = boardCellCount === 9
    ? roomDetails.map((room) => ({
        key: String(room.roomNo),
        room: room.roomNo,
        name: room.name,
        value: Number(room?.largeBingo?.total || 0),
        memberCount: (room.slots || []).length,
      }))
    : [];

  const personRows = sortRowsByRankOrder(personRowsBase, rankOrder, 'name');
  const roomRows = sortRowsByRankOrder(buildBingoRoomRowsFromPersonRows(personRowsBase, roomCount, roomNames), rankOrder, 'name');
  const teamRows = sortRowsByRankOrder(buildBingoTeamRowsFromPersonRows(personRowsBase, participants, roomCount, roomNames), rankOrder, 'label');

  return {
    boardCellCount,
    selectedHoles,
    specialZones,
    personRows,
    roomRows,
    teamRows,
    rooms: roomDetails,
    largeRoomRows: sortRowsByRankOrder(largeRoomRows, rankOrder, 'name'),
  };
}

export { ALL_HOLES, ALL_POSITIONS, EMPTY_BOARD, EMPTY_BOARD_3X3 };
