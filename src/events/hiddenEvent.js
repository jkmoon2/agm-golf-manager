// /src/events/hiddenEvent.js
// 히든 이벤트 계산/정규화 유틸
// - 개인: 참가자가 비밀 상대를 1명 선택, 조 차이에 따른 추가 G핸디를 본인에게만 ± 적용
// - 포볼: 운영자가 A/B 그룹 조합 기준으로 2인 1팀을 무작위 배정, 공개 전까지 참가자에게 비공개

import { getParticipantGroupNo } from './pickLineup';

export function defaultHiddenEventParams() {
  return {
    mode: 'personal', // personal | fourball
    fourballMode: 'random', // random | self | select
    revealed: false,
    handicapSteps: {
      '1-2': 3,
      '2-3': 3,
      '3-4': 3,
      same: 0,
    },
    pairGroups: {
      A: [1, 2],
      B: [3, 4],
    },
    selectionLocked: false,
    personalPoints: {
      win: 1,
      lose: 0,
      draw: 0.5,
      mutual: 0,
      upward: 1,
      downward: 1,
    },
    // 포볼 점수 방식: rank(순위점수) | converted(환산점수)
    pointType: 'rank',
    // 포볼 지목전에서 내 조를 제외한 참가자만 후보로 노출(기본 체크)
    excludeSameGroupTargets: true,
    // 개인 1대1에서 같은 조 참가자만 상대 후보로 허용
    sameGroupOnly: false,
    sameGroupTargetOnly: false,
    sameGroupTargetsOnly: false,
    onlySameGroup: false,
    sameGroup: false,
    targetScope: 'all', // all | sameGroup
    // 개인 1대1에서 상대방별 지목받는 횟수 제한
    // - targetLimitMode: unlimited | personal
    // - targetLimits: { [participantId]: number }
    targetLimitMode: 'unlimited',
    targetLimits: {},
    handicapOverrides: {},
  };
}

function clampGroupNo(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 4 ? n : NaN;
}

function normalizeStepValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizePointValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeHiddenPersonalPoints(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  return {
    win: normalizePointValue(src.win ?? src.winPoint ?? src.winner ?? src.WIN, 1),
    lose: normalizePointValue(src.lose ?? src.losePoint ?? src.loser ?? src.LOSE, 0),
    draw: normalizePointValue(src.draw ?? src.drawPoint ?? src.tie ?? src.DRAW, 0.5),
    mutual: normalizePointValue(src.mutual ?? src.mutualPoint ?? src.match ?? src.MUTUAL, 0),
    upward: normalizePointValue(src.upward ?? src.upwardPoint ?? src.upSelect ?? src.upper ?? src.UPWARD, 1),
    downward: normalizePointValue(src.downward ?? src.downwardPoint ?? src.downSelect ?? src.lower ?? src.DOWNWARD, 1),
  };
}

function normalizeHiddenHandicapOverrides(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  Object.entries(src).forEach(([key, value]) => {
    const n = Number(value);
    if (String(key || '') && Number.isFinite(n)) out[String(key)] = n;
  });
  return out;
}

function normalizeHiddenTargetLimits(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  Object.entries(src).forEach(([key, value]) => {
    const n = Number(value);
    if (String(key || '') && Number.isFinite(n) && n >= 0) out[String(key)] = Math.floor(n);
  });
  return out;
}

function getHiddenParticipantHandicap(participant, params) {
  const cfg = normalizeHiddenEventParams(params);
  const pid = String(participant?.id ?? '');
  if (pid && Object.prototype.hasOwnProperty.call(cfg.handicapOverrides || {}, pid)) {
    const n = Number(cfg.handicapOverrides[pid]);
    if (Number.isFinite(n)) return n;
  }
  return Number(participant?.handicap ?? 0) || 0;
}

export function normalizeHiddenHandicapSteps(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  return {
    '1-2': normalizeStepValue(src['1-2'] ?? src['1_2'] ?? src.g12 ?? src.step12 ?? 3),
    '2-3': normalizeStepValue(src['2-3'] ?? src['2_3'] ?? src.g23 ?? src.step23 ?? 3),
    '3-4': normalizeStepValue(src['3-4'] ?? src['3_4'] ?? src.g34 ?? src.step34 ?? 3),
    same: normalizeStepValue(src.same ?? src.sameGroup ?? src['same-group'] ?? src.sameStep ?? 0),
  };
}

