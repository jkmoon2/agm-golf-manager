// /src/events/groupRoomHoleBattle.js

const DEFAULT_HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const MATCH_STROKE = 'stroke';
const MATCH_PLAY = 'matchplay';
const MATCH_FOURBALL = 'match-fourball';
const ROOM_TEAM_A = 'A';
const ROOM_TEAM_B = 'B';
const ROOM_TEAM_SPLIT = 'split';

export function defaultGroupRoomHoleBattleParams() {
  return {
    selectedHoles: DEFAULT_HOLES,
    mode: 'group',
    battleType: MATCH_STROKE,
    groups: [
      { key: 'group-1', name: '그룹1', memberIds: [], leaderIds: [] },
      { key: 'group-2', name: '그룹2', memberIds: [], leaderIds: [] },
    ],
    personIds: [],
    pickCount: 1,
    maxPerParticipant: 1,
    selectionLocked: false,
    roomTeams: {},
    roomSplitAssignments: {},
  };
}

export function getGroupRoomDisplayName(name, idx, fallback = '그룹') {
  const text = String(name || '').trim();
  return text || `${fallback}${idx + 1}`;
}

export function normalizeBattleType(value) {
  const raw = String(value || '').trim();
  if (raw === MATCH_PLAY) return MATCH_PLAY;
  if (raw === MATCH_FOURBALL) return MATCH_FOURBALL;
  return MATCH_STROKE;
}

export function getBattleTypeLabel(value) {
  const safe = normalizeBattleType(value);
  if (safe === MATCH_PLAY) return '매치플레이';
  if (safe === MATCH_FOURBALL) return '매치(포볼)';
  return '스트로크';
}

export function normalizeRoomTeamSide(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === ROOM_TEAM_A) return ROOM_TEAM_A;
  if (raw === ROOM_TEAM_B) return ROOM_TEAM_B;
  if (String(value || '').trim() === ROOM_TEAM_SPLIT) return ROOM_TEAM_SPLIT;
  return '';
}

export function getRoomTeamDisplayName(side) {
  if (side === ROOM_TEAM_A) return 'A팀';
  if (side === ROOM_TEAM_B) return 'B팀';
  if (side === ROOM_TEAM_SPLIT) return '분할';
  return '-';
}

