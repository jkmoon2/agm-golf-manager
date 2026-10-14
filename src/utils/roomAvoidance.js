// /src/utils/roomAvoidance.js
// 방조정: 참가자 ID 기준 양방향 같은 방 금지. 특별방으로 지정된 참가자는 검사에서 제외.
import { getSkillRoomParticipantIdSet } from './skillRoom';
export const normalizeRoomAvoidance = (raw, participants = [], skillRoomConfig = null) => {
  // 원본 방조정 페어는 Firestore에 그대로 보존합니다. 실제 배정 검사 시에만
  // 특별방 설정(enabled + 선택된 참가자 ID)에 해당하는 페어를 제외합니다.
  const includeSpecialRooms = raw?.includeSpecialRooms === true;
  const specialIds = skillRoomConfig && !includeSpecialRooms
    ? getSkillRoomParticipantIdSet(skillRoomConfig, { participants })
    : new Set();
  const valid = new Set((participants || []).map(p => String(p.id)));
  const seen = new Set();
  const pairs = [];
  (Array.isArray(raw?.pairs) ? raw.pairs : []).forEach(pair => {
    // Firestore 저장형({a,b}) 및 구버전 메모리형([a,b]) 모두 읽기
    const entries = Array.isArray(pair) ? pair : (pair && typeof pair === 'object' ? [pair.a, pair.b] : []);
    if (entries.length !== 2 || entries.some(v => v == null)) return;
    const [a, b] = entries.map(String);
    if (a === b || !valid.has(a) || !valid.has(b)) return;
    if (specialIds.has(a) || specialIds.has(b)) return;
    const sorted = [a, b].sort();
    const key = JSON.stringify(sorted);
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push(sorted);
  });
  const sameRoomPairs = [];
  const togetherSeen = new Set();
  (Array.isArray(raw?.sameRoomPairs) ? raw.sameRoomPairs : []).forEach(pair => {
    const values = Array.isArray(pair) ? pair : (pair && typeof pair === 'object' ? [pair.a, pair.b] : []);
    if (values.length !== 2 || values.some(v => v == null)) return;
    const [a, b] = values.map(String).sort();
    if (a === b || !valid.has(a) || !valid.has(b) || togetherSeen.has(`${a}|${b}`)) return;
    if (specialIds.has(a) || specialIds.has(b)) return;
    togetherSeen.add(`${a}|${b}`);
    sameRoomPairs.push([a, b]);
  });
  const roomSelections = [];
  const seenSelections = new Set();
  (Array.isArray(raw?.roomSelections) ? raw.roomSelections : []).forEach(item => {
    const id = String(item?.id ?? '');
    const room = Number(item?.room);
    if (!valid.has(id) || specialIds.has(id) || !Number.isInteger(room) || room < 1 || seenSelections.has(id)) return;
    seenSelections.add(id);
    roomSelections.push({ id, room });
  });
  return { enabled: raw?.enabled === true, includeSpecialRooms, pairs,
    sameRoomEnabled: raw?.sameRoomEnabled === true, sameRoomPairs,
    roomSelectionEnabled: raw?.roomSelectionEnabled === true, roomSelections };
};
export const avoidActive = cfg => !!(cfg?.enabled && cfg?.pairs?.length);
export const roomConstraintsActive = cfg => !!(avoidActive(cfg) ||
  (cfg?.sameRoomEnabled && cfg?.sameRoomPairs?.length) ||
  (cfg?.roomSelectionEnabled && cfg?.roomSelections?.length));
export const requiredRoom = (cfg, id) => cfg?.roomSelectionEnabled
  ? cfg.roomSelections.find(x => x.id === String(id))?.room ?? null : null;
