// /src/events/holeRankForce.js

import { buildTeamsByRoom } from './utils';

const HOLES_ALL = Array.from({ length: 18 }, (_, i) => i + 1);
const SLOTS_ALL = [1, 2, 3, 4];

const asNum = (v) => {
  if (v === '' || v == null) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export function normalizeSelectedHoles(value) {
  const arr = Array.isArray(value) ? value : [];
  const out = arr
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 18);
  const uniq = Array.from(new Set(out)).sort((a, b) => a - b);
  return uniq.length ? uniq : [...HOLES_ALL];
}

export function normalizeSelectedSlots(value) {
  const arr = Array.isArray(value) ? value : [];
  const out = arr
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 4);
  const uniq = Array.from(new Set(out)).sort((a, b) => a - b);
  return uniq.length ? uniq : [...SLOTS_ALL];
}

export function normalizeForcedRanks(value) {
  const src = value && typeof value === 'object' ? value : {};
  const out = {};
  Object.keys(src).forEach((holeKey) => {
    const hole = Number(holeKey);
    if (!Number.isInteger(hole) || hole < 1 || hole > 18) return;
    const row = src[holeKey] && typeof src[holeKey] === 'object' ? src[holeKey] : {};
    const nextRow = {};
    Object.keys(row).forEach((slotKey) => {
      const slot = Number(slotKey);
      const rank = Number(row[slotKey]);
      if (
        Number.isInteger(slot) && slot >= 1 && slot <= 4 &&
        Number.isInteger(rank) && rank >= 1 && rank <= 4
      ) {
        nextRow[String(slot)] = rank;
      }
    });
    if (Object.keys(nextRow).length) out[String(hole)] = nextRow;
  });
  return out;
}

export function defaultHoleRankForceParams() {
  return {
    selectedHoles: [...HOLES_ALL],
    selectedSlots: [...SLOTS_ALL],
    forcedRanks: {},
  };
}

function getRoomCountFromParticipants(participants = []) {
  const maxRoom = (Array.isArray(participants) ? participants : []).reduce((max, p) => {
    const room = Number(p?.room);
    return Number.isFinite(room) && room > max ? room : max;
  }, 0);
  return Math.max(0, maxRoom);
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
  if (slot !== '' && slot != null) arr[0] = slot;
  return arr;
}

function buildPerRoomParticipantData({
  eventDef,
  participants = [],
  inputsByEvent = {},
  roomNames = [],
  roomCount = 0,
}) {
  const params = eventDef?.params || {};
  const selectedHoles = normalizeSelectedHoles(params.selectedHoles);
  const selectedSlots = normalizeSelectedSlots(params.selectedSlots);
  const forcedRanks = normalizeForcedRanks(params.forcedRanks);

  const safeRoomCount = Number(roomCount) > 0 ? Number(roomCount) : getRoomCountFromParticipants(participants);
  const built = buildTeamsByRoom(participants, safeRoomCount || 0);
  const orderedByRoom = Array.isArray(built?.orderedByRoom) ? built.orderedByRoom : [];

  const rowsByRoom = orderedByRoom.map((slotArr, roomIdx) => {
    const roomNo = roomIdx + 1;
    const roomLabel = getRoomLabel(roomNo, roomNames);

    const slotRows = SLOTS_ALL.map((slotNo) => {
      const participant = slotArr?.[slotNo - 1] || null;
      const pid = participant?.id != null ? String(participant.id) : '';
      const holeValues = pid ? getInputValuesForParticipant(inputsByEvent, eventDef?.id, pid) : Array.from({ length: 18 }, () => '');
      return {
        slotNo,
        selected: selectedSlots.includes(slotNo),
        participant,
        participantId: pid,
        roomNo,
        roomLabel,
        holeValues,
        effectiveHoleScores: {},
        total: 0,
      };
    });

    selectedHoles.forEach((holeNo) => {
      const holeIdx = holeNo - 1;
      const candidates = slotRows
        .filter((row) => row.selected)
        .map((row) => ({
          slotNo: row.slotNo,
          value: asNum(row.holeValues?.[holeIdx]),
        }))
        .filter((row) => Number.isFinite(row.value))
        .sort((a, b) => a.value - b.value);

      slotRows.forEach((row) => {
        if (!row.selected) return;
        const own = asNum(row.holeValues?.[holeIdx]);
        const forced = Number(forcedRanks?.[String(holeNo)]?.[String(row.slotNo)]);
        let picked = own;
        if (Number.isInteger(forced) && forced >= 1 && forced <= candidates.length) {
          picked = candidates[forced - 1]?.value;
        }
        row.effectiveHoleScores[holeNo] = Number.isFinite(picked) ? picked : NaN;
      });
    });

    slotRows.forEach((row) => {
      if (!row.selected) {
        row.total = NaN;
        return;
      }
      row.total = selectedHoles.reduce((sum, holeNo) => {
        const n = row.effectiveHoleScores?.[holeNo];
        return Number.isFinite(n) ? sum + n : sum;
      }, 0);
    });

    return {
      roomNo,
      roomLabel,
      slots: slotRows,
    };
  });

  return {
    selectedHoles,
    selectedSlots,
    forcedRanks,
    rooms: rowsByRoom,
    teamsByRoom: Array.isArray(built?.teamsByRoom) ? built.teamsByRoom : [],
  };
}

