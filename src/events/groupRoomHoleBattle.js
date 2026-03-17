// /src/events/groupRoomHoleBattle.js
// 그룹/방/개인 홀별 지목전 계산/정규화 유틸

import { normalizeSelectedHoles } from './holeRankForce';

export function defaultGroupRoomHoleBattleParams() {
  return {
    selectedHoles: Array.from({ length: 18 }, (_, i) => i + 1),
    mode: 'group',
    groups: [
      { name: '그룹1', memberIds: [] },
      { name: '그룹2', memberIds: [] },
    ],
    personIds: [],
    pickCount: null,
    maxPerParticipant: null,
    selectionLocked: false,
  };
}

export function normalizeGroupRoomMode(mode) {
  return mode === 'room' || mode === 'person' ? mode : 'group';
}

function normalizeOptionalInt(value, min, max) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < min || i > max) return null;
  return i;
}

function normalizeIdList(value) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((id) => String(id || '').trim()).filter(Boolean)))
    : [];
}

export function getGroupRoomDisplayName(name, idx, prefix = '그룹') {
  const raw = String(name ?? '').trim();
  return raw || `${prefix}${idx + 1}`;
}

export function normalizeGroupRows(groups) {
  const src = Array.isArray(groups) ? groups : [];
  return src.map((g, idx) => ({
    key: String(g?.key || `group-${idx + 1}`),
    name: (typeof g?.name === 'string') ? g.name : `그룹${idx + 1}`,
    memberIds: normalizeIdList(g?.memberIds),
  }));
}

export function normalizeGroupRoomHoleBattleParams(params, opt = {}) {
  const base = defaultGroupRoomHoleBattleParams();
  const src = params && typeof params === 'object' ? params : {};
  const mode = normalizeGroupRoomMode(src.mode || base.mode);
  const selectedHoles = normalizeSelectedHoles(src.selectedHoles || base.selectedHoles);
  const pickCount = normalizeOptionalInt(src.pickCount, 1, 4);
  const maxPerParticipant = normalizeOptionalInt(src.maxPerParticipant, 1, 8);
  const roomCount = Math.max(0, Number(opt?.roomCount || 0));
  const roomNames = Array.isArray(opt?.roomNames) ? opt.roomNames : [];
  const participants = Array.isArray(opt?.participants) ? opt.participants : [];

  const groupsRaw = normalizeGroupRows(src.groups && src.groups.length ? src.groups : base.groups);
  const groups = groupsRaw.filter((g) => mode !== 'group' || g.memberIds.length > 0 || typeof g.name === 'string');
  const personIds = normalizeIdList(src.personIds);

  return {
    selectedHoles: selectedHoles.length ? selectedHoles : base.selectedHoles,
    mode,
    groups: mode === 'group' ? (groups.length ? groups : normalizeGroupRows(base.groups)) : normalizeGroupRows(groupsRaw),
    personIds,
    pickCount,
    maxPerParticipant,
    selectionLocked: !!src.selectionLocked,
    roomCount,
    roomNames,
    participants,
  };
}

export function getRoomLabel(roomNo, roomNames = []) {
  const idx = Number(roomNo) - 1;
  if (idx >= 0 && Array.isArray(roomNames) && roomNames[idx] && String(roomNames[idx]).trim()) {
    return String(roomNames[idx]).trim();
  }
  return Number.isFinite(Number(roomNo)) && Number(roomNo) >= 1 ? `${roomNo}번방` : '-';
}

function getParticipantsById(participants = []) {
  return new Map((Array.isArray(participants) ? participants : []).map((p) => [String(p?.id), p]));
}

function getGroupRows(cfg, participants = []) {
  const byId = getParticipantsById(participants);
  return (Array.isArray(cfg.groups) ? cfg.groups : []).map((group, idx) => ({
    key: String(group?.key || `group-${idx + 1}`),
    type: 'group',
    name: group?.name ?? '',
    displayName: getGroupRoomDisplayName(group?.name, idx, '그룹'),
    memberIds: Array.isArray(group?.memberIds) ? group.memberIds.map(String) : [],
    members: (Array.isArray(group?.memberIds) ? group.memberIds : []).map((id) => byId.get(String(id))).filter(Boolean),
  }));
}

