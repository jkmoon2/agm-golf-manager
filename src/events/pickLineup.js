// /src/events/pickLineup.js
// 개인/조/투표1/투표2 선택 대결 계산 유틸
// - 개인모드(single): 전체 참가자 중 1~4명 선택
// - 조모드(jo): 오픈된 각 조에서 1명씩 선택
// - 투표1모드(vote1): 운영자가 투표안별 구성 참가자를 지정하고, 각 참가자는 기본 1개 / 옵션 시 복수 투표안 선택
// - 투표2모드(vote2): 운영자가 투표별 후보 참가자를 지정하고, 각 참가자가 투표별 1명 선택
// - 기존 vote 값은 하위 호환을 위해 vote2로 해석
// - 개인/조/투표 결과값: 점수 - G핸디 = 결과
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
  const count = Math.max(1, Math.min(8, Number(voteCount || 1)));
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

export function isPickLineupVoteMode(mode) {
  return mode === 'vote1' || mode === 'vote2' || mode === 'vote';
}

export function makeVote1OptionToken(slotIdx) {
  return `vote1:${Math.max(0, Number(slotIdx) || 0)}`;
}

export function getVote1OptionIndexesFromIds(ids, voteCount = 8) {
  const limit = Math.max(1, Math.min(8, Number(voteCount || 8)));
  const seen = new Set();
  const out = [];
  (Array.isArray(ids) ? ids : []).forEach((value) => {
    const token = String(value ?? '').trim();
    const m = token.match(/^vote1:(\d+)$/);
    if (!m) return;
    const idx = Number(m[1]);
    if (!Number.isFinite(idx) || idx < 0 || idx >= limit || seen.has(idx)) return;
    seen.add(idx);
    out.push(idx);
  });
  return out;
}

export function getVote1OptionIndexFromIds(ids) {
  const indexes = getVote1OptionIndexesFromIds(ids, 8);
  return indexes.length ? indexes[0] : -1;
}

