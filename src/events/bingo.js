// /src/events/bingo.js

import { buildTeamsByRoom } from './utils';

export const BINGO_SIZE = 4;
export const BINGO_CELL_COUNT = BINGO_SIZE * BINGO_SIZE;
export const BINGO_ALL_HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
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

const asNum = (v) => {
  if (v === '' || v == null) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export function defaultBingoParams() {
  return {
    selectedHoles: BINGO_ALL_HOLES.slice(0, 16),
    sharedBoardInRoom: false,
  };
}

export function normalizeBingoSelectedHoles(value) {
  const arr = Array.isArray(value) ? value : [];
  const out = [];
  const seen = new Set();

  arr.forEach((item) => {
    const n = Number(item);
    if (!Number.isInteger(n) || n < 1 || n > 18) return;
    if (seen.has(n)) return;
    seen.add(n);
    out.push(n);
  });

  if (out.length < BINGO_CELL_COUNT) {
    BINGO_ALL_HOLES.forEach((n) => {
      if (out.length >= BINGO_CELL_COUNT) return;
      if (seen.has(n)) return;
      seen.add(n);
      out.push(n);
    });
  }

  return out.slice(0, BINGO_CELL_COUNT);
}

export function normalizeBingoBoard(value, selectedHoles) {
  const base = normalizeBingoSelectedHoles(selectedHoles);
  const allowed = new Set(base);
  const picked = [];
  const seen = new Set();

  (Array.isArray(value) ? value : []).forEach((item) => {
    const n = Number(item);
    if (!Number.isInteger(n)) return;
    if (!allowed.has(n) || seen.has(n)) return;
    seen.add(n);
    picked.push(n);
  });

  base.forEach((n) => {
    if (picked.length >= BINGO_CELL_COUNT) return;
    if (seen.has(n)) return;
    seen.add(n);
    picked.push(n);
  });

  return picked.slice(0, BINGO_CELL_COUNT);
}

export function getBingoMark(rawValue) {
  const n = asNum(rawValue);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'circle';
  if (n === -1 || n === -2) return 'heart';
  return '';
}

export function computeBingoLineScore(marks = []) {
  const safe = Array.isArray(marks) ? marks : [];
  if (safe.length !== BINGO_SIZE) return 0;
  if (safe.some((mark) => mark !== 'circle' && mark !== 'heart')) return 0;
  const heartCount = safe.filter((mark) => mark === 'heart').length;
  return heartCount === 0 ? 1 : heartCount;
}

function getRoomCountFromParticipants(participants = []) {
  return (Array.isArray(participants) ? participants : []).reduce((max, p) => {
    const room = Number(p?.room);
    return Number.isFinite(room) && room > max ? room : max;
  }, 0);
}

function getRoomLabel(roomNo, roomNames = []) {
  const idx = Number(roomNo) - 1;
  const named = Array.isArray(roomNames) ? String(roomNames[idx] || '').trim() : '';
  return named || `${roomNo}번방`;
}

function getInputValuesForParticipant(inputsByEvent, eventId, participantId) {
  const slot = inputsByEvent?.[eventId]?.person?.[participantId];
  if (slot && typeof slot === 'object' && Array.isArray(slot.values)) {
    const arr = [...slot.values];
    while (arr.length < 18) arr.push('');
    return arr;
  }
  const arr = Array.from({ length: 18 }, () => '');
  if (slot !== '' && slot != null && typeof slot !== 'object') arr[0] = slot;
  return arr;
}

function getBoardForParticipant(inputsByEvent, eventId, participantId, selectedHoles) {
  const slot = inputsByEvent?.[eventId]?.person?.[participantId];
  return normalizeBingoBoard(slot?.board, selectedHoles);
}

export function computeBingo(eventDef, participants = [], inputsByEvent = {}, options = {}) {
  const params = eventDef?.params || {};
  const selectedHoles = normalizeBingoSelectedHoles(params.selectedHoles);
  const sharedBoardInRoom = !!params.sharedBoardInRoom;
  const roomNames = Array.isArray(options?.roomNames) ? options.roomNames : [];
  const roomCount = Number(options?.roomCount || 0) > 0 ? Number(options.roomCount) : getRoomCountFromParticipants(participants);
  const built = buildTeamsByRoom(participants, roomCount || 0);
  const orderedByRoom = Array.isArray(built?.orderedByRoom) ? built.orderedByRoom : [];
  const teamsByRoom = Array.isArray(built?.teamsByRoom) ? built.teamsByRoom : [];
  const rankOrder = eventDef?.rankOrder === 'asc' ? 'asc' : 'desc';
  const sign = rankOrder === 'asc' ? 1 : -1;

  const rooms = orderedByRoom.map((slotArr, roomIdx) => {
    const roomNo = roomIdx + 1;
    const roomLabel = getRoomLabel(roomNo, roomNames);
    const roomParticipants = (Array.isArray(slotArr) ? slotArr : []).filter((p) => p && p.id != null);

    let sharedBoard = selectedHoles;
    if (sharedBoardInRoom) {
      const ref = roomParticipants.find((p) => {
        const slot = inputsByEvent?.[eventDef?.id]?.person?.[String(p.id)];
        return Array.isArray(slot?.board) && slot.board.length;
      });
      if (ref) sharedBoard = getBoardForParticipant(inputsByEvent, eventDef?.id, String(ref.id), selectedHoles);
    }

    const slots = Array.from({ length: BINGO_SIZE }, (_, slotIdx) => {
      const participant = slotArr?.[slotIdx] || null;
      const participantId = participant?.id != null ? String(participant.id) : '';
      const holeValues = participantId
        ? getInputValuesForParticipant(inputsByEvent, eventDef?.id, participantId)
        : Array.from({ length: 18 }, () => '');
      const board = participantId
        ? (sharedBoardInRoom ? normalizeBingoBoard(sharedBoard, selectedHoles) : getBoardForParticipant(inputsByEvent, eventDef?.id, participantId, selectedHoles))
        : normalizeBingoBoard([], selectedHoles);
      const cells = board.map((holeNo) => {
        const rawValue = holeValues[holeNo - 1] ?? '';
        const mark = getBingoMark(rawValue);
        return { holeNo, rawValue, mark };
      });
      const lineScores = BINGO_LINES.map((line) => computeBingoLineScore(line.map((idx) => cells[idx]?.mark || '')));
      const total = lineScores.reduce((sum, value) => sum + (Number(value) || 0), 0);
      return {
        slotNo: slotIdx + 1,
        participant,
        participantId,
        roomNo,
        roomLabel,
        board,
        cells,
        lineScores,
        total,
      };
    });

    return {
      roomNo,
      roomLabel,
      slots,
      total: slots.reduce((sum, slot) => sum + (Number(slot.total) || 0), 0),
    };
  });

  const personRows = [];
  rooms.forEach((room) => {
    room.slots.forEach((slot) => {
      if (!slot.participant || slot.participant.id == null) return;
      personRows.push({
        key: `${room.roomNo}-${slot.slotNo}-${slot.participantId}`,
        id: slot.participantId,
        name: String(slot.participant?.nickname || ''),
        room: room.roomNo,
        roomLabel: room.roomLabel,
        slotNo: slot.slotNo,
        value: Number(slot.total || 0),
        board: slot.board,
        cells: slot.cells,
        lineScores: slot.lineScores,
      });
    });
  });
  personRows.sort((a, b) => sign * (a.value - b.value) || String(a.name).localeCompare(String(b.name), 'ko'));

  const roomRows = rooms.map((room) => ({
    key: String(room.roomNo),
    room: room.roomNo,
    name: room.roomLabel,
    value: Number(room.total || 0),
  }));
  roomRows.sort((a, b) => sign * (a.value - b.value) || String(a.name).localeCompare(String(b.name), 'ko'));

  const teamRows = [];
  teamsByRoom.forEach((teamGroup) => {
    (Array.isArray(teamGroup) ? teamGroup : []).forEach((team) => {
      const members = Array.isArray(team?.members) ? team.members : [];
      const roomNo = Number(team?.roomIdx) + 1;
      const room = rooms.find((item) => Number(item.roomNo) === Number(roomNo));
      const value = members.reduce((sum, member) => {
        const pid = String(member?.id ?? '');
        const slot = room?.slots?.find((item) => String(item.participantId) === pid);
        return sum + (Number(slot?.total) || 0);
      }, 0);
      const teamName = String(team?.key || '').includes('-') ? String(team.key).split('-')[1] : 'A';
      teamRows.push({
        key: String(team?.key || `${roomNo}-${teamName}`),
        label: `${getRoomLabel(roomNo, roomNames)} ${teamName}팀`,
        value,
      });
    });
  });
  teamRows.sort((a, b) => sign * (a.value - b.value) || String(a.label).localeCompare(String(b.label), 'ko'));

  return {
    metric: 'bingo',
    selectedHoles,
    sharedBoardInRoom,
    personRows,
    roomRows,
    teamRows,
    rooms,
  };
}