function getRoomRows(cfg, participants = []) {
  const maxRoom = cfg.roomCount || Math.max(0, ...(Array.isArray(participants) ? participants : []).map((p) => Number(p?.room || 0)).filter((n) => Number.isFinite(n)));
  return Array.from({ length: maxRoom }, (_, idx) => {
    const roomNo = idx + 1;
    const members = (Array.isArray(participants) ? participants : []).filter((p) => Number(p?.room) === roomNo);
    return {
      key: `room-${roomNo}`,
      type: 'room',
      roomNo,
      name: getRoomLabel(roomNo, cfg.roomNames),
      displayName: getRoomLabel(roomNo, cfg.roomNames),
      memberIds: members.map((p) => String(p?.id ?? '')).filter(Boolean),
      members,
    };
  }).filter((row) => row.memberIds.length > 0);
}

function getPersonPool(cfg, participants = []) {
  const byId = getParticipantsById(participants);
  return (Array.isArray(cfg.personIds) ? cfg.personIds : []).map((id) => byId.get(String(id))).filter(Boolean);
}

function getPersonRows(cfg, participants = []) {
  return getPersonPool(cfg, participants).map((p) => ({
    key: `person-${String(p?.id || '')}`,
    type: 'person',
    personId: String(p?.id || ''),
    name: String(p?.nickname || ''),
    displayName: String(p?.nickname || ''),
    memberIds: [String(p?.id || '')],
    members: [p],
  }));
}

export function getGroupRoomHoleBattleRows(eventDef, participants = [], opt = {}) {
  const cfg = normalizeGroupRoomHoleBattleParams(eventDef?.params, {
    participants,
    roomNames: opt?.roomNames,
    roomCount: opt?.roomCount,
  });

  if (cfg.mode === 'room') return getRoomRows(cfg, participants);
  if (cfg.mode === 'person') return getPersonRows(cfg, participants);
  return getGroupRows(cfg, participants);
}

export function getGroupRoomHoleBattleInputRows(eventDef, participants = [], opt = {}) {
  const cfg = normalizeGroupRoomHoleBattleParams(eventDef?.params, {
    participants,
    roomNames: opt?.roomNames,
    roomCount: opt?.roomCount,
  });
  const currentRoomNo = Number(opt?.currentRoomNo || 0);

  if (cfg.mode === 'room') {
    const rows = getRoomRows(cfg, participants);
    if (currentRoomNo >= 1) {
      const row = rows.find((item) => Number(item?.roomNo) === currentRoomNo);
      return row ? [row] : [];
    }
    return rows;
  }

  if (cfg.mode === 'person') {
    const roomMembers = (Array.isArray(participants) ? participants : []).filter((p) => Number(p?.room) === currentRoomNo);
    const pool = getPersonPool(cfg, participants);
    const poolIds = pool.map((p) => String(p?.id || '')).filter(Boolean);
    return roomMembers.map((member) => ({
      key: `selector-${String(member?.id || '')}`,
      type: 'selector',
      selectorId: String(member?.id || ''),
      name: String(member?.nickname || ''),
      displayName: String(member?.nickname || ''),
      memberIds: poolIds,
      members: pool,
    }));
  }

  const rows = getGroupRows(cfg, participants);
  if (currentRoomNo < 1) return rows;
  const roomMemberIds = new Set(
    (Array.isArray(participants) ? participants : [])
      .filter((p) => Number(p?.room) === currentRoomNo)
      .map((p) => String(p?.id || ''))
      .filter(Boolean)
  );
  const filtered = rows.filter((row) => row.memberIds.some((id) => roomMemberIds.has(String(id))));
  return filtered;
}

