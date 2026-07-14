// /src/events/rankScoreGame.js
// 순위 점수 게임 계산 유틸
// - 기준: 결과값(점수-G핸디), 보정 결과값(점수-G핸디+보정치), 참가자 직접 순위 입력
// - 동점: 동일 순위, 다음 순위는 건너뛰는 competition rank 방식(1/2/2/4/5)
// - 점수: 환산점수(N-rank+1) 또는 순위점수(rank)
// - 게임: 참가자 선택형 포볼 2인팀 / 방대방

export function defaultRankScoreGameParams() {
  return {
    rankingSource: 'result',       // result | adjusted | manual
    pointType: 'converted',        // converted | rank
    gameType: 'room',              // randomPair | directPair | room
    winnerOrder: 'desc',           // desc(높은 점수 승) | asc(낮은 점수 승)
    adjustments: {},               // { [participantId]: number }
    pairGroups: { A: [1, 2], B: [3, 4] }, // 포볼게임 A/B 그룹 조합
    selfPickSide: 'A',             // randomPair: 포볼선택 버튼 사용 그룹(A|B)
    directExcludeSameGroupTargets: true, // directPair: 본인 조 제외 여부
    calculationMethod: 'add',      // add | subtract | multiply | divide
    roomRankSlots: [1, 4],         // 방대방 계산 시 방 내부 순위 중 선택할 2개 위치
    roomAddTarget: 'all',          // add일 때 all(방 전체) | slots(기준순위 2명)
    randomSeed: '',
    // 관리자 '히든/배정/취소' 메뉴에서 포볼팀 공개 여부 제어
    revealed: true,
  };
}


export function normalizeRankScorePairGroups(raw) {
  const defaultGroups = { A: [1, 2], B: [3, 4] };
  const src = (raw && typeof raw === 'object') ? raw : {};
  const normalizeList = (value) => {
    const arr = Array.isArray(value) ? value : [];
    return Array.from(new Set(arr.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 4))).sort((a, b) => a - b);
  };

  let a = normalizeList(src.A || src.a || src.teamA || src.groupA);
  let b = normalizeList(src.B || src.b || src.teamB || src.groupB);

  if (!a.length && !b.length) {
    a = [...defaultGroups.A];
    b = [...defaultGroups.B];
  } else if (a.length && !b.length) {
    b = [1, 2, 3, 4].filter((n) => !a.includes(n));
  } else if (!a.length && b.length) {
    a = [1, 2, 3, 4].filter((n) => !b.includes(n));
  }

  const aSet = new Set(a);
  b = b.filter((n) => !aSet.has(n));

  if (!a.length || !b.length) {
    return { A: [...defaultGroups.A], B: [...defaultGroups.B] };
  }
  return { A: a, B: b };
}

export function getRankScorePairGroupLabel(pairGroups, side) {
  const groups = normalizeRankScorePairGroups(pairGroups);
  const arr = side === 'B' ? groups.B : groups.A;
  return `${side}그룹 (${arr.join('+')}조)`;
}

export function normalizeRankScoreGameParams(raw) {
  const base = defaultRankScoreGameParams();
  const src = (raw && typeof raw === 'object') ? raw : {};
  const rankingSource = ['result', 'adjusted', 'manual'].includes(src.rankingSource) ? src.rankingSource : base.rankingSource;
  const pointType = ['converted', 'rank'].includes(src.pointType) ? src.pointType : base.pointType;
  const gameType = ['randomPair', 'directPair', 'room'].includes(src.gameType) ? src.gameType : base.gameType;
  const winnerOrder = ['asc', 'desc'].includes(src.winnerOrder) ? src.winnerOrder : base.winnerOrder;
  const pairGroups = normalizeRankScorePairGroups(src.pairGroups);
  const calculationMethod = ['add', 'subtract', 'multiply', 'divide'].includes(src.calculationMethod) ? src.calculationMethod : base.calculationMethod;
  const roomAddTarget = ['all', 'slots'].includes(src.roomAddTarget) ? src.roomAddTarget : base.roomAddTarget;
  const roomRankSlotsRaw = Array.isArray(src.roomRankSlots) ? src.roomRankSlots : base.roomRankSlots;
  let roomRankSlots = Array.from(new Set(roomRankSlotsRaw.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 4))).slice(0, 2);
  if (roomRankSlots.length < 2) roomRankSlots = [...base.roomRankSlots];
  roomRankSlots.sort((a, b) => a - b);
  const adjustments = {};
  if (src.adjustments && typeof src.adjustments === 'object') {
    Object.entries(src.adjustments).forEach(([key, value]) => {
      const n = Number(value);
      if (Number.isFinite(n) && n !== 0) adjustments[String(key)] = n;
    });
  }
  return {
    ...base,
    ...src,
    rankingSource,
    pointType,
    gameType,
    winnerOrder,
    adjustments,
    pairGroups,
    calculationMethod,
    roomRankSlots,
    roomAddTarget,
    randomSeed: String(src.randomSeed || ''),
    selfPickSide: src.selfPickSide === 'B' ? 'B' : (src.selfPickSide === 'both' ? 'both' : base.selfPickSide),
    directExcludeSameGroupTargets: src.directExcludeSameGroupTargets === false || src.excludeSameGroupTargets === false ? false : true,
    revealed: src.revealed === false || src.hidden === true ? false : true,
  };
}

