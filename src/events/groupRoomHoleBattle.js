// /src/events/groupRoomHoleBattle.js
// 그룹/방/개인 홀별 지목전 계산/정규화 유틸

import { normalizeSelectedHoles } from './holeRankForce';

const ROOM_TEAM_KEYS = ['A', 'B'];

export function defaultGroupRoomHoleBattleParams() {
  return {
    selectedHoles: Array.from({ length: 18 }, (_, i) => i + 1),
    mode: 'group',
    battleType: 'stroke',
    groups: [
      { name: '그룹1', memberIds: [], leaderIds: [] },
      { name: '그룹2', memberIds: [], leaderIds: [] },
    ],
    roomTeams: {
      roomAssignments: {},
      splitMembers: {},
    },
    personIds: [],
    pickCount: null,
    maxPerParticipant: null,
    selectionLocked: false,
  };
}

export function normalizeGroupRoomMode(mode) {
  return mode === 'room' || mode === 'person' ? mode : 'group';
}

export function normalizeBattleType(type) {
  return type === 'match' || type === 'fourball' ? type : 'stroke';
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
  return src.map((g, idx) => {
    const memberIds = normalizeIdList(g?.memberIds);
    const leaderIds = normalizeIdList(g?.leaderIds).filter((id) => memberIds.includes(id));
    return {
      key: String(g?.key || `group-${idx + 1}`),
      name: (typeof g?.name === 'string') ? g.name : `그룹${idx + 1}`,
      memberIds,
      leaderIds,
    };
  });
}

function normalizeRoomTeamConfig(value, participants = [], roomCount = 0) {
  const src = value && typeof value === 'object' ? value : {};
  const roomAssignments = {};
  const splitMembers = {};
  const maxRoom = Math.max(
    Number(roomCount || 0),
    ...((Array.isArray(participants) ? participants : []).map((p) => Number(p?.room || 0)).filter((n) => Number.isFinite(n)))
  );

  for (let roomNo = 1; roomNo <= maxRoom; roomNo += 1) {
    const key = String(roomNo);
    const raw = String(src?.roomAssignments?.[key] || '').trim().toUpperCase();
    roomAssignments[key] = raw === 'A' || raw === 'B' || raw === 'SPLIT' ? raw : '';
  }

  (Array.isArray(participants) ? participants : []).forEach((p, idx) => {
    const pid = String(p?.id || '').trim();
    if (!pid) return;
    const roomNo = Number(p?.room || 0);
    const roomKey = String(roomNo || '');
    const roomMode = roomAssignments[roomKey];
    const raw = String(src?.splitMembers?.[pid] || '').trim().toUpperCase();
    if (raw === 'A' || raw === 'B') {
      splitMembers[pid] = raw;
      return;
    }
    if (roomMode === 'SPLIT') {
      splitMembers[pid] = idx % 2 === 0 ? 'A' : 'B';
    }
  });

  return { roomAssignments, splitMembers };
}

export function normalizeGroupRoomHoleBattleParams(params, opt = {}) {
  const base = defaultGroupRoomHoleBattleParams();
  const src = params && typeof params === 'object' ? params : {};
  const mode = normalizeGroupRoomMode(src.mode || base.mode);
  const battleType = normalizeBattleType(src.battleType || base.battleType);
  const selectedHoles = normalizeSelectedHoles(src.selectedHoles || base.selectedHoles);
  const pickCount = normalizeOptionalInt(src.pickCount, 1, 4);
  const maxPerParticipant = normalizeOptionalInt(src.maxPerParticipant, 1, 8);
  const roomCount = Math.max(0, Number(opt?.roomCount || 0));
  const roomNames = Array.isArray(opt?.roomNames) ? opt.roomNames : [];
  const participants = Array.isArray(opt?.participants) ? opt.participants : [];

  const groupsRaw = normalizeGroupRows(src.groups && src.groups.length ? src.groups : base.groups);
  const groups = groupsRaw.filter((g) => mode !== 'group' || g.memberIds.length > 0 || typeof g.name === 'string');
  const personIds = normalizeIdList(src.personIds);
  const roomTeams = normalizeRoomTeamConfig(src.roomTeams, participants, roomCount);

  return {
    selectedHoles: selectedHoles.length ? selectedHoles : base.selectedHoles,
    mode,
    battleType,
    groups: mode === 'group' ? (groups.length ? groups : normalizeGroupRows(base.groups)) : normalizeGroupRows(groupsRaw),
    roomTeams,
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
    leaderIds: Array.isArray(group?.leaderIds) ? group.leaderIds.map(String) : [],
    members: (Array.isArray(group?.memberIds) ? group.memberIds : []).map((id) => byId.get(String(id))).filter(Boolean),
    leaders: (Array.isArray(group?.leaderIds) ? group.leaderIds : []).map((id) => byId.get(String(id))).filter(Boolean),
  }));
}

