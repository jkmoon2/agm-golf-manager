// /src/events/bingo.js
// 빙고 이벤트 계산/정규화 유틸

import { buildTeamsByRoom } from './utils';

export const BINGO_LINES = [
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

const ALL_HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const ALL_POSITIONS = Array.from({ length: 16 }, (_, i) => i + 1);
const EMPTY_BOARD = Array.from({ length: 16 }, () => '');

function asNum(v) {
  if (v === '' || v == null) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function defaultBingoParams() {
  return {
    selectedHoles: [...ALL_HOLES],
    specialZones: [],
    inputLocked: false,
  };
}

export function normalizeBingoSelectedHoles(raw) {
  const arr = Array.isArray(raw) ? raw : defaultBingoParams().selectedHoles;
  const uniq = Array.from(new Set(arr.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 18)));
  uniq.sort((a, b) => a - b);
  return uniq.length ? uniq : defaultBingoParams().selectedHoles;
}

export function isValidBingoSelectedHoles(raw) {
  return normalizeBingoSelectedHoles(raw).length === 16;
}

export function normalizeBingoSpecialZones(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const uniq = Array.from(new Set(arr.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 16)));
  uniq.sort((a, b) => a - b);
  return uniq;
}

export function normalizeBingoBoard(rawBoard, allowedHoles) {
  const allowed = normalizeBingoSelectedHoles(allowedHoles);
  const used = new Set();
  const next = EMPTY_BOARD.map((_, idx) => {
    const raw = Array.isArray(rawBoard) ? rawBoard[idx] : '';
    const n = Number(raw);
    if (!Number.isInteger(n) || !allowed.includes(n) || used.has(n)) return '';
    used.add(n);
    return n;
  });
  return next;
}

export function getNextBingoHole(board, allowedHoles) {
  const safeBoard = normalizeBingoBoard(board, allowedHoles);
  const used = new Set(safeBoard.filter(Boolean).map(Number));
  return normalizeBingoSelectedHoles(allowedHoles).find((holeNo) => !used.has(holeNo)) || '';
}

export function getBingoMarkType(score) {
  const n = asNum(score);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'circle';
  if (n === -1 || n === -2) return 'heart';
  return '';
}

export function scoreLineBingo(markTypes = []) {
  if (!Array.isArray(markTypes) || markTypes.length !== 4) return 0;
  if (markTypes.some((type) => type !== 'circle' && type !== 'heart')) return 0;
  const hearts = markTypes.filter((type) => type === 'heart').length;
  const circles = markTypes.filter((type) => type === 'circle').length;
  if (circles === 4) return 1;
  if (circles === 3 && hearts === 1) return 1;
  if (circles === 2 && hearts === 2) return 2;
  if (circles === 1 && hearts === 3) return 3;
  if (hearts === 4) return 4;
  return 0;
}

export function computeBingoCount(board, holeValues) {
  const safeBoard = normalizeBingoBoard(board, ALL_HOLES);
  const valueMap = (holeValues && typeof holeValues === 'object') ? holeValues : {};
  return BINGO_LINES.reduce((sum, line) => {
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

export function extractBingoPersonInput(slot, selectedHoles) {
  const src = slot && typeof slot === 'object' ? slot : {};
  const values = Array.isArray(src.values) ? [...src.values] : [];
  while (values.length < 18) values.push('');
  return {
    values,
    board: normalizeBingoBoard(src.board, selectedHoles),
    roomShared: !!src.roomShared,
  };
}

function getRoomLabel(roomNo, roomNames = []) {
  const name = Array.isArray(roomNames) ? roomNames[roomNo - 1] : '';
  if (String(name || '').trim()) return String(name).trim();
  return `${roomNo}번방`;
}

export function computeBingo(eventDef, participants = [], inputsByEvent = {}, options = {}) {
  const params = eventDef?.params || {};
  const roomNames = Array.isArray(options?.roomNames) ? options.roomNames : [];
  const roomCount = Number(options?.roomCount || 0) || Math.max(0, ...participants.map((p) => Number(p?.room || 0)));
  const rankOrder = eventDef?.rankOrder === 'asc' ? 'asc' : 'desc';
  const sign = rankOrder === 'asc' ? 1 : -1;
  const selectedHoles = normalizeBingoSelectedHoles(params.selectedHoles);
  const byEventPerson = inputsByEvent?.[eventDef?.id]?.person || {};

  const personRows = (Array.isArray(participants) ? participants : []).map((p) => {
    const pid = String(p?.id ?? '');
    const personInput = extractBingoPersonInput(byEventPerson?.[pid], selectedHoles);
    const holeValues = getBingoHoleValues(personInput.values, selectedHoles);
    const bingoCount = computeBingoCount(personInput.board, holeValues);
    return {
      key: pid || String(Math.random()),
      id: pid,
      name: String(p?.nickname || ''),
      room: Number(p?.room || 0),
      roomLabel: getRoomLabel(Number(p?.room || 0), roomNames),
      value: bingoCount,
      board: personInput.board,
      holeValues,
      roomShared: personInput.roomShared,
    };
  }).filter((row) => row.id !== '');

  personRows.sort((a, b) => sign * (a.value - b.value) || String(a.name).localeCompare(String(b.name), 'ko'));

  const roomRows = Array.from({ length: roomCount }, (_, idx) => {
    const roomNo = idx + 1;
    const rows = personRows.filter((row) => Number(row.room) === roomNo);
    return {
      key: String(roomNo),
      room: roomNo,
      name: getRoomLabel(roomNo, roomNames),
      value: rows.reduce((sum, row) => sum + (Number(row.value) || 0), 0),
    };
  });
  roomRows.sort((a, b) => sign * (a.value - b.value) || String(a.name).localeCompare(String(b.name), 'ko'));

  let teamRows = [];
  try {
    const built = buildTeamsByRoom(participants, roomCount || 0);
    teamRows = (Array.isArray(built?.teamsByRoom) ? built.teamsByRoom : []).flat().map((team) => {
      const members = Array.isArray(team?.members) ? team.members : [];
      const roomNo = Number(team?.roomIdx) + 1;
      const teamName = String(team?.key || '').includes('-') ? String(team.key).split('-')[1] : 'A';
      return {
        key: String(team?.key || `${roomNo}-${teamName}`),
        label: `${getRoomLabel(roomNo, roomNames)} ${teamName}팀`,
        value: members.reduce((sum, member) => {
          const row = personRows.find((item) => String(item.id) === String(member?.id ?? ''));
          return sum + (Number(row?.value) || 0);
        }, 0),
      };
    });
    teamRows.sort((a, b) => sign * (a.value - b.value) || String(a.label).localeCompare(String(b.label), 'ko'));
  } catch {
    teamRows = [];
  }

  return {
    selectedHoles,
    specialZones: normalizeBingoSpecialZones(params.specialZones),
    personRows,
    roomRows,
    teamRows,
  };
}

export { ALL_HOLES, ALL_POSITIONS, EMPTY_BOARD };
