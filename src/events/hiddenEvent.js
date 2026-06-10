// /src/events/hiddenEvent.js
// 히든 이벤트 계산/정규화 유틸
// - 개인: 참가자가 비밀 상대를 1명 선택, 조 차이에 따른 추가 G핸디를 본인에게만 ± 적용
// - 포볼: 운영자가 A/B 그룹 조합 기준으로 2인 1팀을 무작위 배정, 공개 전까지 참가자에게 비공개

import { getParticipantGroupNo } from './pickLineup';

export function defaultHiddenEventParams() {
  return {
    mode: 'personal', // personal | fourball
    fourballMode: 'random', // random | self
    revealed: false,
    handicapSteps: {
      '1-2': 3,
      '2-3': 3,
      '3-4': 3,
    },
    pairGroups: {
      A: [1, 2],
      B: [3, 4],
    },
    selectionLocked: false,
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

export function normalizeHiddenHandicapSteps(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  return {
    '1-2': normalizeStepValue(src['1-2'] ?? src['1_2'] ?? src.g12 ?? src.step12 ?? 3),
    '2-3': normalizeStepValue(src['2-3'] ?? src['2_3'] ?? src.g23 ?? src.step23 ?? 3),
    '3-4': normalizeStepValue(src['3-4'] ?? src['3_4'] ?? src.g34 ?? src.step34 ?? 3),
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
  const mode = rawMode === 'fourball' || rawMode === 'fourball-select' ? 'fourball' : 'personal';
  const fourballMode = mode === 'fourball' && (src.fourballMode === 'self' || src.assignMode === 'self' || rawMode === 'fourball-select') ? 'self' : 'random';
  return {
    ...base,
    ...src,
    mode,
    fourballMode,
    revealed: !!src.revealed,
    handicapSteps: normalizeHiddenHandicapSteps(src.handicapSteps),
    pairGroups: normalizeHiddenPairGroups(src.pairGroups),
    selectionLocked: !!(src.selectionLocked || src.locked),
  };
}

export function getHiddenEventMetaText(params) {
  const cfg = normalizeHiddenEventParams(params);
  if (cfg.mode === 'fourball') {
    const method = cfg.fourballMode === 'self' ? '참가자 무작위배정' : '운영자 무작위';
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

function buildPersonalRows(eventDef, participants = [], inputsSlot = {}, opt = {}) {
  const cfg = normalizeHiddenEventParams(eventDef?.params);
  const byId = new Map((Array.isArray(participants) ? participants : []).map((p) => [String(p?.id), p]));
  const person = (inputsSlot?.person && typeof inputsSlot.person === 'object') ? inputsSlot.person : {};
  const roomNames = Array.isArray(opt.roomNames) ? opt.roomNames : [];

  const matchRows = Object.entries(person).map(([selectorId, slot]) => {
    const selector = byId.get(String(selectorId));
    const opponentId = getHiddenOpponentId(slot);
    const opponent = byId.get(String(opponentId));
    if (!selector || !opponent) return null;
    const adjustment = getHiddenHandicapAdjustment(selector, opponent, cfg);
    const selectorBaseHandicap = Number(selector?.handicap ?? 0) || 0;
    const selectorEffectiveHandicap = selectorBaseHandicap + adjustment;
    const opponentHandicap = Number(opponent?.handicap ?? 0) || 0;
    const selectorValue = resultValue(selector, selectorEffectiveHandicap);
    const opponentValue = resultValue(opponent, opponentHandicap);
    const status = selectorValue < opponentValue ? 'win' : selectorValue > opponentValue ? 'lose' : 'draw';
    const point = status === 'win' ? 1 : status === 'draw' ? 0.5 : 0;
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
      status,
      resultText: status === 'win' ? '승' : status === 'lose' ? '패' : '무',
      detailText: `${selectorValue} : ${opponentValue}`,
    };
  }).filter(Boolean);

  matchRows.sort((a, b) => {
    if (b.point !== a.point) return b.point - a.point;
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
    const handicapSum = (Number(a?.handicap ?? 0) || 0) + (Number(b?.handicap ?? 0) || 0);
    // 최종결과값 = 팀별 참가자 합산점수 - 팀 G합
    const value = scoreSum - handicapSum;
    rows.push({
      key: `${keyPrefix}${aKey}-${bKey}`,
      memberIds: [aKey, bKey],
      selectorId: aKey,
      opponentId: bKey,
      label: `${a?.nickname || '-'} + ${b?.nickname || '-'}`,
      value,
      scoreSum,
      handicapSum,
      members: [a, b].map((p) => ({
        id: String(p?.id ?? ''),
        name: String(p?.nickname || ''),
        room: Number(p?.room ?? 0) || 0,
        roomLabel: roomLabel(roomNames, p?.room),
        group: getParticipantGroupNo(p),
        score: Number(p?.score ?? 0) || 0,
        handicap: Number(p?.handicap ?? 0) || 0,
        resultValue: resultValue(p),
      })),
    });
  };

  if (cfg.fourballMode === 'self') {
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
    if (a.value !== b.value) return a.value - b.value;
    if (a.handicapSum !== b.handicapSum) return a.handicapSum - b.handicapSum;
    return String(a.label || '').localeCompare(String(b.label || ''), 'ko');
  });
  rows.forEach((row, idx) => { row.rank = idx + 1; });
  const pairMap = cfg.fourballMode === 'self'
    ? normalizeHiddenFourballPairs({
        ...normalizeHiddenFourballPairs(inputsSlot?.shared?.hiddenFourballPairs || inputsSlot?.shared?.pairs || {}),
        ...getHiddenFourballPairsFromPerson(inputsSlot?.person || {}),
      })
    : normalizeHiddenFourballPairs(inputsSlot?.shared?.hiddenFourballPairs || inputsSlot?.shared?.pairs || {});
  return { kind: 'team', mode: 'fourball', fourballMode: cfg.fourballMode, revealed: cfg.revealed, pairMap, teamRows: rows };
}

export function computeHiddenEvent(eventDef, participants = [], inputsSlot = {}, opt = {}) {
  const cfg = normalizeHiddenEventParams(eventDef?.params);
  if (cfg.mode === 'fourball') return buildFourballRows(eventDef, participants, inputsSlot, opt);
  return buildPersonalRows(eventDef, participants, inputsSlot, opt);
}