function asNum(value) {
  if (value === '' || value == null) return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function fmtRoomLabel(roomNo, roomNames = []) {
  const idx = Number(roomNo) - 1;
  const name = Array.isArray(roomNames) ? roomNames[idx] : '';
  if (String(name || '').trim()) return String(name).trim();
  return Number.isFinite(Number(roomNo)) && Number(roomNo) >= 1 ? `${roomNo}번방` : '-';
}

function seededRandom(seedText) {
  let h = 2166136261;
  const text = String(seedText || 'agm-rank-score-game');
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return function next() {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleStable(items, seedText) {
  const next = [...items];
  const rnd = seededRandom(seedText);
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
  }
  return next;
}

function assignCompetitionRanks(rows, valueKey = 'rankValue', order = 'asc') {
  const valid = rows
    .filter((row) => Number.isFinite(Number(row?.[valueKey])))
    .sort((a, b) => {
      const av = Number(a?.[valueKey]);
      const bv = Number(b?.[valueKey]);
      const diff = order === 'desc' ? (bv - av) : (av - bv);
      if (diff) return diff;
      return String(a?.name || a?.label || '').localeCompare(String(b?.name || b?.label || ''), 'ko');
    });

  const rankByKey = new Map();
  let prev = null;
  let rank = 0;
  valid.forEach((row, idx) => {
    const val = Number(row?.[valueKey]);
    if (idx === 0) {
      rank = 1;
      prev = val;
    } else if (val !== prev) {
      rank = idx + 1;
      prev = val;
    }
    rankByKey.set(String(row.key), rank);
  });
  return rankByKey;
}

function getManualRankValue(inputsSlot, pid) {
  const person = (inputsSlot?.person && typeof inputsSlot.person === 'object') ? inputsSlot.person : {};
  const raw = person[String(pid)];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (raw.rank != null) return asNum(raw.rank);
    if (Array.isArray(raw.values)) return asNum(raw.values[0]);
  }
  return asNum(raw);
}

function buildPersonRows(eventDef, participants = [], inputsSlot = {}, roomNames = []) {
  const params = normalizeRankScoreGameParams(eventDef?.params);
  const safeParticipants = Array.isArray(participants) ? participants : [];
  const baseRows = safeParticipants.map((p, idx) => {
    const pid = String(p?.id ?? idx);
    const score = asNum(p?.score);
    const handicap = asNum(p?.handicap);
    const safeScore = Number.isFinite(score) ? score : 0;
    const safeHandicap = Number.isFinite(handicap) ? handicap : 0;
    const resultValue = safeScore - safeHandicap;
    const adjustment = Number(params.adjustments?.[pid] ?? 0) || 0;
    const adjustedValue = resultValue + adjustment;
    const manualValue = getManualRankValue(inputsSlot, pid);
    const rankValue = params.rankingSource === 'manual'
      ? manualValue
      : (params.rankingSource === 'adjusted' ? adjustedValue : resultValue);
    const roomNo = Number(p?.room ?? p?.roomNumber ?? 0) || 0;

    return {
      key: pid,
      id: pid,
      name: String(p?.nickname || ''),
      room: roomNo,
      roomLabel: fmtRoomLabel(roomNo, roomNames),
      score: safeScore,
      handicap: safeHandicap,
      resultValue,
      adjustment,
      adjustedValue,
      manualValue,
      rankValue,
      rank: null,
      convertedScore: null,
      rankScore: null,
      eventScore: null,
      valid: Number.isFinite(rankValue),
    };
  });

  const validCount = baseRows.filter((row) => row.valid).length;
  const rankByKey = assignCompetitionRanks(baseRows, 'rankValue', 'asc');

  const withRanks = baseRows.map((row) => {
    const rank = rankByKey.get(String(row.key)) || null;
    const convertedScore = rank ? Math.max(0, validCount - rank + 1) : null;
    const rankScore = rank || null;
    const eventScore = params.pointType === 'rank' ? rankScore : convertedScore;
    return {
      ...row,
      rank,
      convertedScore,
      rankScore,
      eventScore,
    };
  });

  return withRanks;
}

function calculateRankScoreValues(values = [], method = 'add') {
  const nums = (Array.isArray(values) ? values : [])
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  const safeMethod = ['add', 'subtract', 'multiply', 'divide'].includes(method) ? method : 'add';
  if (safeMethod === 'multiply') {
    return nums.reduce((acc, n) => acc * n, 1);
  }
  if (safeMethod === 'subtract' || safeMethod === 'divide') {
    if (nums.length < 2) return nums[0];
    const sorted = [...nums].sort((a, b) => b - a);
    const big = sorted[0];
    const small = sorted[1];
    if (safeMethod === 'divide') {
      if (small === 0) return null;
      return big / small;
    }
    return big - small;
  }
  return nums.reduce((acc, n) => acc + n, 0);
}

function sortRoomMembersByResult(members = []) {
  return [...(Array.isArray(members) ? members : [])]
    .filter((row) => Number.isFinite(Number(row?.resultValue)))
    .sort((a, b) => {
      const resultDiff = Number(a.resultValue) - Number(b.resultValue);
      if (resultDiff) return resultDiff;
      const handicapDiff = Number(a.handicap || 0) - Number(b.handicap || 0);
      if (handicapDiff) return handicapDiff;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
    });
}

function sortByWinner(rows = [], params) {
  const order = params.winnerOrder === 'asc' ? 'asc' : 'desc';
  const valid = [];
  const invalid = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const raw = row?.value;
    const hasValue = raw !== '' && raw != null && Number.isFinite(Number(raw));
    if (hasValue) valid.push(row);
    else invalid.push(row);
  });
  valid.sort((a, b) => {
    const av = Number(a.value);
    const bv = Number(b.value);
    const diff = order === 'asc' ? (av - bv) : (bv - av);
    if (diff) return diff;
    return String(a.name || a.label || '').localeCompare(String(b.name || b.label || ''), 'ko');
  });
  const rankMap = assignCompetitionRanks(valid.map((row) => ({ ...row, rankTarget: Number(row.value) })), 'rankTarget', order);
  return [...valid.map((row) => ({ ...row, displayRank: rankMap.get(String(row.key)) || null })), ...invalid.map((row) => ({ ...row, displayRank: null }))];
}