export function getPickLineupConfig(eventDef) {
  const params = eventDef?.params || {};
  const rawMode = String(params.mode || 'single');
  const mode = rawMode === 'jo'
    ? 'jo'
    : rawMode === 'vote1'
      ? 'vote1'
      : (rawMode === 'vote2' || rawMode === 'vote')
        ? 'vote2'
        : 'single';
  const pickCount = Math.max(1, Math.min(4, Number(params.pickCount || 1)));
  const voteCount = Math.max(1, Math.min(8, Number(params.voteCount || 1)));
  const openGroups = normalizeOpenGroups(params.openGroups);
  const voteSlots = normalizeVoteSlots(params.voteSlots, voteCount);
  const vote1CalcMethod = params.vote1CalcMethod === 'min' ? 'min' : 'sum';
  const vote1MultiSelect = !!params.vote1MultiSelect;
  const lastPlaceHalf = !!params.lastPlaceHalf;
  const selectionLocked = !!(params.selectionLocked || params.locked);
  const selectionRevealed = !!(params.selectionRevealed || params.revealed || params.publicSelection || params.showSelections);
  return {
    mode,
    pickCount,
    voteCount,
    voteSlots,
    vote1CalcMethod,
    vote1MultiSelect,
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
  // vote1 복수선택은 memberIds에 여러 vote1:N 토큰을 보관해야 하므로
  // 저장 배열 길이를 voteCount만큼 확보합니다. 완료 조건은 별도로 '1개 이상'입니다.
  if (cfg.mode === 'vote1') return cfg.vote1MultiSelect ? cfg.voteCount : 1;
  if (cfg.mode === 'vote2') return cfg.voteCount;
  return cfg.pickCount;
}

export function getPickLineupSlotLabels(eventDef) {
  const cfg = getPickLineupConfig(eventDef);
  if (cfg.mode === 'jo') return cfg.openGroups.map((groupNo) => `${groupNo}조`);
  if (cfg.mode === 'vote1' || cfg.mode === 'vote2') return cfg.voteSlots.map((slot, idx) => String(slot?.title ?? '').trim() || `투표${idx + 1}`);
  return Array.from({ length: cfg.pickCount }, (_, idx) => `선택${idx + 1}`);
}

export function getPickLineupCandidateIds(eventDef, slotIdx = 0) {
  const cfg = getPickLineupConfig(eventDef);
  if (cfg.mode !== 'vote1' && cfg.mode !== 'vote2') return [];
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

function hasScoreValue(p) {
  const raw = p?.score;
  return raw !== null && raw !== undefined && String(raw).trim() !== '' && Number.isFinite(Number(raw));
}

function getPlainParticipantResult(p, handicapOverrides = {}) {
  if (!p || !hasScoreValue(p)) return null;
  const baseHandicap = Number(p?.handicap ?? 0) || 0;
  const override = Number(handicapOverrides[String(p?.id ?? '')]);
  const handicap = Number.isFinite(override) ? override : baseHandicap;
  const score = Number(p?.score ?? 0) || 0;
  return score - handicap;
}

// 투표2는 경기 진행 중 점수 미입력 상태도 현재값으로 바로 순위에 반영해야 합니다.
// 점수 공란과 실제 0점은 계산상 동일하게 0으로 보고, 결과 = 0 - G핸디로 계산합니다.
// (투표1은 여러 구성원의 합계/최저값 계산이므로 기존 getPlainParticipantResult의
//  null 판정을 유지하여 미입력 인원 표시 기능을 그대로 사용합니다.)
function getVote2ParticipantResult(p, handicapOverrides = {}) {
  if (!p) return null;
  const baseHandicap = Number(p?.handicap ?? 0) || 0;
  const override = Number(handicapOverrides[String(p?.id ?? '')]);
  const handicap = Number.isFinite(override) ? override : baseHandicap;

  const rawScore = p?.score;
  const score = (rawScore === null || rawScore === undefined || String(rawScore).trim() === '')
    ? 0
    : Number(rawScore);
  if (!Number.isFinite(score)) return null;
  return score - handicap;
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
  if (cfg.mode === 'vote2') {
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

function sortVoteRowsByResult(rows, order = 'asc') {
  const sign = order === 'desc' ? -1 : 1;
  rows.sort((a, b) => {
    const aValid = a?.resultValue !== null && a?.resultValue !== undefined && Number.isFinite(Number(a.resultValue));
    const bValid = b?.resultValue !== null && b?.resultValue !== undefined && Number.isFinite(Number(b.resultValue));
    if (aValid !== bValid) return aValid ? -1 : 1;
    if (aValid && bValid) {
      const diff = sign * (Number(a.resultValue) - Number(b.resultValue));
      if (diff) return diff;
    }
    return Number(a?.groupNo || 999) - Number(b?.groupNo || 999)
      || String(a?.name || '').localeCompare(String(b?.name || ''), 'ko');
  });

  let previousResult = Symbol('none');
  let currentRank = 0;
  rows.forEach((row, idx) => {
    const result = row?.resultValue !== null && row?.resultValue !== undefined && Number.isFinite(Number(row.resultValue)) ? Number(row.resultValue) : null;
    if (result === null) {
      row.rank = '-';
      row.displayRank = '-';
      return;
    }
    if (idx === 0 || previousResult !== result) currentRank = idx + 1;
    row.rank = currentRank;
    row.displayRank = currentRank;
    previousResult = result;
  });
  return rows;
}

function buildVote2Result(eventDef, participants = [], inputsByEvent = {}, opt = {}) {
  const cfg = getPickLineupConfig(eventDef);
  const safeParticipants = Array.isArray(participants) ? participants : [];
  const roomNames = Array.isArray(opt.roomNames) ? opt.roomNames : [];
  const order = eventDef?.rankOrder === 'desc' ? 'desc' : 'asc';
  const handicapOverrides = (eventDef?.params?.handicapOverrides && typeof eventDef.params.handicapOverrides === 'object')
    ? eventDef.params.handicapOverrides
    : {};
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
        const resultValue = getVote2ParticipantResult(candidate, handicapOverrides);
        return {
          key: `${slotIdx}-${candidateId}`,
          candidateId: String(candidateId),
          name: String(candidate?.nickname || ''),
          room: candidate?.room ?? null,
          roomLabel: getRoomLabel(roomNames, candidate?.room),
          groupNo: getParticipantGroupNo(candidate),
          resultValue,
          value: resultValue,
          score: resultValue,
          voteCount: voters.length,
          voters,
          voterNames: voters.map((voter) => voter.name),
        };
      })
      .filter(Boolean);

    sortVoteRowsByResult(rows, order);

    return {
      key: `vote-${slotIdx + 1}`,
      index: slotIdx,
      title: String(slot?.title ?? '').trim() || `투표${slotIdx + 1}`,
      candidateIds,
      rows,
      totalVotes: rows.reduce((sum, row) => sum + (Number(row.voteCount) || 0), 0),
    };
  });

  return {
    kind: 'vote2',
    metric: 'result',
    mode: 'vote2',
    order,
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

function buildVote1Result(eventDef, participants = [], inputsByEvent = {}, opt = {}) {
  const cfg = getPickLineupConfig(eventDef);
  const safeParticipants = Array.isArray(participants) ? participants : [];
  const roomNames = Array.isArray(opt.roomNames) ? opt.roomNames : [];
  const order = eventDef?.rankOrder === 'desc' ? 'desc' : 'asc';
  const handicapOverrides = (eventDef?.params?.handicapOverrides && typeof eventDef.params.handicapOverrides === 'object')
    ? eventDef.params.handicapOverrides
    : {};
  const byId = new Map(safeParticipants.map((p) => [String(p?.id ?? ''), p]));
  const personBucket = inputsByEvent?.person && typeof inputsByEvent.person === 'object'
    ? inputsByEvent.person
    : {};

  const selectorRows = safeParticipants.map((selector) => {
    const selectorId = String(selector?.id ?? '');
    const ids = normalizeMemberIds(personBucket?.[selectorId]);
    const parsedIndexes = getVote1OptionIndexesFromIds(ids, cfg.voteCount);
    const selectedOptionIndexes = cfg.vote1MultiSelect ? parsedIndexes : parsedIndexes.slice(0, 1);
    const selectedOptionIdx = selectedOptionIndexes.length ? selectedOptionIndexes[0] : -1;
    const complete = selectedOptionIndexes.length > 0;
    return {
      id: selectorId,
      name: String(selector?.nickname || ''),
      room: selector?.room ?? null,
      roomLabel: getRoomLabel(roomNames, selector?.room),
      groupNo: getParticipantGroupNo(selector),
      ids: selectedOptionIndexes.map((idx) => makeVote1OptionToken(idx)),
      selectedOptionIdx,
      selectedOptionIndexes,
      complete,
    };
  });

  const optionRows = cfg.voteSlots.map((slot, slotIdx) => {
    const memberIds = normalizeIdList(slot?.candidateIds || []);
    const members = memberIds.map((id) => byId.get(String(id))).filter(Boolean);
    const memberRows = members.map((member) => ({
      id: String(member?.id ?? ''),
      name: String(member?.nickname || ''),
      resultValue: getPlainParticipantResult(member, handicapOverrides),
      room: member?.room ?? null,
      roomLabel: getRoomLabel(roomNames, member?.room),
      groupNo: getParticipantGroupNo(member),
    }));
    // 투표1 결과는 "현재 입력된 구성원 결과값"을 기준으로 즉시 집계합니다.
    // 기존에는 구성원 중 단 1명이라도 점수 미입력(resultValue=null)이면 전체 결과를 '-'
    // 처리했기 때문에, 일부 참가자의 점수가 아직 비어 있는 테스트/진행중 상황에서는
    // 모든 투표안의 결과/순위가 사라져 보였습니다.
    // → 유효한 결과값만 합계/최저값에 반영하고, 미입력 인원은 별도 카운트로 보관합니다.
    //    이후 점수가 입력되면 scores 실시간 overlay에 의해 자동 재계산됩니다.
    const readyMemberRows = memberRows.filter(
      (member) => member.resultValue !== null
        && member.resultValue !== undefined
        && Number.isFinite(Number(member.resultValue))
    );
    const readyMemberCount = readyMemberRows.length;
    const missingMemberCount = Math.max(0, memberRows.length - readyMemberCount);
    const allReady = memberRows.length > 0 && missingMemberCount === 0;

    let resultValue = null;
    if (readyMemberRows.length > 0) {
      if (cfg.vote1CalcMethod === 'min') {
        resultValue = Math.min(...readyMemberRows.map((member) => Number(member.resultValue)));
      } else {
        resultValue = readyMemberRows.reduce((sum, member) => sum + Number(member.resultValue), 0);
      }
    }
    const voters = selectorRows
      .filter((selector) => Array.isArray(selector.selectedOptionIndexes) && selector.selectedOptionIndexes.includes(slotIdx))
      .map((selector) => ({
        id: selector.id,
        name: selector.name,
        room: selector.room,
        roomLabel: selector.roomLabel,
        groupNo: selector.groupNo,
      }))
      .sort(sortParticipantsForVote);

    return {
      key: `vote1-option-${slotIdx + 1}`,
      index: slotIdx,
      title: String(slot?.title ?? '').trim() || `투표${slotIdx + 1}`,
      name: String(slot?.title ?? '').trim() || `투표${slotIdx + 1}`,
      memberIds,
      members: memberRows,
      readyMemberCount,
      missingMemberCount,
      allReady,
      resultValue,
      value: resultValue,
      score: resultValue,
      voteCount: voters.length,
      voters,
      voterNames: voters.map((voter) => voter.name),
    };
  });

  sortVoteRowsByResult(optionRows, order);

  return {
    kind: 'vote1',
    metric: 'result',
    mode: 'vote1',
    order,
    rows: optionRows,
    optionRows,
    voteSections: [{
      key: 'vote1-options',
      index: 0,
      title: cfg.vote1CalcMethod === 'min' ? '투표안 결과 (구성원 중 최저 결과)' : '투표안 결과 (구성원 결과 합계)',
      rows: optionRows,
      totalVotes: optionRows.reduce((sum, row) => sum + (Number(row.voteCount) || 0), 0),
    }],
    selectorRows,
    completedVoterCount: selectorRows.filter((row) => row.complete).length,
    totalVoterCount: selectorRows.length,
    config: cfg,
  };
}

export function computePickLineup(eventDef, participants = [], inputsByEvent = {}, opt = {}) {
  const cfg = getPickLineupConfig(eventDef);
  if (cfg.mode === 'vote1') {
    return buildVote1Result(eventDef, participants, inputsByEvent, opt);
  }
  if (cfg.mode === 'vote2') {
    return buildVote2Result(eventDef, participants, inputsByEvent, opt);
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