export function normalizeHiddenPairGroups(raw) {
  const def = defaultHiddenEventParams().pairGroups;
  const src = (raw && typeof raw === 'object') ? raw : {};
  const normalizeList = (value) => {
    const arr = Array.isArray(value) ? value : [];
    return Array.from(new Set(arr.map(clampGroupNo).filter(Number.isFinite))).sort((a, b) => a - b);
  };

  let A = normalizeList(src.A || src.a || src.groupA || src.teamA);
  let B = normalizeList(src.B || src.b || src.groupB || src.teamB);
  if (!A.length && !B.length) {
    A = [...def.A];
    B = [...def.B];
  } else if (A.length && !B.length) {
    B = [1, 2, 3, 4].filter((g) => !A.includes(g));
  } else if (!A.length && B.length) {
    A = [1, 2, 3, 4].filter((g) => !B.includes(g));
  }

  const aSet = new Set(A);
  B = B.filter((g) => !aSet.has(g));
  if (!A.length || !B.length) return { A: [...def.A], B: [...def.B] };
  return { A, B };
}

export function normalizeHiddenEventParams(raw) {
  const base = defaultHiddenEventParams();
  const src = (raw && typeof raw === 'object') ? raw : {};
  const rawMode = String(src.mode || 'personal');
  const mode = ['fourball', 'fourball-random', 'fourball-self', 'fourball-select'].includes(rawMode) ? 'fourball' : 'personal';
  let fourballMode = 'random';
  if (mode === 'fourball') {
    const rawFourballMode = String(src.fourballMode || src.assignMode || '').toLowerCase();
    if (rawFourballMode === 'select' || rawMode === 'fourball-select') fourballMode = 'select';
    else if (rawFourballMode === 'self' || rawMode === 'fourball-self') fourballMode = 'self';
    else fourballMode = 'random';
  }
  const pointType = ['converted', 'rank'].includes(src.pointType) ? src.pointType : base.pointType;
  const excludeSameGroupTargets = src.excludeSameGroupTargets === false || src.excludeOwnGroupTargets === false || src.allowSameGroupTargets === true ? false : true;
  return {
    ...base,
    ...src,
    mode,
    fourballMode,
    revealed: !!src.revealed,
    handicapSteps: normalizeHiddenHandicapSteps(src.handicapSteps),
    pairGroups: normalizeHiddenPairGroups(src.pairGroups),
    selectionLocked: !!(src.selectionLocked || src.locked),
    personalPoints: normalizeHiddenPersonalPoints(src.personalPoints || src.points),
    pointType,
    excludeSameGroupTargets,
    excludeOwnGroupTargets: excludeSameGroupTargets,
    allowSameGroupTargets: !excludeSameGroupTargets,
    sameGroupOnly: !!(src.sameGroupOnly || src.sameGroupTargetOnly || src.sameGroupTargetsOnly || src.onlySameGroup || src.sameGroup || String(src.targetScope || '').toLowerCase() === 'samegroup' || String(src.opponentScope || '').toLowerCase() === 'samegroup' || src.targetScope === '같은조' || src.opponentScope === '같은조'),
    sameGroupTargetOnly: !!(src.sameGroupOnly || src.sameGroupTargetOnly || src.sameGroupTargetsOnly || src.onlySameGroup || src.sameGroup || String(src.targetScope || '').toLowerCase() === 'samegroup' || String(src.opponentScope || '').toLowerCase() === 'samegroup' || src.targetScope === '같은조' || src.opponentScope === '같은조'),
    sameGroupTargetsOnly: !!(src.sameGroupOnly || src.sameGroupTargetOnly || src.sameGroupTargetsOnly || src.onlySameGroup || src.sameGroup || String(src.targetScope || '').toLowerCase() === 'samegroup' || String(src.opponentScope || '').toLowerCase() === 'samegroup' || src.targetScope === '같은조' || src.opponentScope === '같은조'),
    onlySameGroup: !!(src.sameGroupOnly || src.sameGroupTargetOnly || src.sameGroupTargetsOnly || src.onlySameGroup || src.sameGroup || String(src.targetScope || '').toLowerCase() === 'samegroup' || String(src.opponentScope || '').toLowerCase() === 'samegroup' || src.targetScope === '같은조' || src.opponentScope === '같은조'),
    sameGroup: !!(src.sameGroupOnly || src.sameGroupTargetOnly || src.sameGroupTargetsOnly || src.onlySameGroup || src.sameGroup || String(src.targetScope || '').toLowerCase() === 'samegroup' || String(src.opponentScope || '').toLowerCase() === 'samegroup' || src.targetScope === '같은조' || src.opponentScope === '같은조'),
    targetScope: (src.sameGroupOnly || src.sameGroupTargetOnly || src.sameGroupTargetsOnly || src.onlySameGroup || src.sameGroup || String(src.targetScope || '').toLowerCase() === 'samegroup' || String(src.opponentScope || '').toLowerCase() === 'samegroup' || src.targetScope === '같은조' || src.opponentScope === '같은조') ? 'sameGroup' : 'all',
    opponentScope: (src.sameGroupOnly || src.sameGroupTargetOnly || src.sameGroupTargetsOnly || src.onlySameGroup || src.sameGroup || String(src.targetScope || '').toLowerCase() === 'samegroup' || String(src.opponentScope || '').toLowerCase() === 'samegroup' || src.targetScope === '같은조' || src.opponentScope === '같은조') ? 'sameGroup' : 'all',
    targetLimitMode: (src.targetLimitMode === 'personal' || src.limitMode === 'personal') ? 'personal' : 'unlimited',
    targetLimits: normalizeHiddenTargetLimits(src.targetLimits || src.receiveLimits || src.targetReceiveLimits),
    handicapOverrides: normalizeHiddenHandicapOverrides(src.handicapOverrides),
  };
}

