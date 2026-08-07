// /src/events/pickLineup.js
// 개인/조/투표 선택 대결 계산 유틸
// - 개인모드(single): 전체 참가자 중 1~4명 선택
// - 조모드(jo): 오픈된 각 조에서 1명씩 선택
// - 투표모드(vote): 운영자가 투표별 후보 참가자를 지정하고, 각 참가자가 투표별 1명 선택
// - 개인/조 계산식: 점수 - G핸디 = 결과
// - 옵션: 조모드 + 4조 모두 오픈 시 꼴등반띵(가장 높은 점수 1명만 floor(score/2) 적용)

export function getParticipantGroupNo(p) {
  const raw = p?.group ?? p?.jo ?? p?.groupNo ?? p?.groupNumber ?? p?.teamGroup ?? p?.flight;
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  const s = String(raw ?? '').trim();
  const m = s.match(/(\d+)/);
  return m ? Number(m[1]) : NaN;
}

export function normalizeOpenGroups(input) {
  const arr = Array.isArray(input) ? input : [1, 2, 3, 4];
  const out = arr
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 4);
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

function normalizeIdList(input) {
  const arr = Array.isArray(input) ? input : [];
  const seen = new Set();
  const out = [];
  arr.forEach((value) => {
    const id = String(value ?? '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

export function normalizeVoteSlots(input, voteCount = 1) {
  const count = Math.max(1, Math.min(4, Number(voteCount || 1)));
  const src = Array.isArray(input) ? input : [];
  return Array.from({ length: count }, (_, idx) => {
    const raw = src[idx] && typeof src[idx] === 'object' ? src[idx] : {};
    const fallbackTitle = `투표${idx + 1}`;
    const hasTitle = Object.prototype.hasOwnProperty.call(raw, 'title');
    const title = hasTitle ? String(raw.title ?? '') : fallbackTitle;
    const candidateIds = normalizeIdList(
      raw.candidateIds
      ?? raw.memberIds
      ?? raw.participantIds
      ?? raw.candidates
      ?? []
    );
    return {
      title,
      candidateIds,
    };
  });
}

export function getPickLineupConfig(eventDef) {
  const params = eventDef?.params || {};
  const mode = params.mode === 'jo' ? 'jo' : (params.mode === 'vote' ? 'vote' : 'single');
  const pickCount = Math.max(1, Math.min(4, Number(params.pickCount || 1)));
  const voteCount = Math.max(1, Math.min(4, Number(params.voteCount || 1)));
  const openGroups = normalizeOpenGroups(params.openGroups);
  const voteSlots = normalizeVoteSlots(params.voteSlots, voteCount);
  const lastPlaceHalf = !!params.lastPlaceHalf;
  const selectionLocked = !!(params.selectionLocked || params.locked);
  const selectionRevealed = !!(params.selectionRevealed || params.revealed || params.publicSelection || params.showSelections);
  return {
    mode,
    pickCount,
    voteCount,
    voteSlots,
    openGroups: openGroups.length ? openGroups : [1],
    lastPlaceHalf,
    selectionLocked,
    selectionRevealed,
    revealed: selectionRevealed,
    publicSelection: selectionRevealed,
    showSelections: selectionRevealed,
  };
}

export function getPickLineupRequiredCount(eventDef) {
  const cfg = getPickLineupConfig(eventDef);
  if (cfg.mode === 'jo') return cfg.openGroups.length;
  if (cfg.mode === 'vote') return cfg.voteCount;
  return cfg.pickCount;
}

export function getPickLineupSlotLabels(eventDef) {
  const cfg = getPickLineupConfig(eventDef);
  if (cfg.mode === 'jo') return cfg.openGroups.map((groupNo) => `${groupNo}조`);
  if (cfg.mode === 'vote') return cfg.voteSlots.map((slot, idx) => String(slot?.title ?? '').trim() || `투표${idx + 1}`);
  return Array.from({ length: cfg.pickCount }, (_, idx) => `선택${idx + 1}`);
}

export function getPickLineupCandidateIds(eventDef, slotIdx = 0) {
  const cfg = getPickLineupConfig(eventDef);
  if (cfg.mode !== 'vote') return [];
  return normalizeIdList(cfg.voteSlots?.[slotIdx]?.candidateIds || []);
}

export function normalizeMemberIds(slot) {
  if (Array.isArray(slot?.memberIds)) return slot.memberIds.map((x) => String(x ?? ''));
  if (Array.isArray(slot?.picks)) return slot.picks.map((x) => String(x ?? ''));
  return [];
}

function getRoomLabel(roomNames, roomNo) {
  const idx = Number(roomNo) - 1;
  if (idx >= 0 && Array.isArray(roomNames) && roomNames[idx] && String(roomNames[idx]).trim()) {
    return String(roomNames[idx]).trim();
  }
  return Number.isFinite(Number(roomNo)) && Number(roomNo) >= 1 ? `${roomNo}번방` : '-';
}

function getResultValue(p, handicapValue, { lastPlaceHalf = false, halved = false } = {}) {
  const score = Number(p?.score ?? 0) || 0;
  const handicap = Number(handicapValue ?? p?.handicap ?? 0) || 0;
  const usedScore = (lastPlaceHalf && halved) ? Math.floor(score / 2) : score;
  return usedScore - handicap;
}

function buildMemberRows(members, cfg, handicapOverrides = {}) {
  const rows = members.map((p) => {
    const baseHandicap = Number(p?.handicap ?? 0) || 0;
    const ov = Number(handicapOverrides[String(p?.id)]);
    const handicap = Number.isFinite(ov) ? ov : baseHandicap;
    return ({
      id: String(p?.id ?? ''),
      name: String(p?.nickname || ''),
      room: p?.room ?? null,
      handicap,
      score: Number(p?.score ?? 0) || 0,
      groupNo: getParticipantGroupNo(p),
      halved: false,
    });
  });

  if (cfg.mode === 'jo' && cfg.openGroups.length === 4 && cfg.lastPlaceHalf && rows.length === 4) {
    let maxIdx = -1;
    let maxScore = -Infinity;
    rows.forEach((m, idx) => {
      if (m.score > maxScore) {
        maxScore = m.score;
        maxIdx = idx;
      }
    });
    if (maxIdx >= 0) rows[maxIdx].halved = true;
  }

  return rows.map((m) => ({
    ...m,
    value: getResultValue(m, m.handicap, { lastPlaceHalf: cfg.lastPlaceHalf, halved: !!m.halved }),
  }));
}

function validateSelection(cfg, rows) {
  if (!rows.length) return false;
  if (cfg.mode === 'single') {
    return rows.length === cfg.pickCount;
  }
  if (cfg.mode === 'vote') {
    return rows.length === cfg.voteCount;
  }
  if (rows.length !== cfg.openGroups.length) return false;
  return cfg.openGroups.every((g) => rows.some((m) => Number(m.groupNo) === Number(g)));
}

function sortParticipantsForVote(a, b) {
  const roomDiff = Number(a?.room ?? 999) - Number(b?.room ?? 999);
  if (roomDiff) return roomDiff;
  const groupDiff = Number(a?.groupNo ?? getParticipantGroupNo(a) ?? 999) - Number(b?.groupNo ?? getParticipantGroupNo(b) ?? 999);
  if (groupDiff) return groupDiff;
  return String(a?.name ?? a?.nickname ?? '').localeCompare(String(b?.name ?? b?.nickname ?? ''), 'ko');
}

function buildVoteResult(eventDef, participants = [], inputsByEvent = {}, opt = {}) {
  const cfg = getPickLineupConfig(eventDef);
  const safeParticipants = Array.isArray(participants) ? participants : [];
  const roomNames = Array.isArray(opt.roomNames) ? opt.roomNames : [];
  const byId = new Map(safeParticipants.map((p) => [String(p?.id ?? ''), p]));
  const personBucket = inputsByEvent?.person && typeof inputsByEvent.person === 'object'
    ? inputsByEvent.person
    : {};

  const selectorRows = safeParticipants.map((selector) => {
    const selectorId = String(selector?.id ?? '');
    const ids = normalizeMemberIds(personBucket?.[selectorId]);
    const normalizedIds = Array.from({ length: cfg.voteCount }, (_, idx) => String(ids[idx] ?? '').trim());
    const complete = cfg.voteSlots.every((slot, idx) => {
      const selectedId = normalizedIds[idx];
      return !!selectedId && slot.candidateIds.includes(selectedId) && byId.has(selectedId);
    });
    return {
      id: selectorId,
      name: String(selector?.nickname || ''),
      room: selector?.room ?? null,
      roomLabel: getRoomLabel(roomNames, selector?.room),
      groupNo: getParticipantGroupNo(selector),
      ids: normalizedIds,
      complete,
    };
  });

  const voteSections = cfg.voteSlots.map((slot, slotIdx) => {
    const candidateIds = normalizeIdList(slot?.candidateIds || []);
    const rows = candidateIds
      .map((candidateId) => {
        const candidate = byId.get(String(candidateId));
        if (!candidate) return null;
        const voters = selectorRows
          .filter((selector) => String(selector?.ids?.[slotIdx] || '') === String(candidateId))
          .map((selector) => ({
            id: selector.id,
            name: selector.name,
            room: selector.room,
            roomLabel: selector.roomLabel,
            groupNo: selector.groupNo,
          }))
          .sort(sortParticipantsForVote);
        return {
          key: `${slotIdx}-${candidateId}`,
          candidateId: String(candidateId),
          name: String(candidate?.nickname || ''),
          room: candidate?.room ?? null,
          roomLabel: getRoomLabel(roomNames, candidate?.room),
          groupNo: getParticipantGroupNo(candidate),
          value: voters.length,
          score: voters.length,
          voteCount: voters.length,
          voters,
          voterNames: voters.map((voter) => voter.name),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        return (Number(b.voteCount) || 0) - (Number(a.voteCount) || 0)
          || Number(a.groupNo || 999) - Number(b.groupNo || 999)
          || String(a.name || '').localeCompare(String(b.name || ''), 'ko');
      });

    let previousCount = null;
    let currentRank = 0;
    rows.forEach((row, idx) => {
      const count = Number(row.voteCount || 0);
      if (idx === 0 || count !== previousCount) currentRank = idx + 1;
      row.rank = currentRank;
      row.displayRank = currentRank;
      previousCount = count;
    });

    return {
      key: `vote-${slotIdx + 1}`,
      index: slotIdx,
      title: String(slot?.title ?? '').trim() || `투표${slotIdx + 1}` ,
      candidateIds,
      rows,
      totalVotes: rows.reduce((sum, row) => sum + (Number(row.voteCount) || 0), 0),
    };
  });

  return {
    kind: 'vote',
    metric: 'votes',
    mode: 'vote',
    order: 'desc',
    rows: [],
    personRows: [],
    roomRows: [],
    voteSections,
    selectorRows,
    completedVoterCount: selectorRows.filter((row) => row.complete).length,
    totalVoterCount: selectorRows.length,
    config: cfg,
  };
}

export function computePickLineup(eventDef, participants = [], inputsByEvent = {}, opt = {}) {
  const cfg = getPickLineupConfig(eventDef);
  if (cfg.mode === 'vote') {
    return buildVoteResult(eventDef, participants, inputsByEvent, opt);
  }

  const roomNames = Array.isArray(opt.roomNames) ? opt.roomNames : [];
  const order = eventDef?.rankOrder === 'desc' ? 'desc' : 'asc';
  const handicapOverrides = (eventDef?.params?.handicapOverrides && typeof eventDef.params.handicapOverrides === 'object')
    ? eventDef.params.handicapOverrides
    : {};
  const sign = order === 'desc' ? -1 : 1;
  const byId = new Map((Array.isArray(participants) ? participants : []).map((p) => [String(p?.id), p]));
  const personBucket = inputsByEvent?.person || {};

  const rows = Object.entries(personBucket)
    .map(([selectorId, slot]) => {
      const selector = byId.get(String(selectorId));
      if (!selector) return null;

      const ids = normalizeMemberIds(slot)
        .map((x) => String(x ?? '').trim())
        .filter(Boolean);
      if (!ids.length) return null;

      const uniqueIds = [];
      const seen = new Set();
      ids.forEach((id) => {
        if (!seen.has(id)) {
          seen.add(id);
          uniqueIds.push(id);
        }
      });

      const membersBase = uniqueIds
        .map((id) => byId.get(String(id)))
        .filter(Boolean);

      let filteredMembers = membersBase;
      if (cfg.mode === 'jo') {
        filteredMembers = cfg.openGroups
          .map((groupNo) => membersBase.find((m) => Number(getParticipantGroupNo(m)) === Number(groupNo)))
          .filter(Boolean);
      } else {
        filteredMembers = membersBase.slice(0, cfg.pickCount);
      }

      const members = buildMemberRows(filteredMembers, cfg, handicapOverrides);
      if (!validateSelection(cfg, members)) return null;

      const total = members.reduce((sum, m) => sum + (Number(m.value) || 0), 0);
      const handicapSum = members.reduce((sum, m) => sum + (Number(m.handicap) || 0), 0);

      return {
        key: String(selectorId),
        selectorId: String(selectorId),
        name: String(selector?.nickname || ''),
        room: selector?.room ?? null,
        roomLabel: getRoomLabel(roomNames, selector?.room),
        value: total,
        score: total,
        handicapSum,
        members,
      };
    })
    .filter(Boolean);

  rows.sort((a, b) => {
    return sign * (a.value - b.value)
      || (a.handicapSum - b.handicapSum)
      || String(a.name).localeCompare(String(b.name), 'ko');
  });

  const roomNumbers = new Set();
  const safeRoomCount = Math.max(0, Number(opt.roomCount || 0) || 0);
  if (safeRoomCount > 0) {
    for (let r = 1; r <= safeRoomCount; r += 1) roomNumbers.add(r);
  }
  (Array.isArray(participants) ? participants : []).forEach((p) => {
    const roomNo = Number(p?.room);
    if (Number.isFinite(roomNo) && roomNo >= 1) roomNumbers.add(roomNo);
  });
  rows.forEach((row) => {
    const roomNo = Number(row?.room);
    if (Number.isFinite(roomNo) && roomNo >= 1) roomNumbers.add(roomNo);
  });

  const roomMap = new Map();
  Array.from(roomNumbers).sort((a, b) => a - b).forEach((roomNo) => {
    roomMap.set(roomNo, {
      key: `room-${roomNo}`,
      room: roomNo,
      name: getRoomLabel(roomNames, roomNo),
      value: 0,
      score: 0,
      count: 0,
      selectors: [],
    });
  });

  rows.forEach((row) => {
    const roomNo = Number(row?.room);
    if (!Number.isFinite(roomNo) || roomNo < 1) return;
    if (!roomMap.has(roomNo)) {
      roomMap.set(roomNo, {
        key: `room-${roomNo}`,
        room: roomNo,
        name: getRoomLabel(roomNames, roomNo),
        value: 0,
        score: 0,
        count: 0,
        selectors: [],
      });
    }
    const bucket = roomMap.get(roomNo);
    const value = Number(row?.value ?? row?.score ?? 0) || 0;
    bucket.value += value;
    bucket.score = bucket.value;
    bucket.count += 1;
    bucket.selectors.push(row);
  });

  const roomRows = Array.from(roomMap.values());
  roomRows.sort((a, b) => {
    return sign * ((Number(a.value) || 0) - (Number(b.value) || 0))
      || Number(a.room || 0) - Number(b.room || 0);
  });

  return {
    kind: 'person',
    metric: 'result',
    mode: cfg.mode,
    order,
    rows,
    personRows: rows,
    roomRows,
    config: cfg,
  };
}