export function computeHoleRankForce(eventDef, participants = [], inputsByEvent = {}, options = {}) {
  const roomNames = Array.isArray(options?.roomNames) ? options.roomNames : [];
  const roomCount = Number(options?.roomCount || 0);
  const rankOrder = eventDef?.rankOrder === 'desc' ? 'desc' : 'asc';
  const data = buildPerRoomParticipantData({ eventDef, participants, inputsByEvent, roomNames, roomCount });

  const personRows = [];
  data.rooms.forEach((room) => {
    room.slots.forEach((slot) => {
      if (!slot.selected) return;
      if (!slot.participant || slot.participant.id == null) return;
      const name = String(slot.participant?.nickname || '');
      personRows.push({
        key: `${room.roomNo}-${slot.slotNo}-${slot.participantId}`,
        id: slot.participantId,
        name,
        room: room.roomNo,
        roomLabel: room.roomLabel,
        slotNo: slot.slotNo,
        value: Number.isFinite(slot.total) ? slot.total : 0,
        holes: { ...(slot.effectiveHoleScores || {}) },
      });
    });
  });
  personRows.sort((a, b) => rankOrder === 'desc' ? b.value - a.value : a.value - b.value);

  const roomRows = data.rooms.map((room) => {
    const total = room.slots.reduce((sum, slot) => (
      slot.selected && Number.isFinite(slot.total) ? sum + slot.total : sum
    ), 0);
    return {
      key: String(room.roomNo),
      room: room.roomNo,
      name: room.roomLabel,
      value: total,
    };
  });
  roomRows.sort((a, b) => rankOrder === 'desc' ? b.value - a.value : a.value - b.value);

  const teamRows = [];
  const teamsByRoom = Array.isArray(data.teamsByRoom) ? data.teamsByRoom : [];
  teamsByRoom.forEach((teamGroup) => {
    (Array.isArray(teamGroup) ? teamGroup : []).forEach((team) => {
      const members = Array.isArray(team?.members) ? team.members : [];
      const roomNo = Number(team?.roomIdx) + 1;
      const room = data.rooms.find((r) => r.roomNo === roomNo);
      const teamName = String(team?.key || '').includes('-') ? String(team.key).split('-')[1] : 'A';
      const value = members.reduce((sum, member) => {
        const pid = String(member?.id ?? '');
        const slot = room?.slots?.find((s) => s.participantId === pid);
        return slot && slot.selected && Number.isFinite(slot.total) ? sum + slot.total : sum;
      }, 0);
      teamRows.push({
        key: String(team?.key || `${roomNo}-${teamName}`),
        label: `${getRoomLabel(roomNo, roomNames)} ${teamName}팀`,
        value,
      });
    });
  });
  teamRows.sort((a, b) => rankOrder === 'desc' ? b.value - a.value : a.value - b.value);

  return {
    metric: 'score',
    selectedHoles: data.selectedHoles,
    selectedSlots: data.selectedSlots,
    personRows,
    roomRows,
    teamRows,
    rooms: data.rooms,
  };
}