export function getHiddenEventMetaText(params) {
  const cfg = normalizeHiddenEventParams(params);
  if (cfg.mode === 'fourball') {
    const method = cfg.fourballMode === 'select' ? '참가자 직접지목' : (cfg.fourballMode === 'self' ? '참가자 무작위배정' : '운영자 무작위');
    return `hidden-event · 포볼(${method}) · A그룹 ${cfg.pairGroups.A.join('+')}조 / B그룹 ${cfg.pairGroups.B.join('+')}조 · ${cfg.revealed ? '공개' : '비공개'} · ${cfg.selectionLocked ? '마감' : '진행중'}`;
  }
  return `hidden-event · 개인 1대1 · ${cfg.revealed ? '공개' : '비공개'} · ${cfg.selectionLocked ? '마감' : '진행중'}`;
}

export function getHiddenHandicapAdjustment(selector, opponent, params) {
  const cfg = normalizeHiddenEventParams(params);
  const from = clampGroupNo(getParticipantGroupNo(selector));
  const to = clampGroupNo(getParticipantGroupNo(opponent));
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return 0;

  const low = Math.min(from, to);
  const high = Math.max(from, to);
  let total = 0;
  for (let g = low; g < high; g += 1) {
    total += normalizeStepValue(cfg.handicapSteps[`${g}-${g + 1}`]);
  }

  // 높은 번호 조가 낮은 번호 조를 선택하면 본인 G핸디 +@, 반대는 -@
  return from > to ? total : -total;
}


export function getHiddenFourballDirectHandicapAdjustment(selector, opponent, params) {
  const cfg = normalizeHiddenEventParams(params);
  const from = clampGroupNo(getParticipantGroupNo(selector));
  const to = clampGroupNo(getParticipantGroupNo(opponent));
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  if (from === to) return normalizeStepValue(cfg.handicapSteps?.same ?? 0);
  return getHiddenHandicapAdjustment(selector, opponent, cfg);
}

export function getHiddenSelectionPointDelta(selector, opponent, status, params) {
  const cfg = normalizeHiddenEventParams(params);
  const points = normalizeHiddenPersonalPoints(cfg.personalPoints);
  const from = clampGroupNo(getParticipantGroupNo(selector));
  const to = clampGroupNo(getParticipantGroupNo(opponent));
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return { kind: '', value: 0 };

  // 조간 추가 G핸디 합계가 0이면 해당 조간 상향/하향 보너스/패널티는 반영하지 않음
  const adjustment = getHiddenHandicapAdjustment(selector, opponent, cfg);
  if (!adjustment) return { kind: from > to ? 'upward' : 'downward', value: 0 };

  if (from > to && status === 'win') {
    return { kind: 'upward', value: normalizePointValue(points.upward, 0) };
  }
  if (from < to && status === 'lose') {
    return { kind: 'downward', value: -normalizePointValue(points.downward, 0) };
  }
  return { kind: from > to ? 'upward' : 'downward', value: 0 };
}

