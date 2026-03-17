// /src/events/groupRoomHoleBattle.js
// 그룹/방 홀별 지목전 계산/정규화 유틸

import { normalizeSelectedHoles } from './holeRankForce';

export function defaultGroupRoomHoleBattleParams() {
  return {
    selectedHoles: Array.from({ length: 18 }, (_, i) => i + 1),
    mode: 'group',
    groups: [
      { name: '그룹1', memberIds: [] },
      { name: '그룹2', memberIds: [] },
    ],
    pickCount: 1,
    maxPerParticipant: 4,
    selectionLocked: false,
  };
}

export function normalizeGroupRoomMode(mode) {
  return mode === 'room' ? 'room' : 'group';
}

export function getGroupRoomDisplayName(name, idx, prefix = '그룹') {
  const raw = String(name ?? '').trim();
  return raw || `${prefix}${idx + 1}`;
}

export function normalizeGroupRows(groups) {
  const src = Array.isArray(groups) ? groups : [];
  return src.map((g, idx) => ({
    key: String(g?.key || `group-${idx + 1}`),
    // 빈 문자열도 유지해서 입력 중 삭제 가능하도록 함
    name: (typeof g?.name === 'string') ? g.name : `그룹${idx + 1}`,
    memberIds: Array.isArray(g?.memberIds)
      ? Array.from(new Set(g.memberIds.map((id) => String(id || '').trim()).filter(Boolean)))
      : [],
  }));
}

export function normalizeGroupRoomHoleBattleParams(params, opt = {}) {
  const base = defaultGroupRoomHoleBattleParams();
  const src = params && typeof params === 'object' ? params : {};
  const mode = normalizeGroupRoomMode(src.mode || base.mode);
  const selectedHoles = normalizeSelectedHoles(src.selectedHoles || base.selectedHoles);
  const pickCount = Math.max(1, Math.min(4, Number(src.pickCount || base.pickCount)));
  const maxPerParticipant = Math.max(1, Math.min(8, Number(src.maxPerParticipant || base.maxPerParticipant)));
  const roomCount = Math.max(0, Number(opt?.roomCount || 0));
  const roomNames = Array.isArray(opt?.roomNames) ? opt.roomNames : [];
  const participants = Array.isArray(opt?.participants) ? opt.participants : [];

  const groups = normalizeGroupRows(src.groups && src.groups.length ? src.groups : base.groups)
    .filter((g) => mode !== 'group' || g.memberIds.length > 0 || typeof g.name === 'string');

  return {
    selectedHoles: selectedHoles.length ? selectedHoles : base.selectedHoles,
    mode,
    groups: mode === 'group' ? groups : [],
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

export function getGroupRoomHoleBattleRows(eventDef, participants = [], opt = {}) {
  const cfg = normalizeGroupRoomHoleBattleParams(eventDef?.params, {
    participants,
    roomNames: opt?.roomNames,
    roomCount: opt?.roomCount,
  });
  const byId = new Map((Array.isArray(participants) ? participants : []).map((p) => [String(p?.id), p]));

  if (cfg.mode === 'room') {
    const maxRoom = cfg.roomCount || Math.max(0, ...participants.map((p) => Number(p?.room || 0)).filter((n) => Number.isFinite(n)));
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

  return cfg.groups.map((group, idx) => ({
    key: String(group?.key || `group-${idx + 1}`),
    type: 'group',
    name: group?.name ?? '',
    displayName: getGroupRoomDisplayName(group?.name, idx, '그룹'),
    memberIds: Array.isArray(group?.memberIds) ? group.memberIds.map(String) : [],
    members: (Array.isArray(group?.memberIds) ? group.memberIds : []).map((id) => byId.get(String(id))).filter(Boolean),
  }));
}

export function getGroupRoomBattleScoreParticipants(eventDef, participants = [], opt = {}) {
  const rows = getGroupRoomHoleBattleRows(eventDef, participants, opt);
  const mode = normalizeGroupRoomMode(eventDef?.params?.mode);
  const currentRoomNo = Number(opt?.currentRoomNo || 0);
  if (mode === 'room' && currentRoomNo >= 1) {
    const row = rows.find((item) => Number(item?.roomNo) === currentRoomNo);
    return Array.isArray(row?.members) ? row.members : [];
  }
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

export function computeGroupRoomHoleBattle(eventDef, participants = [], inputsByEvent = {}, opt = {}) {
  const cfg = normalizeGroupRoomHoleBattleParams(eventDef?.params, {
    participants,
    roomNames: opt?.roomNames,
    roomCount: opt?.roomCount,
  });
  const sign = eventDef?.rankOrder === 'desc' ? -1 : 1;
  const rows = getGroupRoomHoleBattleRows(eventDef, participants, opt);
  const shared = getBattleSharedInputs(inputsByEvent);
  const byId = new Map((Array.isArray(participants) ? participants : []).map((p) => [String(p?.id), p]));

  const scoreParticipants = getGroupRoomBattleScoreParticipants(eventDef, participants, {
    roomNames: opt?.roomNames,
    roomCount: opt?.roomCount,
    currentRoomNo: opt?.currentRoomNo,
  });

  const outRows = rows.map((row) => {
    const usage = countParticipantUsageForRow(shared, row.key);
    const holes = cfg.selectedHoles.map((holeNo) => {
      const ids = getBattleCellIds(shared, row.key, holeNo, row.memberIds);
      const members = ids.map((id) => byId.get(String(id))).filter(Boolean);
      const value = members.reduce((sum, p) => {
        const n = getBattleScoreValue(inputsByEvent, p?.id, holeNo);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
      return {
        holeNo,
        ids,
        members,
        value,
        label: members.map((p) => String(p?.nickname || '')).join(' / '),
      };
    });
    const value = holes.reduce((sum, hole) => sum + (Number(hole.value) || 0), 0);
    return {
      key: row.key,
      name: row.displayName || row.name,
      rawName: row.name,
      type: row.type,
      roomNo: row.roomNo ?? null,
      members: row.members,
      memberIds: row.memberIds,
      value,
      holes,
      usage,
      complete: isBattleRowSelectionComplete(row, shared, eventDef),
    };
  });

  outRows.sort((a, b) => {
    return sign * (a.value - b.value)
      || String(a.name || '').localeCompare(String(b.name || ''), 'ko');
  });

  const participantRows = scoreParticipants.map((p) => ({
    id: String(p?.id || ''),
    name: String(p?.nickname || ''),
    roomNo: Number(p?.room || 0) || 0,
    values: cfg.selectedHoles.map((holeNo) => getBattleScoreValue(inputsByEvent, p?.id, holeNo)),
    complete: isBattleParticipantScoreComplete(inputsByEvent, p?.id, cfg.selectedHoles),
  }));

  return {
    kind: cfg.mode === 'room' ? 'room' : 'group',
    metric: 'score',
    rows: outRows,
    config: cfg,
    shared,
    participantRows,
    scoreParticipants,
  };
}