function getTeamName(teamKey) {
  return teamKey === 'B' ? 'B팀' : 'A팀';
}

function getRoomModeParticipantsMap(cfg, participants = []) {
  const out = { A: [], B: [] };
  const roomAssignments = cfg?.roomTeams?.roomAssignments || {};
  const splitMembers = cfg?.roomTeams?.splitMembers || {};

  (Array.isArray(participants) ? participants : []).forEach((member, idx) => {
    const roomNo = Number(member?.room || 0);
    const roomKey = String(roomNo || '');
    const mode = String(roomAssignments[roomKey] || '').toUpperCase();
    if (mode === 'A' || mode === 'B') {
      out[mode].push(member);
      return;
    }
    if (mode === 'SPLIT') {
      const pid = String(member?.id || '');
      const team = String(splitMembers[pid] || (idx % 2 === 0 ? 'A' : 'B')).toUpperCase();
      out[team === 'B' ? 'B' : 'A'].push(member);
    }
  });

  return out;
}

function getRoomRows(cfg, participants = []) {
  const teams = getRoomModeParticipantsMap(cfg, participants);
  return ROOM_TEAM_KEYS.map((teamKey) => {
    const members = teams[teamKey] || [];
    return {
      key: `room-team-${teamKey}`,
      type: 'room-team',
      teamKey,
      roomNo: 0,
      name: getTeamName(teamKey),
      displayName: getTeamName(teamKey),
      memberIds: members.map((p) => String(p?.id || '')).filter(Boolean),
      members,
      roomNos: Array.from(new Set(members.map((p) => Number(p?.room || 0)).filter((n) => Number.isFinite(n) && n >= 1))),
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

function rowContainsParticipant(row, participantId = '', nickname = '') {
  const pid = String(participantId || '').trim();
  const loweredName = String(nickname || '').trim().toLowerCase();
  if (pid && Array.isArray(row?.memberIds) && row.memberIds.map(String).includes(pid)) return true;
  if (loweredName) {
    return (Array.isArray(row?.members) ? row.members : []).some((member) => String(member?.nickname || '').trim().toLowerCase() === loweredName);
  }
  return false;
}

function getViewerRows(rows = [], participantId = '', nickname = '') {
  const own = (Array.isArray(rows) ? rows : []).filter((row) => rowContainsParticipant(row, participantId, nickname));
  return own.length ? own : (Array.isArray(rows) ? rows : []);
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
  const currentParticipantId = String(opt?.currentParticipantId || '').trim();
  const currentParticipantNickname = String(opt?.currentParticipantNickname || '').trim().toLowerCase();

  if (cfg.mode === 'room') {
    return getRoomRows(cfg, participants);
  }

  if (cfg.mode === 'person') {
    const sourceMembers = currentRoomNo >= 1
      ? (Array.isArray(participants) ? participants : []).filter((p) => Number(p?.room) === currentRoomNo)
      : (Array.isArray(participants) ? participants : []);
    const pool = getPersonPool(cfg, participants);
    const poolIds = pool.map((p) => String(p?.id || '')).filter(Boolean);
    return sourceMembers.map((member) => ({
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
  if (currentParticipantId || currentParticipantNickname) {
    return getViewerRows(rows, currentParticipantId, currentParticipantNickname);
  }
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
  const safeParticipants = Array.isArray(participants) ? participants : [];
  const currentRoomNo = Number(opt?.currentRoomNo || 0);
  const currentParticipantId = String(opt?.currentParticipantId || '').trim();
  const currentParticipantNickname = String(opt?.currentParticipantNickname || '').trim().toLowerCase();
  const cfg = normalizeGroupRoomHoleBattleParams(eventDef?.params, {
    participants: safeParticipants,
    roomNames: opt?.roomNames,
    roomCount: opt?.roomCount,
  });

  if (cfg.mode === 'room') {
    const rows = getRoomRows(cfg, safeParticipants);
    const viewerRows = getViewerRows(rows, currentParticipantId, currentParticipantNickname);
    if (viewerRows.length === 1 && (currentParticipantId || currentParticipantNickname || currentRoomNo >= 1)) {
      return viewerRows[0].members || [];
    }
    return safeParticipants;
  }

  if (cfg.mode === 'group') {
    const rows = getGroupRows(cfg, safeParticipants);
    const viewerRows = getViewerRows(rows, currentParticipantId, currentParticipantNickname);
    if (viewerRows.length === 1 && (currentParticipantId || currentParticipantNickname)) {
      return viewerRows[0].members || [];
    }
    return safeParticipants;
  }

  if (currentRoomNo >= 1) {
    return safeParticipants.filter((p) => Number(p?.room) === currentRoomNo);
  }
  return safeParticipants;
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
  if (raw === '' || raw == null) return null;
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

function formatMatchTotal(net) {
  const n = Number(net || 0);
  if (!Number.isFinite(n) || n === 0) return 'AS';
  return n > 0 ? `${Math.abs(n)}UP` : `${Math.abs(n)}DOWN`;
}

function compareMatchValues(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { text: '', score: null, color: '' };
  if (a < b) return { text: 'UP', score: 1, color: 'red' };
  if (a > b) return { text: 'DOWN', score: -1, color: 'blue' };
  return { text: 'AS', score: 0, color: 'black' };
}

function buildStrokeRowDetail(row, shared, cfg, byId, inputsByEvent) {
  const holes = cfg.selectedHoles.map((holeNo) => {
    const ids = getBattleCellIds(shared, row.key, holeNo, row.memberIds);
    const members = ids.map((id) => byId.get(String(id))).filter(Boolean);
    const scores = members.map((member) => getBattleScoreValue(inputsByEvent, member?.id, holeNo)).filter((n) => Number.isFinite(n));
    const hasAny = scores.length > 0;
    const value = hasAny ? scores.reduce((sum, n) => sum + n, 0) : null;
    return {
      holeNo,
      ids,
      members,
      scores,
      value,
      label: members.map((member) => String(member?.nickname || '')).join(' / '),
      ready: hasAny,
      displayValue: hasAny ? String(value) : '',
    };
  });
  const numericValues = holes.map((hole) => hole.value).filter((n) => Number.isFinite(n));
  const value = numericValues.length ? numericValues.reduce((sum, n) => sum + n, 0) : 0;
  return {
    ...row,
    value,
    displayValue: numericValues.length ? String(value) : '',
    sortValue: value,
    holes,
    usage: countParticipantUsageForRow(shared, row.key),
    complete: isBattleRowSelectionComplete(row, shared, { params: cfg }),
  };
}

function buildMatchRows(rowsBase, shared, cfg, byId, inputsByEvent) {
  const baseRows = rowsBase.map((row) => ({
    ...row,
    usage: countParticipantUsageForRow(shared, row.key),
    complete: isBattleRowSelectionComplete(row, shared, { params: cfg }),
    holes: [],
    value: 0,
    displayValue: 'AS',
    sortValue: 0,
  }));

  const rowByKey = new Map(baseRows.map((row) => [String(row.key), row]));
  const pairs = [];
  for (let idx = 0; idx < baseRows.length; idx += 2) {
    const left = baseRows[idx];
    const right = baseRows[idx + 1] || null;
    if (!left) continue;
    pairs.push([left, right]);
  }

  pairs.forEach(([left, right]) => {
    const pairRows = [left, right].filter(Boolean);
    pairRows.forEach((row) => {
      row.holes = cfg.selectedHoles.map((holeNo) => ({
        holeNo,
        ids: getBattleCellIds(shared, row.key, holeNo, row.memberIds),
        members: [],
        label: '',
        value: null,
        ready: false,
        displayValue: '',
        resultText: '',
        resultColor: '',
      }));
    });
    if (!right) return;

    cfg.selectedHoles.forEach((holeNo, holeIdx) => {
      const leftIds = getBattleCellIds(shared, left.key, holeNo, left.memberIds);
      const rightIds = getBattleCellIds(shared, right.key, holeNo, right.memberIds);
      const leftMembers = leftIds.map((id) => byId.get(String(id))).filter(Boolean);
      const rightMembers = rightIds.map((id) => byId.get(String(id))).filter(Boolean);
      const leftScores = leftMembers.map((member) => getBattleScoreValue(inputsByEvent, member?.id, holeNo));
      const rightScores = rightMembers.map((member) => getBattleScoreValue(inputsByEvent, member?.id, holeNo));
      const requiredCount = Math.max(1, Number(cfg.pickCount || 1));
      const leftReady = leftIds.length === requiredCount && leftScores.every((n) => Number.isFinite(n));
      const rightReady = rightIds.length === requiredCount && rightScores.every((n) => Number.isFinite(n));
      const leftSum = leftReady ? leftScores.reduce((sum, n) => sum + n, 0) : null;
      const rightSum = rightReady ? rightScores.reduce((sum, n) => sum + n, 0) : null;
      const leftResult = compareMatchValues(leftSum, rightSum);
      const rightResult = compareMatchValues(rightSum, leftSum);

      left.holes[holeIdx] = {
        holeNo,
        ids: leftIds,
        members: leftMembers,
        label: leftMembers.map((member) => String(member?.nickname || '')).join(' / '),
        value: leftSum,
        ready: leftReady && rightReady,
        displayValue: leftResult.text,
        resultText: leftResult.text,
        resultColor: leftResult.color,
      };
      right.holes[holeIdx] = {
        holeNo,
        ids: rightIds,
        members: rightMembers,
        label: rightMembers.map((member) => String(member?.nickname || '')).join(' / '),
        value: rightSum,
        ready: leftReady && rightReady,
        displayValue: rightResult.text,
        resultText: rightResult.text,
        resultColor: rightResult.color,
      };

      if (leftReady && rightReady) {
        left.value += Number(leftResult.score || 0);
        right.value += Number(rightResult.score || 0);
      }
    });

    pairRows.forEach((row) => {
      row.displayValue = formatMatchTotal(row.value);
      row.sortValue = row.value;
    });
  });

  return baseRows;
}

export function computeGroupRoomHoleBattle(eventDef, participants = [], inputsByEvent = {}, opt = {}) {
  const cfg = normalizeGroupRoomHoleBattleParams(eventDef?.params, {
    participants,
    roomNames: opt?.roomNames,
    roomCount: opt?.roomCount,
  });
  const shared = getBattleSharedInputs(inputsByEvent);
  const byId = getParticipantsById(participants);
  const isMatchLike = cfg.battleType === 'match' || cfg.battleType === 'fourball';

  if (cfg.mode === 'person') {
    const inputRowsBase = getGroupRoomHoleBattleInputRows(eventDef, participants, opt);
    const inputRows = inputRowsBase.map((row) => buildStrokeRowDetail(row, shared, cfg, byId, inputsByEvent));
    const scoreParticipants = getGroupRoomBattleScoreParticipants(eventDef, participants, opt);
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
        const value = Number.isFinite(baseScore) ? baseScore * picks : null;
        return {
          holeNo,
          ids: picks ? Array.from({ length: picks }, () => pid) : [],
          members: Number.isFinite(baseScore) ? [participant] : [],
          selectors,
          picks,
          value,
          ready: Number.isFinite(baseScore),
          displayValue: Number.isFinite(value) ? String(value) : '',
          label: selectors.map((row) => String(row?.name || '')).join(' / '),
        };
      });
      const numericValues = holes.map((hole) => hole.value).filter((n) => Number.isFinite(n));
      const value = numericValues.length ? numericValues.reduce((sum, n) => sum + n, 0) : 0;
      return {
        key: `person-${pid}`,
        type: 'person',
        personId: pid,
        name: String(participant?.nickname || ''),
        rawName: String(participant?.nickname || ''),
        members: [participant],
        memberIds: [pid],
        value,
        displayValue: numericValues.length ? String(value) : '',
        sortValue: value,
        holes,
        usage: {},
        complete: isBattleParticipantScoreComplete(inputsByEvent, pid, cfg.selectedHoles),
      };
    });

    rows.sort((a, b) => (a.sortValue - b.sortValue) || String(a.name || '').localeCompare(String(b.name || ''), 'ko'));

    return {
      kind: 'person',
      metric: 'score',
      battleType: cfg.battleType,
      rows,
      inputRows,
      config: cfg,
      shared,
      participantRows,
      scoreParticipants,
    };
  }

  const rowsBase = getGroupRoomHoleBattleRows(eventDef, participants, opt);
  const inputRowsBase = getGroupRoomHoleBattleInputRows(eventDef, participants, opt);
  const scoreParticipants = getGroupRoomBattleScoreParticipants(eventDef, participants, opt);
  const rows = isMatchLike
    ? buildMatchRows(rowsBase, shared, cfg, byId, inputsByEvent)
    : rowsBase.map((row) => buildStrokeRowDetail(row, shared, cfg, byId, inputsByEvent));
  const inputRows = inputRowsBase.map((row) => buildStrokeRowDetail(row, shared, cfg, byId, inputsByEvent));
  const participantRows = scoreParticipants.map((participant) => ({
    id: String(participant?.id || ''),
    name: String(participant?.nickname || ''),
    roomNo: Number(participant?.room || 0) || 0,
    values: cfg.selectedHoles.map((holeNo) => getBattleScoreValue(inputsByEvent, participant?.id, holeNo)),
    complete: isBattleParticipantScoreComplete(inputsByEvent, participant?.id, cfg.selectedHoles),
  }));

  if (isMatchLike) {
    rows.sort((a, b) => (Number(b.sortValue || 0) - Number(a.sortValue || 0)) || String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
  } else {
    const sign = eventDef?.rankOrder === 'desc' ? -1 : 1;
    rows.sort((a, b) => sign * (a.value - b.value) || String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
  }

  return {
    kind: cfg.mode === 'room' ? 'room' : 'group',
    metric: isMatchLike ? 'match' : 'score',
    battleType: cfg.battleType,
    rows,
    inputRows,
    config: cfg,
    shared,
    participantRows,
    scoreParticipants,
  };
}