function normalizeIdList(value) {
  const src = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  src.forEach((item) => {
    const id = String(item || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

function normalizeGroupRow(group, idx) {
  return {
    key: String(group?.key || `group-${idx + 1}`),
    name: String(group?.name || '').trim(),
    memberIds: normalizeIdList(group?.memberIds),
    leaderIds: normalizeIdList(group?.leaderIds),
  };
}

function normalizeGroupRows(value) {
  const src = Array.isArray(value) ? value : [];
  const rows = src.map((group, idx) => normalizeGroupRow(group, idx));
  return rows.length ? rows : defaultGroupRoomHoleBattleParams().groups.map((group, idx) => normalizeGroupRow(group, idx));
}

function defaultRoomSide(roomNo) {
  return Number(roomNo || 0) % 2 === 1 ? ROOM_TEAM_A : ROOM_TEAM_B;
}

function getParticipantsInRoom(participants = [], roomNo) {
  return (Array.isArray(participants) ? participants : []).filter((participant) => Number(participant?.room || 0) === Number(roomNo || 0));
}

function normalizeRoomTeams(value, participants = [], roomCount = 0) {
  const src = value && typeof value === 'object' ? value : {};
  const maxRoom = Math.max(0, Number(roomCount || 0));
  const out = {};
  for (let roomNo = 1; roomNo <= maxRoom; roomNo += 1) {
    const key = String(roomNo);
    const side = normalizeRoomTeamSide(src[key]);
    out[key] = side || defaultRoomSide(roomNo);
  }
  (Array.isArray(participants) ? participants : []).forEach((participant) => {
    const roomNo = Number(participant?.room || 0);
    if (roomNo >= 1 && !out[String(roomNo)]) out[String(roomNo)] = defaultRoomSide(roomNo);
  });
  return out;
}

function normalizeRoomSplitAssignments(value, participants = [], roomTeams = {}) {
  const src = value && typeof value === 'object' ? value : {};
  const out = {};
  Object.keys(roomTeams || {}).forEach((roomKey) => {
    if (roomTeams[roomKey] !== ROOM_TEAM_SPLIT) return;
    const roomNo = Number(roomKey || 0);
    if (roomNo < 1) return;
    const members = getParticipantsInRoom(participants, roomNo);
    const roomSrc = src?.[roomKey] && typeof src[roomKey] === 'object' ? src[roomKey] : {};
    const assignment = {};
    const halfIndex = Math.ceil(members.length / 2);
    members.forEach((member, idx) => {
      const pid = String(member?.id || '');
      if (!pid) return;
      const safeSide = normalizeRoomTeamSide(roomSrc?.[pid]);
      assignment[pid] = safeSide === ROOM_TEAM_A || safeSide === ROOM_TEAM_B
        ? safeSide
        : idx < halfIndex
          ? ROOM_TEAM_A
          : ROOM_TEAM_B;
    });
    out[roomKey] = assignment;
  });
  return out;
}

export function normalizeGroupRoomHoleBattleParams(src, opt = {}) {
  const base = defaultGroupRoomHoleBattleParams();
  const selectedHoles = normalizeIdList((Array.isArray(src?.selectedHoles) ? src.selectedHoles : base.selectedHoles).map((holeNo) => Number(holeNo)).filter((holeNo) => Number.isFinite(holeNo) && holeNo >= 1 && holeNo <= 18)).map(Number).sort((a, b) => a - b);
  const mode = String(src?.mode || base.mode);
  const participants = Array.isArray(opt?.participants) ? opt.participants : [];
  const roomNames = Array.isArray(opt?.roomNames) ? opt.roomNames : [];
  const roomCount = Math.max(
    0,
    Number(opt?.roomCount || 0),
    ...(participants.map((participant) => Number(participant?.room || 0)).filter((roomNo) => Number.isFinite(roomNo) && roomNo > 0))
  );
  const battleType = normalizeBattleType(src?.battleType);

  const groupsRaw = normalizeGroupRows(Array.isArray(src?.groups) && src.groups.length ? src.groups : base.groups);
  const groups = groupsRaw.filter((group) => mode !== 'group' || group.memberIds.length > 0 || typeof group.name === 'string');
  const personIds = normalizeIdList(src?.personIds);
  const pickCountRaw = Number(src?.pickCount);
  const maxPerParticipantRaw = Number(src?.maxPerParticipant);
  const pickCount = Number.isFinite(pickCountRaw) && pickCountRaw >= 1
    ? Math.max(1, Math.min(4, pickCountRaw))
    : battleType === MATCH_FOURBALL
      ? 2
      : 1;
  const maxPerParticipant = Number.isFinite(maxPerParticipantRaw) && maxPerParticipantRaw >= 1
    ? Math.max(1, Math.min(8, maxPerParticipantRaw))
    : base.maxPerParticipant;

  const roomTeams = normalizeRoomTeams(src?.roomTeams, participants, roomCount);
  const roomSplitAssignments = normalizeRoomSplitAssignments(src?.roomSplitAssignments, participants, roomTeams);

  return {
    selectedHoles: selectedHoles.length ? selectedHoles : base.selectedHoles,
    mode: mode === 'room' || mode === 'person' ? mode : 'group',
    battleType,
    groups: mode === 'group' ? (groups.length ? groups : normalizeGroupRows(base.groups)) : normalizeGroupRows(groupsRaw),
    personIds,
    pickCount,
    maxPerParticipant,
    selectionLocked: !!src?.selectionLocked,
    roomCount,
    roomNames,
    participants,
    roomTeams,
    roomSplitAssignments,
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
  return new Map((Array.isArray(participants) ? participants : []).map((participant) => [String(participant?.id), participant]));
}

function getParticipantScoreForHole(inputsByEvent = {}, participantId, holeNo) {
  const raw = inputsByEvent?.person?.[String(participantId)]?.values?.[Number(holeNo) - 1];
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
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

function getRoomRows(cfg, participants = []) {
  const maxRoom = cfg.roomCount || Math.max(0, ...(Array.isArray(participants) ? participants : []).map((participant) => Number(participant?.room || 0)).filter((roomNo) => Number.isFinite(roomNo)));
  return Array.from({ length: maxRoom }, (_, idx) => {
    const roomNo = idx + 1;
    const members = (Array.isArray(participants) ? participants : []).filter((participant) => Number(participant?.room) === roomNo);
    return {
      key: `room-${roomNo}`,
      type: 'room',
      roomNo,
      name: getRoomLabel(roomNo, cfg.roomNames),
      displayName: getRoomLabel(roomNo, cfg.roomNames),
      memberIds: members.map((participant) => String(participant?.id ?? '')).filter(Boolean),
      members,
    };
  }).filter((row) => row.memberIds.length > 0);
}

function getPersonPool(cfg, participants = []) {
  const byId = getParticipantsById(participants);
  return (Array.isArray(cfg.personIds) ? cfg.personIds : []).map((id) => byId.get(String(id))).filter(Boolean);
}

function getPersonRows(cfg, participants = []) {
  return getPersonPool(cfg, participants).map((participant) => ({
    key: `person-${String(participant?.id || '')}`,
    type: 'person',
    personId: String(participant?.id || ''),
    name: String(participant?.nickname || ''),
    displayName: String(participant?.nickname || ''),
    memberIds: [String(participant?.id || '')],
    members: [participant],
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
  const currentParticipantId = String(opt?.currentParticipantId || '').trim();
  const currentParticipantNickname = String(opt?.currentParticipantNickname || '').trim().toLowerCase();

  if (cfg.mode === 'room') {
    const rows = getRoomRows(cfg, participants);
    if (currentRoomNo >= 1) {
      const row = rows.find((item) => Number(item?.roomNo) === currentRoomNo);
      return row ? [row] : [];
    }
    return rows;
  }

  if (cfg.mode === 'person') {
    const sourceMembers = currentRoomNo >= 1
      ? (Array.isArray(participants) ? participants : []).filter((participant) => Number(participant?.room) === currentRoomNo)
      : (Array.isArray(participants) ? participants : []);
    const pool = getPersonPool(cfg, participants);
    const poolIds = pool.map((participant) => String(participant?.id || '')).filter(Boolean);
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
  if (currentParticipantId) {
    const mine = rows.filter((row) => row.memberIds.some((id) => String(id) === currentParticipantId));
    if (mine.length) return mine;
  }
  if (currentParticipantNickname) {
    const mine = rows.filter((row) => (Array.isArray(row?.members) ? row.members : []).some((member) => String(member?.nickname || '').trim().toLowerCase() === currentParticipantNickname));
    if (mine.length) return mine;
  }
  if (currentRoomNo < 1) return rows;
  const roomMemberIds = new Set(
    (Array.isArray(participants) ? participants : [])
      .filter((participant) => Number(participant?.room) === currentRoomNo)
      .map((participant) => String(participant?.id || ''))
      .filter(Boolean)
  );
  const filtered = rows.filter((row) => row.memberIds.some((id) => roomMemberIds.has(String(id))));
  return filtered;
}

export function getGroupRoomBattleScoreParticipants(eventDef, participants = [], opt = {}) {
  const currentRoomNo = Number(opt?.currentRoomNo || 0);
  const safeParticipants = Array.isArray(participants) ? participants : [];
  if (currentRoomNo >= 1) {
    return safeParticipants.filter((participant) => Number(participant?.room) === currentRoomNo);
  }
  return safeParticipants;
}

export function normalizeBattleCellIds(value, allowedIds = []) {
  const allow = new Set((Array.isArray(allowedIds) ? allowedIds : []).map((id) => String(id)));
  const src = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  src.forEach((id) => {
    const safe = String(id || '').trim();
    if (!safe || seen.has(safe)) return;
    if (allow.size && !allow.has(safe)) return;
    seen.add(safe);
    out.push(safe);
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
  return getParticipantScoreForHole(inputsByEvent, pid, holeNo);
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

function computeSelectedHoleMetric(members = [], holeNo, inputsByEvent = {}, battleType = MATCH_STROKE) {
  const scoreValues = (Array.isArray(members) ? members : []).map((member) => getBattleScoreValue(inputsByEvent, member?.id, holeNo));
  const validScores = scoreValues.filter((value) => Number.isFinite(value));
  const allScoreComplete = scoreValues.length > 0 && validScores.length === scoreValues.length;
  if (!validScores.length) {
    return {
      scoreValues,
      validScores,
      allScoreComplete,
      metricValue: null,
    };
  }

  if (battleType === MATCH_FOURBALL) {
    return {
      scoreValues,
      validScores,
      allScoreComplete,
      metricValue: allScoreComplete ? Math.min(...validScores) : null,
    };
  }

  if (battleType === MATCH_PLAY) {
    return {
      scoreValues,
      validScores,
      allScoreComplete,
      metricValue: allScoreComplete ? validScores[0] : null,
    };
  }

  return {
    scoreValues,
    validScores,
    allScoreComplete,
    metricValue: validScores.reduce((sum, value) => sum + value, 0),
  };
}

function compareLowerScore(a, b) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return '';
  if (left < right) return 'UP';
  if (left > right) return 'DOWN';
  return 'AS';
}

function getMatchTextColor(resultText) {
  if (resultText === 'UP') return '#dc2626';
  if (resultText === 'DOWN') return '#2563eb';
  return '#111827';
}

function toMatchSummary(upCount, downCount) {
  const diff = Number(upCount || 0) - Number(downCount || 0);
  if (diff === 0) return 'AS';
  if (diff > 0) return `${diff}UP`;
  return `${Math.abs(diff)}DOWN`;
}

function getMatchSummaryColor(summary) {
  if (String(summary || '').includes('UP')) return '#dc2626';
  if (String(summary || '').includes('DOWN')) return '#2563eb';
  return '#111827';
}

function buildInputRowDetail(row, shared, cfg, byId, inputsByEvent) {
  const holes = cfg.selectedHoles.map((holeNo) => {
    const ids = getBattleCellIds(shared, row.key, holeNo, row.memberIds);
    const members = ids.map((id) => byId.get(String(id))).filter(Boolean);
    const metric = computeSelectedHoleMetric(members, holeNo, inputsByEvent, cfg.battleType);
    const value = cfg.battleType === MATCH_STROKE
      ? metric.validScores.reduce((sum, score) => sum + score, 0)
      : Number.isFinite(metric.metricValue)
        ? metric.metricValue
        : 0;
    return {
      holeNo,
      ids,
      members,
      value,
      metricValue: metric.metricValue,
      scoreValues: metric.scoreValues,
      validScores: metric.validScores,
      allScoreComplete: metric.allScoreComplete,
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

function buildGroupMatchRows(rowsBase = [], cfg) {
  return rowsBase.map((row, idx) => {
    const pairIndex = idx % 2 === 0 ? idx + 1 : idx - 1;
    const pairRow = rowsBase[pairIndex] || null;
    let upCount = 0;
    let downCount = 0;
    let readyCount = 0;
    const holes = cfg.selectedHoles.map((holeNo) => {
      const mine = Array.isArray(row?.holes) ? row.holes.find((hole) => Number(hole?.holeNo) === Number(holeNo)) : null;
      const other = pairRow && Array.isArray(pairRow?.holes) ? pairRow.holes.find((hole) => Number(hole?.holeNo) === Number(holeNo)) : null;
      const compareReady = !!pairRow && !!mine && !!other && mine.allScoreComplete && other.allScoreComplete && Number.isFinite(mine.metricValue) && Number.isFinite(other.metricValue);
      const resultText = compareReady ? compareLowerScore(mine.metricValue, other.metricValue) : '';
      if (resultText === 'UP') upCount += 1;
      if (resultText === 'DOWN') downCount += 1;
      if (compareReady) readyCount += 1;
      return {
        ...(mine || { holeNo }),
        holeNo,
        compareReady,
        resultText,
        resultColor: getMatchTextColor(resultText),
      };
    });
    const displayTotal = readyCount ? toMatchSummary(upCount, downCount) : '';
    return {
      ...row,
      pairKey: pairRow ? String(pairRow?.key || '') : '',
      holes,
      upCount,
      downCount,
      readyCount,
      value: upCount - downCount,
      displayTotal,
      displayColor: getMatchSummaryColor(displayTotal),
      complete: !!pairRow && readyCount === cfg.selectedHoles.length,
      metricLabel: 'match',
    };
  });
}

function buildRoomTeamRows(cfg, participants = [], inputsByEvent = {}, opt = {}) {
  const roomTeams = cfg.roomTeams || {};
  const splitAssignments = cfg.roomSplitAssignments || {};
  const safeParticipants = Array.isArray(participants) ? participants : [];

  const teamMembers = {
    [ROOM_TEAM_A]: [],
    [ROOM_TEAM_B]: [],
  };
  const teamRooms = {
    [ROOM_TEAM_A]: [],
    [ROOM_TEAM_B]: [],
  };

  safeParticipants.forEach((participant) => {
    const roomNo = Number(participant?.room || 0);
    if (roomNo < 1) return;
    const roomKey = String(roomNo);
    const roomSide = normalizeRoomTeamSide(roomTeams?.[roomKey]) || defaultRoomSide(roomNo);
    if (roomSide === ROOM_TEAM_SPLIT) {
      const assignedSide = normalizeRoomTeamSide(splitAssignments?.[roomKey]?.[String(participant?.id || '')]) || ROOM_TEAM_A;
      if (assignedSide === ROOM_TEAM_A || assignedSide === ROOM_TEAM_B) {
        teamMembers[assignedSide].push(participant);
        if (!teamRooms[assignedSide].includes(roomKey)) teamRooms[assignedSide].push(roomKey);
      }
      return;
    }
    if (roomSide === ROOM_TEAM_A || roomSide === ROOM_TEAM_B) {
      teamMembers[roomSide].push(participant);
      if (!teamRooms[roomSide].includes(roomKey)) teamRooms[roomSide].push(roomKey);
    }
  });

  const currentRoomNo = Number(opt?.currentRoomNo || 0);
  const currentParticipantId = String(opt?.currentParticipantId || '').trim();
  let currentTeamKey = '';
  if (currentParticipantId) {
    if (teamMembers[ROOM_TEAM_A].some((participant) => String(participant?.id || '') === currentParticipantId)) currentTeamKey = ROOM_TEAM_A;
    if (teamMembers[ROOM_TEAM_B].some((participant) => String(participant?.id || '') === currentParticipantId)) currentTeamKey = ROOM_TEAM_B;
  }
  if (!currentTeamKey && currentRoomNo >= 1) {
    const roomKey = String(currentRoomNo);
    const roomSide = normalizeRoomTeamSide(roomTeams?.[roomKey]) || defaultRoomSide(currentRoomNo);
    if (roomSide === ROOM_TEAM_A || roomSide === ROOM_TEAM_B) currentTeamKey = roomSide;
    if (roomSide === ROOM_TEAM_SPLIT) {
      const participantInRoom = safeParticipants.find((participant) => String(participant?.id || '') === currentParticipantId);
      if (participantInRoom) currentTeamKey = normalizeRoomTeamSide(splitAssignments?.[roomKey]?.[String(participantInRoom?.id || '')]) || '';
    }
  }

  const buildTeamRow = (teamKey) => {
    const members = teamMembers[teamKey] || [];
    const holes = cfg.selectedHoles.map((holeNo) => {
      const scoreValues = members.map((member) => getBattleScoreValue(inputsByEvent, member?.id, holeNo));
      const validScores = scoreValues.filter((score) => Number.isFinite(score));
      const allScoreComplete = scoreValues.length > 0 && validScores.length === scoreValues.length;
      const metricValue = allScoreComplete ? validScores.reduce((sum, score) => sum + score, 0) : null;
      return {
        holeNo,
        members,
        ids: members.map((member) => String(member?.id || '')).filter(Boolean),
        scoreValues,
        validScores,
        allScoreComplete,
        metricValue,
        value: Number.isFinite(metricValue) ? metricValue : 0,
        label: members.map((member) => String(member?.nickname || '')).join(' / '),
      };
    });

    return {
      key: `room-team-${teamKey}`,
      type: 'room-team',
      teamKey,
      roomNos: teamRooms[teamKey].map(Number).filter((roomNo) => Number.isFinite(roomNo)),
      memberIds: members.map((member) => String(member?.id || '')).filter(Boolean),
      members,
      name: `${teamKey}팀`,
      displayName: `${teamKey}팀`,
      holes,
      value: 0,
      complete: false,
    };
  };

  const rowA = buildTeamRow(ROOM_TEAM_A);
  const rowB = buildTeamRow(ROOM_TEAM_B);
  const baseRows = [rowA, rowB];

  baseRows.forEach((row, idx) => {
    const other = idx === 0 ? rowB : rowA;
    let upCount = 0;
    let downCount = 0;
    let readyCount = 0;
    row.holes = row.holes.map((hole) => {
      const pairHole = other.holes.find((item) => Number(item?.holeNo) === Number(hole?.holeNo));
      const compareReady = !!pairHole && hole.allScoreComplete && pairHole.allScoreComplete && Number.isFinite(hole.metricValue) && Number.isFinite(pairHole.metricValue);
      const resultText = compareReady ? compareLowerScore(hole.metricValue, pairHole.metricValue) : '';
      if (resultText === 'UP') upCount += 1;
      if (resultText === 'DOWN') downCount += 1;
      if (compareReady) readyCount += 1;
      return {
        ...hole,
        compareReady,
        resultText,
        resultColor: getMatchTextColor(resultText),
      };
    });
    const displayTotal = readyCount ? toMatchSummary(upCount, downCount) : '';
    row.upCount = upCount;
    row.downCount = downCount;
    row.readyCount = readyCount;
    row.value = upCount - downCount;
    row.displayTotal = displayTotal;
    row.displayColor = getMatchSummaryColor(displayTotal);
    row.complete = readyCount === cfg.selectedHoles.length;
    row.metricLabel = 'match';
  });

  return {
    rows: baseRows,
    currentTeamKey,
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
  const battleType = normalizeBattleType(cfg.battleType);
  const isMatchMode = battleType !== MATCH_STROKE && cfg.mode !== 'person';

  if (cfg.mode === 'person') {
    const inputRowsBase = getGroupRoomHoleBattleInputRows(eventDef, participants, opt);
    const inputRows = inputRowsBase.map((row) => buildInputRowDetail(row, shared, cfg, byId, inputsByEvent));
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

    rows.sort((left, right) => sign * (left.value - right.value) || String(left.name || '').localeCompare(String(right.name || ''), 'ko'));

    return {
      kind: 'person',
      metric: 'score',
      rows,
      inputRows,
      config: cfg,
      shared,
      participantRows,
      scoreParticipants,
      currentTeamKey: '',
    };
  }

  const rowsBase = getGroupRoomHoleBattleRows(eventDef, participants, opt);
  const inputRowsBase = getGroupRoomHoleBattleInputRows(eventDef, participants, opt);
  const scoreParticipants = getGroupRoomBattleScoreParticipants(eventDef, participants, opt);

  const numericRows = rowsBase.map((row) => buildInputRowDetail(row, shared, cfg, byId, inputsByEvent));
  const inputRows = inputRowsBase.map((row) => buildInputRowDetail(row, shared, cfg, byId, inputsByEvent));
  const participantRows = scoreParticipants.map((participant) => ({
    id: String(participant?.id || ''),
    name: String(participant?.nickname || ''),
    roomNo: Number(participant?.room || 0) || 0,
    values: cfg.selectedHoles.map((holeNo) => getBattleScoreValue(inputsByEvent, participant?.id, holeNo)),
    complete: isBattleParticipantScoreComplete(inputsByEvent, participant?.id, cfg.selectedHoles),
  }));

  if (isMatchMode && cfg.mode === 'group') {
    const rows = buildGroupMatchRows(numericRows, cfg);
    rows.sort((left, right) => (right.value - left.value) || String(left.name || '').localeCompare(String(right.name || ''), 'ko'));
    return {
      kind: 'group',
      metric: 'match',
      rows,
      inputRows,
      config: cfg,
      shared,
      participantRows,
      scoreParticipants,
      currentTeamKey: '',
    };
  }

  if (isMatchMode && cfg.mode === 'room') {
    const teamData = buildRoomTeamRows(cfg, participants, inputsByEvent, opt);
    const rows = Array.isArray(teamData.rows) ? teamData.rows : [];
    rows.sort((left, right) => (right.value - left.value) || String(left.name || '').localeCompare(String(right.name || ''), 'ko'));
    return {
      kind: 'room',
      metric: 'match',
      rows,
      inputRows,
      config: cfg,
      shared,
      participantRows,
      scoreParticipants,
      currentTeamKey: teamData.currentTeamKey || '',
      numericRows,
    };
  }

  numericRows.sort((left, right) => sign * (left.value - right.value) || String(left.name || '').localeCompare(String(right.name || ''), 'ko'));

  return {
    kind: cfg.mode === 'room' ? 'room' : 'group',
    metric: 'score',
    rows: numericRows,
    inputRows,
    config: cfg,
    shared,
    participantRows,
    scoreParticipants,
    currentTeamKey: '',
  };
}
