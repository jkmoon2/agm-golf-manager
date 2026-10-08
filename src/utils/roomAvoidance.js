// /src/utils/roomAvoidance.js
// 방조정: 참가자 ID 기준 양방향 같은 방 금지. 특별방으로 지정된 참가자는 검사에서 제외.
import { getSkillRoomParticipantIdSet } from './skillRoom';
export const normalizeRoomAvoidance = (raw, participants = [], skillRoomConfig = null) => {
  // 원본 방조정 페어는 Firestore에 그대로 보존합니다. 실제 배정 검사 시에만
  // 특별방 설정(enabled + 선택된 참가자 ID)에 해당하는 페어를 제외합니다.
  const specialIds = skillRoomConfig
    ? getSkillRoomParticipantIdSet(skillRoomConfig, { participants })
    : new Set();
  const valid = new Set((participants || []).map(p => String(p.id)));
  const seen = new Set();
  const pairs = [];
  (Array.isArray(raw?.pairs) ? raw.pairs : []).forEach(pair => {
    if (!Array.isArray(pair) || pair.length !== 2) return;
    const [a, b] = pair.map(String);
    if (a === b || !valid.has(a) || !valid.has(b)) return;
    if (specialIds.has(a) || specialIds.has(b)) return;
    const sorted = [a, b].sort();
    const key = JSON.stringify(sorted);
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push(sorted);
  });
  return { enabled: raw?.enabled === true, pairs };
};
export const avoidActive = cfg => !!(cfg?.enabled && cfg?.pairs?.length);
export const canShareRoom = (cfg, a, b) => !avoidActive(cfg) || !cfg.pairs.some(
  ([x, y]) => (x === String(a) && y === String(b)) || (y === String(a) && x === String(b))
);
export const canEnterRoom = (cfg, person, room, list, roomOf) =>
  (list || []).every(p => String(p.id) === String(person.id) || Number(roomOf(p)) !== Number(room) || canShareRoom(cfg, person.id, p.id));
export const getAvoidViolations = (cfg, list, roomOf) => (cfg?.pairs || []).filter(([a, b]) => {
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