export const getRoomConstraintIssues = (cfg, participants = [], roomCount = Infinity) => {
  const issues = [];
  const byId = new Map(participants.map(p => [String(p.id), p]));
  if (cfg?.roomSelectionEnabled) for (const x of cfg.roomSelections || []) {
    if (x.room > roomCount) issues.push(`${byId.get(x.id)?.nickname || x.id}: 존재하지 않는 방`);
  }
  if (cfg?.sameRoomEnabled) for (const [a,b] of cfg.sameRoomPairs || []) {
    if (cfg.enabled && !canShareRoom(cfg,a,b)) issues.push(`${byId.get(a)?.nickname || a} ↔ ${byId.get(b)?.nickname || b}: 금지-페어와 한방-페어 중복`);
    const ra = requiredRoom(cfg,a), rb = requiredRoom(cfg,b);
    if (ra != null && rb != null && ra !== rb) issues.push(`${byId.get(a)?.nickname || a} ↔ ${byId.get(b)?.nickname || b}: 서로 다른 지정 방`);
    const pa=byId.get(a), pb=byId.get(b);
    if (pa && pb && Number(pa.group) === Number(pb.group) && Number(pa.group) !== 0)
      issues.push(`${pa.nickname} ↔ ${pb.nickname}: 같은 조 참가자는 기존 일반방 규칙으로 같은 방 배정 불가`);
  }
  return issues;
};
export const canShareRoom = (cfg, a, b) => !avoidActive(cfg) || !cfg.pairs.some(
  ([x, y]) => (x === String(a) && y === String(b)) || (y === String(a) && x === String(b))
);
export const canEnterRoom = (cfg, person, room, list, roomOf) => {
  const id = String(person.id), dest = Number(room);
  const pinned = requiredRoom(cfg, id);
  if (pinned != null && pinned !== dest) return false;
  if (!(list || []).every(p => String(p.id) === id || Number(roomOf(p)) !== dest || canShareRoom(cfg, id, p.id))) return false;
  if (cfg?.sameRoomEnabled) for (const [a,b] of cfg.sameRoomPairs || []) {
    if (a !== id && b !== id) continue;
    const other = (list || []).find(p => String(p.id) === (a === id ? b : a));
    if (!other) continue;
    const r = roomOf(other);
    if (r != null && Number(r) > 0 && Number(r) !== dest) return false;
    const otherPinned = requiredRoom(cfg, other.id);
    if (otherPinned != null && otherPinned !== dest) return false;
  }
  return true;
};
export const getConstraintViolations = (cfg, list, roomOf) => {
  const violations = getAvoidViolations(cfg, list, roomOf).map(pair => ({ kind: 'avoid', pair }));
  if (cfg?.roomSelectionEnabled) for (const {id, room} of cfg.roomSelections || []) {
    const p = list.find(x => String(x.id) === id);
    if (p && roomOf(p) != null && Number(roomOf(p)) > 0 && Number(roomOf(p)) !== room)
      violations.push({ kind:'room', id });
  }
  if (cfg?.sameRoomEnabled) for (const [a,b] of cfg.sameRoomPairs || []) {
    const x = list.find(p => String(p.id) === a), y = list.find(p => String(p.id) === b);
    if (x && y && roomOf(x) != null && roomOf(y) != null && Number(roomOf(x)) > 0 && Number(roomOf(y)) > 0 && Number(roomOf(x)) !== Number(roomOf(y)))
      violations.push({ kind:'same', pair:[a,b] });
  }
  return violations;
};
export const getAvoidViolations = (cfg, list, roomOf) => (avoidActive(cfg) ? cfg.pairs : []).filter(([a, b]) => {
  const x = list.find(p => String(p.id) === a);
  const y = list.find(p => String(p.id) === b);
  const r = x && roomOf(x);
  return x && y && r != null && Number(r) === Number(roomOf(y));
});
export const shuffleAvoid = list => {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
// 충돌 페어가 있을 때만 기존 랜덤을 대체하는 무작위 백트래킹.
// 기존 배정은 고정, 후보는 호출부에서 기존 조/정원/특별방 규칙으로 결정.
export const solveAvoidance = (initial, targets, candidateRooms, assign, limit = 80000) => {
  let visited = 0;
  const recurse = (list, remaining) => {
    if (!remaining.length) return list;
    if (++visited > limit) return null;
    const options = remaining.map(p => ({ p, rooms: shuffleAvoid(candidateRooms(p, list)) }));
    options.sort((a, b) => a.rooms.length - b.rooms.length);
    const { p, rooms } = options[0];
    if (!rooms.length) return null;
    for (const r of rooms) {
      const next = recurse(assign(list, p, r), remaining.filter(x => String(x.id) !== String(p.id)));
      if (next) return next;
    }
    return null;
  };
  return recurse(initial, shuffleAvoid(targets));
};

// Firestore는 배열 내부에 배열을 저장할 수 없으므로 저장 경계에서만 객체 배열로 변환.
// 배정/검사 함수는 기존 [a,b] 메모리 형태를 그대로 사용합니다.
export const toFirestoreRoomAvoidance = (raw, participants = []) => {
  const normalized = normalizeRoomAvoidance(raw, participants);
  return {
    enabled: normalized.enabled,
    includeSpecialRooms: normalized.includeSpecialRooms,
    pairs: normalized.pairs.map(([a, b]) => ({ a, b })),
    sameRoomEnabled: normalized.sameRoomEnabled,
    sameRoomPairs: normalized.sameRoomPairs.map(([a,b]) => ({a,b})),
    roomSelectionEnabled: normalized.roomSelectionEnabled,
    roomSelections: normalized.roomSelections.map(({id,room}) => ({id,room}))
  };
};

// [2026-10-09] 스트로크 전체 잔여 배정 가능성 검사.
// 한 명의 선택 후 모든 미배정 참가자가 들어갈 방이 남는 후보만 반환합니다.
// candidateRooms는 호출부의 기존 조/정원/특별방 제한을 그대로 활용합니다.
export const feasibleStrokeRooms = (initial, person, candidateRooms, assign, limit = 200000) => {
  const identity = p => String(p.id);
  const pending = (initial || []).filter(p => {
    const assigned = p?.room !== undefined && p?.room !== null && p?.room !== '' ? p.room : p?.roomNumber;
    return p && String(p.nickname || '').trim() && !(Number(assigned) >= 1);
  });
  const candidates = shuffleAvoid(candidateRooms(person, initial));
  const rest = pending.filter(p => identity(p) !== identity(person));
  const feasible = [];
  for (const room of candidates) {
    const withPerson = assign(initial, person, room);
    if (!rest.length || solveAvoidance(withPerson, rest, candidateRooms, assign, limit)) feasible.push(room);
  }
  return feasible;
};