export function computeRankScoreGame(eventDef, participants = [], inputsSlot = {}, options = {}) {
  const params = normalizeRankScoreGameParams({ ...(eventDef?.params || {}), winnerOrder: eventDef?.rankOrder || eventDef?.params?.winnerOrder });
  const roomNames = Array.isArray(options?.roomNames) ? options.roomNames : [];
  const roomCount = Number(options?.roomCount || 0) || Math.max(0, ...(Array.isArray(participants) ? participants : []).map((p) => Number(p?.room || p?.roomNumber || 0) || 0));
  const personBaseRows = buildPersonRows(eventDef, participants, inputsSlot, roomNames);

  const personRows = sortByWinner(personBaseRows.map((row) => ({
    ...row,
    value: row.eventScore,
  })), params);

  const byId = new Map(personBaseRows.map((row) => [String(row.id), row]));

  const pairMap = normalizeRankScorePairs(inputsSlot?.shared?.rankScorePairs);
  const directPairMap = normalizeRankScoreDirectPairs(inputsSlot?.shared?.rankScoreDirectPairs || inputsSlot?.shared?.rankScoreSelectPairs);

  const roomRows = sortByWinner(Array.from({ length: Math.max(0, roomCount) }, (_, idx) => {
    const roomNo = idx + 1;
    const members = personBaseRows.filter((row) => Number(row.room) === roomNo);
    const rankedMembers = sortRoomMembersByResult(members);
    const useAllRoomMembers = params.calculationMethod === 'add' && params.roomAddTarget !== 'slots';
    const selectedMembers = useAllRoomMembers
      ? rankedMembers
      : (params.roomRankSlots || [])
        .map((slotNo) => rankedMembers[Number(slotNo) - 1])
        .filter(Boolean);
    const values = selectedMembers.map((row) => row.eventScore);
    const completeSelected = selectedMembers.length && selectedMembers.every((row) => Number.isFinite(Number(row?.eventScore)));
    return {
      key: String(roomNo),
      room: roomNo,
      name: fmtRoomLabel(roomNo, roomNames),
      label: fmtRoomLabel(roomNo, roomNames),
      value: completeSelected ? calculateRankScoreValues(values, params.calculationMethod) : null,
      members,
      selectedMembers,
      selectedMode: useAllRoomMembers ? 'all' : 'slots',
      memberCount: members.length,
      validCount: selectedMembers.filter((row) => Number.isFinite(Number(row?.eventScore))).length,
    };
  }), params);

  const pairedIds = new Set();
  const teamBaseRows = [];

  if (params.gameType === 'directPair') {
    Object.entries(directPairMap).forEach(([selectorId, partnerId]) => {
      const aKey = String(selectorId);
      const bKey = String(partnerId);
      if (!aKey || !bKey || aKey === bKey) return;
      const a = byId.get(aKey);
      const b = byId.get(bKey);
      if (!a || !b) return;
      const members = [a, b];
      const label = members.map((row) => row.name).filter(Boolean).join(' + ') || `팀${teamBaseRows.length + 1}`;
      const values = members.map((row) => row.eventScore);
      const completeMembers = members.every((row) => Number.isFinite(Number(row?.eventScore)));
      teamBaseRows.push({
        key: `direct-${aKey}-${bKey}`,
        selectorId: aKey,
        partnerId: bKey,
        label,
        name: label,
        value: completeMembers ? calculateRankScoreValues(values, params.calculationMethod) : null,
        members,
        roomLabel: a.roomLabel || members.map((row) => row.roomLabel).filter(Boolean).join(' / '),
      });
    });
  } else {
    Object.entries(pairMap).forEach(([aId, bId]) => {
      const aKey = String(aId);
      const bKey = String(bId);
      if (!aKey || !bKey) return;
      if (pairedIds.has(aKey) || pairedIds.has(bKey)) return;
      const a = byId.get(aKey);
      const b = byId.get(bKey);
      if (!a || !b) return;
      pairedIds.add(aKey);
      pairedIds.add(bKey);
      const members = [a, b];
      const label = members.map((row) => row.name).filter(Boolean).join(' + ') || `팀${teamBaseRows.length + 1}`;
      const values = members.map((row) => row.eventScore);
      const completeMembers = members.every((row) => Number.isFinite(Number(row?.eventScore)));
      teamBaseRows.push({
        key: `pair-${aKey}-${bKey}`,
        label,
        name: label,
        value: completeMembers ? calculateRankScoreValues(values, params.calculationMethod) : null,
        members,
        roomLabel: members.map((row) => row.roomLabel).filter(Boolean).join(' / '),
      });
    });
  }

  const teamRows = sortByWinner(teamBaseRows, params);

  return {
    params,
    personRows,
    roomRows,
    teamRows,
    personBaseRows,
  };
}