export function getHiddenOpponentId(slot) {
  if (!slot || typeof slot !== 'object') return '';
  if (slot.opponentId != null) return String(slot.opponentId || '');
  if (slot.targetId != null) return String(slot.targetId || '');
  if (Array.isArray(slot.memberIds) && slot.memberIds[0] != null) return String(slot.memberIds[0] || '');
  return '';
}

function resultValue(p, handicapOverride = null) {
  const score = Number(p?.score ?? 0) || 0;
  const baseHandicap = Number(p?.handicap ?? 0) || 0;
  const handicap = Number.isFinite(Number(handicapOverride)) ? Number(handicapOverride) : baseHandicap;
  return score - handicap;
}

function hiddenResultValue(p, params, handicapOverride = null) {
  const score = Number(p?.score ?? 0) || 0;
  const baseHandicap = getHiddenParticipantHandicap(p, params);
  const handicap = Number.isFinite(Number(handicapOverride)) ? Number(handicapOverride) : baseHandicap;
  return score - handicap;
}

function roomLabel(roomNames = [], roomNo) {
  const n = Number(roomNo);
  if (!Number.isFinite(n) || n < 1) return '-';
  return (Array.isArray(roomNames) && roomNames[n - 1] && String(roomNames[n - 1]).trim()) ? String(roomNames[n - 1]).trim() : `${n}번방`;
}

