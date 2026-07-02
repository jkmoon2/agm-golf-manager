// /src/utils/assignmentCompat.js

const hasAssignmentValue = (value) => value !== undefined && value !== null && value !== '';

const toNumberIfFinite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
};

export function getAssignmentRoom(participant) {
  const raw = hasAssignmentValue(participant?.room)
    ? participant.room
    : (hasAssignmentValue(participant?.roomNumber) ? participant.roomNumber : null);
  if (!hasAssignmentValue(raw)) return null;
  return toNumberIfFinite(raw);
}

export function getAssignmentPartnerId(participant) {
  const raw = hasAssignmentValue(participant?.partner)
    ? participant.partner
    : (hasAssignmentValue(participant?.teammateId)
        ? participant.teammateId
        : (hasAssignmentValue(participant?.teammate) ? participant.teammate : null));
  if (!hasAssignmentValue(raw)) return null;
  return String(raw).trim();
}

export function withAssignmentRoom(participant, room) {
  const value = hasAssignmentValue(room) ? toNumberIfFinite(room) : null;
  return { ...(participant || {}), room: value, roomNumber: value };
}

export function withAssignmentPartner(participant, partnerId) {
  const value = hasAssignmentValue(partnerId) ? String(partnerId).trim() : null;
  return { ...(participant || {}), partner: value, teammateId: value, teammate: value };
}

export function normalizeAssignmentParticipant(participant) {
  const room = getAssignmentRoom(participant);
  const partner = getAssignmentPartnerId(participant);
  return {
    ...(participant || {}),
    room,
    roomNumber: room,
    partner,
    teammateId: partner,
    teammate: partner,
  };
}

export function buildAssignmentRoomTable(participants = []) {
  const table = {};
  (Array.isArray(participants) ? participants : []).forEach((participant) => {
    const room = getAssignmentRoom(participant);
    if (!hasAssignmentValue(room)) return;
    const key = String(room);
    if (!table[key]) table[key] = [];
    table[key].push(participant?.id);
  });
  return table;
}