export function getGroupRoomBattleScoreParticipants(eventDef, participants = [], opt = {}) {
  const cfg = normalizeGroupRoomHoleBattleParams(eventDef?.params, {
    participants,
    roomNames: opt?.roomNames,
    roomCount: opt?.roomCount,
  });
  const currentRoomNo = Number(opt?.currentRoomNo || 0);

  if (cfg.mode === 'person') {
    return getPersonPool(cfg, participants);
  }

  if (cfg.mode === 'room') {
    if (currentRoomNo >= 1) {
      const row = getRoomRows(cfg, participants).find((item) => Number(item?.roomNo) === currentRoomNo);
      return Array.isArray(row?.members) ? row.members : [];
    }
    return getRoomRows(cfg, participants).flatMap((row) => Array.isArray(row?.members) ? row.members : []);
  }

  const rows = currentRoomNo >= 1
    ? getGroupRoomHoleBattleInputRows(eventDef, participants, opt)
    : getGroupRows(cfg, participants);
  const seen = new Set();
  const out = [];
  rows.forEach((row) => {
    (Array.isArray(row?.members) ? row.members : []).forEach((member) => {
      const id = String(member?.id || '');
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push(member);
    });
  });
  return out;
}

export function normalizeBattleCellIds(value, allowedIds = []) {
  const allow = new Set((Array.isArray(allowedIds) ? allowedIds : []).map((id) => String(id)));
  const src = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  src.forEach((id) => {
    const s = String(id || '').trim();
    if (!s || seen.has(s)) return;
    if (allow.size && !allow.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

export function getBattleSharedInputs(inputsByEvent) {
  const slot = inputsByEvent && typeof inputsByEvent === 'object' ? inputsByEvent : {};
  const shared = slot?.shared && typeof slot.shared === 'object' ? slot.shared : {};
  const rows = shared?.rows && typeof shared.rows === 'object' ? shared.rows : {};
  return { ...shared, rows };
}

export function getBattleCellIds(shared, rowKey, holeNo, allowedIds = []) {
  const safe = getBattleSharedInputs({ shared });
  return normalizeBattleCellIds(safe?.rows?.[String(rowKey)]?.holes?.[String(holeNo)], allowedIds);
}

export function countParticipantUsageForRow(shared, rowKey) {
  const safe = getBattleSharedInputs({ shared });
  const holes = safe?.rows?.[String(rowKey)]?.holes || {};
  const out = {};
  Object.values(holes).forEach((ids) => {
    normalizeBattleCellIds(ids).forEach((id) => {
      out[id] = Number(out[id] || 0) + 1;
    });
  });
  return out;
}

export function getBattleScoreValue(inputsByEvent = {}, pid, holeNo) {
  const raw = inputsByEvent?.person?.[String(pid)]?.values?.[Number(holeNo) - 1];
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function isBattleRowSelectionComplete(row, shared, eventDef) {
  const cfg = normalizeGroupRoomHoleBattleParams(eventDef?.params);
  const requiredCount = Math.max(1, Number(cfg.pickCount || 1));
  return cfg.selectedHoles.every((holeNo) => {
    const ids = getBattleCellIds(shared, row.key, holeNo, row.memberIds);
    return ids.length === requiredCount;
  });
}

export function isBattleParticipantScoreComplete(inputsByEvent = {}, participantId, selectedHoles = []) {
  return (Array.isArray(selectedHoles) ? selectedHoles : []).every((holeNo) => {
    const n = getBattleScoreValue(inputsByEvent, participantId, holeNo);
    return Number.isFinite(n);
  });
}

function buildInputRowDetail(row, shared, cfg, byId, inputsByEvent) {
  const holes = cfg.selectedHoles.map((holeNo) => {
    const ids = getBattleCellIds(shared, row.key, holeNo, row.memberIds);
    const members = ids.map((id) => byId.get(String(id))).filter(Boolean);
    const value = members.reduce((sum, member) => {
      const n = getBattleScoreValue(inputsByEvent, member?.id, holeNo);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
    return {
      holeNo,
      ids,
      members,
      value,
      label: members.map((member) => String(member?.nickname || '')).join(' / '),
    };
  });
  const value = holes.reduce((sum, hole) => sum + (Number(hole.value) || 0), 0);
  return {
    ...row,
    value,
    holes,
    usage: countParticipantUsageForRow(shared, row.key),
    complete: isBattleRowSelectionComplete(row, shared, { params: cfg }),
  };
}

export function computeGroupRoomHoleBattle(eventDef, participants = [], inputsByEvent = {}, opt = {}) {
  const cfg = normalizeGroupRoomHoleBattleParams(eventDef?.params, {
    participants,
    roomNames: opt?.roomNames,
    roomCount: opt?.roomCount,
  });
  const sign = eventDef?.rankOrder === 'desc' ? -1 : 1;
  const shared = getBattleSharedInputs(inputsByEvent);
  const byId = getParticipantsById(participants);

  if (cfg.mode === 'person') {
    const inputRowsBase = (Array.isArray(participants) ? participants : []).map((participant) => ({
      key: `selector-${String(participant?.id || '')}`,
      type: 'selector',
      selectorId: String(participant?.id || ''),
      name: String(participant?.nickname || ''),
      displayName: String(participant?.nickname || ''),
      memberIds: Array.isArray(cfg.personIds) ? cfg.personIds.map(String) : [],
      members: getPersonPool(cfg, participants),
    }));
    const inputRows = inputRowsBase.map((row) => buildInputRowDetail(row, shared, cfg, byId, inputsByEvent));
    const scoreParticipants = getPersonPool(cfg, participants);
    const participantRows = scoreParticipants.map((participant) => ({
      id: String(participant?.id || ''),
      name: String(participant?.nickname || ''),
      roomNo: Number(participant?.room || 0) || 0,
      values: cfg.selectedHoles.map((holeNo) => getBattleScoreValue(inputsByEvent, participant?.id, holeNo)),
      complete: isBattleParticipantScoreComplete(inputsByEvent, participant?.id, cfg.selectedHoles),
    }));

    const rows = scoreParticipants.map((participant) => {
      const pid = String(participant?.id || '');
      const holes = cfg.selectedHoles.map((holeNo) => {
        const selectors = inputRows.filter((row) => getBattleCellIds(shared, row.key, holeNo, cfg.personIds).includes(pid));
        const baseScore = getBattleScoreValue(inputsByEvent, pid, holeNo);
        const picks = selectors.length;
        const value = Number.isFinite(baseScore) ? baseScore * picks : 0;
        return {
          holeNo,
          ids: picks ? Array.from({ length: picks }, () => pid) : [],
          members: Number.isFinite(baseScore) ? [participant] : [],
          selectors,
          picks,
          value,
          label: selectors.map((row) => String(row?.name || '')).join(' / '),
        };
      });
      const value = holes.reduce((sum, hole) => sum + (Number(hole.value) || 0), 0);
      return {
        key: `person-${pid}`,
        type: 'person',
        personId: pid,
        name: String(participant?.nickname || ''),
        rawName: String(participant?.nickname || ''),
        members: [participant],
        memberIds: [pid],
        value,
        holes,
        usage: {},
        complete: isBattleParticipantScoreComplete(inputsByEvent, pid, cfg.selectedHoles),
      };
    });

    rows.sort((a, b) => sign * (a.value - b.value) || String(a.name || '').localeCompare(String(b.name || ''), 'ko'));

    return {
      kind: 'person',
      metric: 'score',
      rows,
      inputRows,
      config: cfg,
      shared,
      participantRows,
      scoreParticipants,
    };
  }

  const rowsBase = getGroupRoomHoleBattleRows(eventDef, participants, opt);
  const scoreParticipants = getGroupRoomBattleScoreParticipants(eventDef, participants, {
    roomNames: opt?.roomNames,
    roomCount: opt?.roomCount,
  });

  const rows = rowsBase.map((row) => buildInputRowDetail(row, shared, cfg, byId, inputsByEvent));
  rows.sort((a, b) => sign * (a.value - b.value) || String(a.name || '').localeCompare(String(b.name || ''), 'ko'));

  const participantRows = scoreParticipants.map((participant) => ({
    id: String(participant?.id || ''),
    name: String(participant?.nickname || ''),
    roomNo: Number(participant?.room || 0) || 0,
    values: cfg.selectedHoles.map((holeNo) => getBattleScoreValue(inputsByEvent, participant?.id, holeNo)),
    complete: isBattleParticipantScoreComplete(inputsByEvent, participant?.id, cfg.selectedHoles),
  }));

  return {
    kind: cfg.mode === 'room' ? 'room' : 'group',
    metric: 'score',
    rows,
    inputRows: rows,
    config: cfg,
    shared,
    participantRows,
    scoreParticipants,
  };
}