function seededRandom(seedText) {
  let h = 2166136261;
  const text = String(seedText || `agm-hidden-event-${Date.now()}`);
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

function shuffle(items, seedText) {
  const out = [...(Array.isArray(items) ? items : [])];
  const rnd = seededRandom(seedText);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function assignHiddenFourballPairs(participants = [], params = {}, existingPairs = {}) {
  const cfg = normalizeHiddenEventParams(params);
  const groups = cfg.pairGroups;
  const safeParticipants = Array.isArray(participants) ? participants : [];
  const byId = new Map(safeParticipants.map((p) => [String(p?.id ?? ''), p]));
  const sideOf = (p) => {
    const g = clampGroupNo(getParticipantGroupNo(p));
    if (groups.A.includes(g)) return 'A';
    if (groups.B.includes(g)) return 'B';
    return '';
  };

  // 기존 배정팀이 있으면 먼저 유지하고, 남은 참가자만 무작위 배정한다.
  const pairs = {};
  const paired = new Set();
  const normalizedExisting = normalizeHiddenFourballPairs(existingPairs);
  Object.entries(normalizedExisting).forEach(([aId, bId]) => {
    const aKey = String(aId || '');
    const bKey = String(bId || '');
    if (!aKey || !bKey || paired.has(aKey) || paired.has(bKey)) return;
    const a = byId.get(aKey);
    const b = byId.get(bKey);
    const aSide = sideOf(a);
    const bSide = sideOf(b);
    if (!a || !b || !aSide || !bSide || aSide === bSide) return;
    pairs[aKey] = bKey;
    pairs[bKey] = aKey;
    paired.add(aKey);
    paired.add(bKey);
  });

  const seedBase = `agm-hidden-${Date.now()}-${Math.random()}`;
  const aList = shuffle(safeParticipants.filter((p) => sideOf(p) === 'A' && !paired.has(String(p?.id ?? ''))), `${seedBase}-A`);
  const bList = shuffle(safeParticipants.filter((p) => sideOf(p) === 'B' && !paired.has(String(p?.id ?? ''))), `${seedBase}-B`);
  const count = Math.min(aList.length, bList.length);
  for (let i = 0; i < count; i += 1) {
    const aId = String(aList[i]?.id ?? '');
    const bId = String(bList[i]?.id ?? '');
    if (!aId || !bId) continue;
    pairs[aId] = bId;
    pairs[bId] = aId;
    paired.add(aId);
    paired.add(bId);
  }
  return pairs;
}

export function normalizeHiddenFourballPairs(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const pairs = {};
  Object.entries(src).forEach(([a, b]) => {
    const aId = String(a || '');
    const bId = String(b || '');
    if (!aId || !bId || aId === bId) return;
    pairs[aId] = bId;
  });
  Object.entries({ ...pairs }).forEach(([a, b]) => {
    if (!pairs[String(b)]) pairs[String(b)] = String(a);
  });
  return pairs;
}

export function getHiddenFourballPairsFromPerson(personSlot = {}) {
  const src = (personSlot && typeof personSlot === 'object') ? personSlot : {};
  const pairs = {};
  Object.entries(src).forEach(([selectorId, slot]) => {
    const opponentId = getHiddenOpponentId(slot);
    const aId = String(selectorId || '');
    const bId = String(opponentId || '');
    if (!aId || !bId || aId === bId) return;
    pairs[aId] = bId;
    if (!pairs[bId]) pairs[bId] = aId;
  });
  return normalizeHiddenFourballPairs(pairs);
}

export function getHiddenFourballDirectSelectionsFromPerson(personSlot = {}) {
  const src = (personSlot && typeof personSlot === 'object') ? personSlot : {};
  const selections = {};
  Object.entries(src).forEach(([selectorId, slot]) => {
    const opponentId = getHiddenOpponentId(slot);
    const aId = String(selectorId || '');
    const bId = String(opponentId || '');
    if (!aId || !bId || aId === bId) return;
    selections[aId] = bId;
  });
  return selections;
}

function buildPersonalRows(eventDef, participants = [], inputsSlot = {}, opt = {}) {
  const cfg = normalizeHiddenEventParams(eventDef?.params);
  const byId = new Map((Array.isArray(participants) ? participants : []).map((p) => [String(p?.id), p]));
  const person = (inputsSlot?.person && typeof inputsSlot.person === 'object') ? inputsSlot.person : {};
  const roomNames = Array.isArray(opt.roomNames) ? opt.roomNames : [];

  const points = normalizeHiddenPersonalPoints(cfg.personalPoints);
  const matchRows = Object.entries(person).map(([selectorId, slot]) => {
    const selector = byId.get(String(selectorId));
    const opponentId = getHiddenOpponentId(slot);
    const opponent = byId.get(String(opponentId));
    if (!selector || !opponent) return null;
    const adjustment = getHiddenHandicapAdjustment(selector, opponent, cfg);
    const selectorBaseHandicap = getHiddenParticipantHandicap(selector, cfg);
    const selectorEffectiveHandicap = selectorBaseHandicap + adjustment;
    const opponentHandicap = getHiddenParticipantHandicap(opponent, cfg);
    const selectorValue = hiddenResultValue(selector, cfg, selectorEffectiveHandicap);
    const opponentValue = hiddenResultValue(opponent, cfg, opponentHandicap);
    const status = selectorValue < opponentValue ? 'win' : selectorValue > opponentValue ? 'lose' : 'draw';
    const opponentSelectionId = getHiddenOpponentId(person[String(opponentId)] || {});
    const mutual = String(opponentSelectionId || '') === String(selectorId || '');
    const basePoint = status === 'win' ? points.win : status === 'draw' ? points.draw : points.lose;
    const mutualDelta = mutual && status === 'win' ? points.mutual : mutual && status === 'lose' ? -points.mutual : 0;
    const selectionDelta = getHiddenSelectionPointDelta(selector, opponent, status, cfg);
    const point = basePoint + mutualDelta + (Number(selectionDelta.value) || 0);
    return {
      key: `${selectorId}-${opponentId}`,
      selectorId: String(selectorId),
      opponentId: String(opponentId),
      name: String(selector?.nickname || ''),
      opponentName: String(opponent?.nickname || ''),
      room: Number(selector?.room ?? 0) || 0,
      roomLabel: roomLabel(roomNames, selector?.room),
      selectorGroup: getParticipantGroupNo(selector),
      opponentGroup: getParticipantGroupNo(opponent),
      baseHandicap: selectorBaseHandicap,
      adjustment,
      effectiveHandicap: selectorEffectiveHandicap,
      opponentHandicap,
      score: Number(selector?.score ?? 0) || 0,
      opponentScore: Number(opponent?.score ?? 0) || 0,
      value: selectorValue,
      opponentValue,
      point,
      basePoint,
      mutualPoint: mutualDelta,
      selectionPointKind: selectionDelta.kind,
      selectionPoint: Number(selectionDelta.value) || 0,
      mutual,
      status,
      resultText: status === 'win' ? '승' : status === 'lose' ? '패' : '무',
      detailText: `${selectorValue} : ${opponentValue}`,
    };
  }).filter(Boolean);

  const rankOrder = String(eventDef?.rankOrder || cfg.rankOrder || 'desc') === 'asc' ? 'asc' : 'desc';
  matchRows.sort((a, b) => {
    const pointDiff = rankOrder === 'asc' ? (a.point - b.point) : (b.point - a.point);
    if (pointDiff) return pointDiff;
    if (a.value !== b.value) return a.value - b.value;
    return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
  });

  const personRows = matchRows.map((row, idx) => ({
    ...row,
    rank: idx + 1,
    label: `${row.name} vs ${row.opponentName}`,
  }));

  return { kind: 'person', mode: 'personal', revealed: cfg.revealed, matchRows, personRows };
}

function buildFourballRows(eventDef, participants = [], inputsSlot = {}, opt = {}) {
  const cfg = normalizeHiddenEventParams(eventDef?.params);
  const byId = new Map((Array.isArray(participants) ? participants : []).map((p) => [String(p?.id), p]));
  const roomNames = Array.isArray(opt.roomNames) ? opt.roomNames : [];
  const roomCount = Number(opt.roomCount || 0) || Math.max(0, ...(Array.isArray(participants) ? participants : []).map((p) => Number(p?.room || p?.roomNumber || 0) || 0));
  const pointType = cfg.pointType === 'converted' ? 'converted' : 'rank';
  const rankOrder = String(eventDef?.rankOrder || cfg.rankOrder || 'asc') === 'desc' ? 'desc' : 'asc';
  const rows = [];

  const pushTeam = (aId, bId, keyPrefix = '') => {
    const aKey = String(aId || '');
    const bKey = String(bId || '');
    if (!aKey || !bKey || aKey === bKey) return;
    const a = byId.get(aKey);
    const b = byId.get(bKey);
    if (!a || !b) return;
    const aScore = Number(a?.score ?? 0) || 0;
    const bScore = Number(b?.score ?? 0) || 0;
    const scoreSum = aScore + bScore;
    const aHandicap = getHiddenParticipantHandicap(a, cfg);
    const bHandicap = getHiddenParticipantHandicap(b, cfg);
    const handicapSum = aHandicap + bHandicap;
    const directAdjustment = cfg.fourballMode === 'select' ? getHiddenFourballDirectHandicapAdjustment(a, b, cfg) : 0;
    // 최종결과값 = 팀별 참가자 합산점수 - 팀 G합 + 직접지목 조간 보정
    // 직접 2인팀 지목은 개인 1대1과 반대로 적용: 낮은조→높은조 선택 시 감산, 높은조→낮은조 선택 시 가산
    const value = scoreSum - handicapSum + directAdjustment;
    rows.push({
      key: `${keyPrefix}${aKey}-${bKey}`,
      memberIds: [aKey, bKey],
      selectorId: aKey,
      opponentId: bKey,
      label: `${a?.nickname || '-'} + ${b?.nickname || '-'}`,
      value,
      scoreSum,
      handicapSum,
      directAdjustment,
      members: [a, b].map((p) => ({
        id: String(p?.id ?? ''),
        name: String(p?.nickname || ''),
        room: Number(p?.room ?? 0) || 0,
        roomLabel: roomLabel(roomNames, p?.room),
        group: getParticipantGroupNo(p),
        score: Number(p?.score ?? 0) || 0,
        handicap: getHiddenParticipantHandicap(p, cfg),
        baseHandicap: Number(p?.handicap ?? 0) || 0,
        resultValue: hiddenResultValue(p, cfg),
      })),
    });
  };

  if (cfg.fourballMode === 'select') {
    const selections = getHiddenFourballDirectSelectionsFromPerson(inputsSlot?.person || {});
    Object.entries(selections).forEach(([aId, bId]) => {
      const aKey = String(aId || '');
      const bKey = String(bId || '');
      if (!aKey || !bKey) return;
      // 참가자 직접 2인팀 지목은 선택자가 독립적으로 본인 기준 포볼팀을 갖는다.
      // 따라서 상대가 다른 사람에게 선택되었거나 직접 선택했더라도 중복 제거하지 않는다.
      pushTeam(aKey, bKey, 'select-');
    });
  } else if (cfg.fourballMode === 'self') {
    const personPairs = getHiddenFourballPairsFromPerson(inputsSlot?.person || {});
    const sharedPairs = normalizeHiddenFourballPairs(inputsSlot?.shared?.hiddenFourballPairs || inputsSlot?.shared?.pairs || {});
    const pairs = normalizeHiddenFourballPairs({ ...sharedPairs, ...personPairs });
    const seen = new Set();
    Object.entries(pairs).forEach(([aId, bId]) => {
      const aKey = String(aId || '');
      const bKey = String(bId || '');
      if (!aKey || !bKey || seen.has(aKey) || seen.has(bKey)) return;
      seen.add(aKey);
      seen.add(bKey);
      pushTeam(aKey, bKey, 'self-');
    });
  } else {
    const pairs = normalizeHiddenFourballPairs(inputsSlot?.shared?.hiddenFourballPairs || inputsSlot?.shared?.pairs || {});
    const seen = new Set();
    Object.entries(pairs).forEach(([aId, bId]) => {
      const aKey = String(aId || '');
      const bKey = String(bId || '');
      if (!aKey || !bKey || seen.has(aKey) || seen.has(bKey)) return;
      seen.add(aKey);
      seen.add(bKey);
      pushTeam(aKey, bKey);
    });
  }

  rows.sort((a, b) => {
    if (a.value !== b.value) return rankOrder === 'desc' ? (b.value - a.value) : (a.value - b.value);
    if (a.handicapSum !== b.handicapSum) return a.handicapSum - b.handicapSum;
    return String(a.label || '').localeCompare(String(b.label || ''), 'ko');
  });

  let prevKey = '';
  let rank = 0;
  rows.forEach((row, idx) => {
    const rankKey = `${row.value}|${row.handicapSum}`;
    if (idx === 0 || rankKey !== prevKey) {
      rank = idx + 1;
      prevKey = rankKey;
    }
    row.rank = rank;
  });
  const validCount = rows.filter((row) => Number.isFinite(Number(row.value))).length;
  rows.forEach((row) => {
    row.rankScore = row.rank || null;
    row.convertedScore = row.rank ? Math.max(0, validCount - row.rank + 1) : null;
    row.eventScore = pointType === 'converted' ? row.convertedScore : row.rankScore;
    row.pointType = pointType;
  });

  const roomMap = new Map();
  for (let r = 1; r <= roomCount; r += 1) {
    roomMap.set(r, { key: String(r), room: r, label: roomLabel(roomNames, r), value: 0, teamCount: 0, teams: [] });
  }
  rows.forEach((row) => {
    const firstRoom = Number(row?.members?.[0]?.room ?? 0) || Number(row?.members?.[1]?.room ?? 0) || 0;
    if (!Number.isFinite(firstRoom) || firstRoom < 1) return;
    if (!roomMap.has(firstRoom)) roomMap.set(firstRoom, { key: String(firstRoom), room: firstRoom, label: roomLabel(roomNames, firstRoom), value: 0, teamCount: 0, teams: [] });
    const bucket = roomMap.get(firstRoom);
    bucket.value += Number(row.eventScore ?? 0) || 0;
    bucket.teamCount += 1;
    bucket.teams.push(row);
  });
  const roomRows = Array.from(roomMap.values())
    .filter((row) => row.teamCount > 0 || roomCount > 0)
    .sort((a, b) => {
      const diff = a.value - b.value;
      if (diff) return diff;
      return a.room - b.room;
    })
    .map((row, idx) => ({ ...row, rank: idx + 1 }));

  const pairMap = cfg.fourballMode === 'select'
    ? getHiddenFourballDirectSelectionsFromPerson(inputsSlot?.person || {})
    : (cfg.fourballMode === 'self'
      ? normalizeHiddenFourballPairs({
          ...normalizeHiddenFourballPairs(inputsSlot?.shared?.hiddenFourballPairs || inputsSlot?.shared?.pairs || {}),
          ...getHiddenFourballPairsFromPerson(inputsSlot?.person || {}),
        })
      : normalizeHiddenFourballPairs(inputsSlot?.shared?.hiddenFourballPairs || inputsSlot?.shared?.pairs || {}));
  return { kind: 'team', mode: 'fourball', fourballMode: cfg.fourballMode, revealed: cfg.revealed, pairMap, pointType, teamRows: rows, roomRows };
}

export function computeHiddenEvent(eventDef, participants = [], inputsSlot = {}, opt = {}) {
  const cfg = normalizeHiddenEventParams(eventDef?.params);
  if (cfg.mode === 'fourball') return buildFourballRows(eventDef, participants, inputsSlot, opt);
  return buildPersonalRows(eventDef, participants, inputsSlot, opt);
}