export function getRankScoreGameTarget(params) {
  const safe = normalizeRankScoreGameParams(params);
  if (safe.gameType === 'randomPair' || safe.gameType === 'directPair') return 'team';
  return 'room';
}

export function normalizeRankScorePairs(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  Object.entries(src).forEach(([key, value]) => {
    const a = String(key || '').trim();
    const b = String(value || '').trim();
    if (!a || !b || a === b) return;
    out[a] = b;
    out[b] = a;
  });
  return out;
}

export function normalizeRankScoreDirectPairs(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  Object.entries(src).forEach(([key, value]) => {
    const selectorId = String(key || '').trim();
    let partnerRaw = value;
    if (partnerRaw && typeof partnerRaw === 'object' && !Array.isArray(partnerRaw)) {
      partnerRaw = partnerRaw.partnerId ?? partnerRaw.opponentId ?? partnerRaw.targetId ?? partnerRaw.id;
    }
    const partnerId = String(partnerRaw || '').trim();
    if (!selectorId || !partnerId || selectorId === partnerId) return;
    out[selectorId] = partnerId;
  });
  return out;
}

export function getRankScoreGroupSide(participant, params = null) {
  const n = Number(participant?.group ?? participant?.groupNo ?? participant?.groupNumber ?? participant?.jo ?? participant?.joNo);
  if (!Number.isFinite(n)) return '';
  const groups = normalizeRankScorePairGroups(params?.pairGroups || params);
  if (groups.A.includes(n)) return 'A';
  if (groups.B.includes(n)) return 'B';
  return '';
}

export function getRankScoreGameMetaText(params) {
  const safe = normalizeRankScoreGameParams(params);
  const sourceText = safe.rankingSource === 'manual' ? '참가자 직접 순위' : safe.rankingSource === 'adjusted' ? '보정 결과값' : '결과값';
  const pointText = safe.pointType === 'rank' ? '순위점수' : '환산점수';
  const gameText = safe.gameType === 'randomPair'
    ? `포볼 게임(${getRankScorePairGroupLabel(safe.pairGroups, 'A')} ↔ ${getRankScorePairGroupLabel(safe.pairGroups, 'B')})`
    : (safe.gameType === 'directPair' ? '포볼 게임(선택)' : '방대방 게임');
  const calcTextMap = { add: '더하기', subtract: '빼기', multiply: '곱하기', divide: '나누기' };
  const calcText = calcTextMap[safe.calculationMethod] || '더하기';
  const revealText = safe.revealed === false ? '비공개' : '공개';
  return `rank-score · ${sourceText} · ${pointText} · ${gameText} · 계산 ${calcText} · ${revealText}`;
}
