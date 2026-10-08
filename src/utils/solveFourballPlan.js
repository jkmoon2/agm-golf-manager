// /src/utils/solveFourballPlan.js
// 방조정 사용 시 포볼 전체 완성 가능성을 먼저 확인합니다.
// 기존에 확정된 배정은 유지하고, 모든 후보 선택은 Fisher-Yates 무작위 순서로 탐색합니다.
import { canEnterRoom, canShareRoom, shuffleAvoid } from './roomAvoidance';

export function solveFourballPlan(initial, {
  avoidance, roomCount, capacityOf, roomOf, partnerOf,
  isLeader, isPartner, specialIds = new Set(), allowedRooms,
  forceLeaderId = null, maxNodes = 250000,
}) {
  let nodes = 0;
  let exhausted = false;
  const skip = p => specialIds.has(String(p.id));
  const leaders = initial.filter(p => !skip(p) && isLeader(p) && !partnerOf(p));
  const mates = initial.filter(p => !skip(p) && isPartner(p) && roomOf(p) == null);
  if (leaders.length !== mates.length) return { solution: null, reason: 'unbalanced' };
  // 기존에 확정된 방과 금지 페어 충돌은 임의로 이동시키지 않습니다.
  for (let r = 1; r <= roomCount; r++) {
    const occupants = initial.filter(p => Number(roomOf(p)) === r);
    if (occupants.length > capacityOf(r) ||
        occupants.filter(p => !skip(p) && isLeader(p)).length > Math.floor(capacityOf(r) / 2)) {
      return { solution: null, reason: 'existing_conflict' };
    }
    for (let i = 0; i < occupants.length; i++) {
      if (!canEnterRoom(avoidance, occupants[i], r, occupants, roomOf)) {
        return { solution: null, reason: 'existing_conflict' };
      }
    }
  }
  const key = p => String(p.id);
  const place = (list, a, b, room) => list.map(p => key(p) === key(a)
    ? { ...p, room, roomNumber: room, partner: b.id, teammateId: b.id, teammate: b.id }
    : key(p) === key(b)
      ? { ...p, room, roomNumber: room, partner: a.id, teammateId: a.id, teammate: a.id }
      : p);
  const roomOptions = (list, a, b) => {
    if (!canShareRoom(avoidance, a.id, b.id)) return [];
    const fixed = roomOf(a);
    const allowed = fixed != null ? [Number(fixed)] : allowedRooms(a, list);
    return allowed.filter(r => {
      if (!Number.isInteger(Number(r)) || r < 1 || r > roomCount) return false;
      const occupants = list.filter(p => Number(roomOf(p)) === Number(r));
      if (occupants.length + (fixed == null ? 2 : 1) > capacityOf(r)) return false;
      if (occupants.filter(isLeader).length + (fixed == null ? 1 : 0) > Math.floor(capacityOf(r) / 2)) return false;
      return canEnterRoom(avoidance, a, r, list, roomOf)
        && canEnterRoom(avoidance, b, r, list, roomOf);
    });
  };
  const recur = (list, remainingLeaders, remainingMates, first) => {
    if (!remainingLeaders.length) return list;
    if (++nodes > maxNodes) { exhausted = true; return null; }
    // 남은 각 2조가 적어도 한 1조와 짝을 이룰 수 있어야 합니다.
    const mateOptions = remainingMates.map(b => ({
      b, leaders: remainingLeaders.filter(a => roomOptions(list, a, b).length),
    }));
    if (mateOptions.some(x => !x.leaders.length)) return null;
    let chosenLeader = null;
    let options = [];
    if (first && forceLeaderId != null) {
      chosenLeader = remainingLeaders.find(a => key(a) === String(forceLeaderId));
      if (!chosenLeader) return null;
      options = shuffleAvoid(remainingMates).flatMap(b =>
        shuffleAvoid(roomOptions(list, chosenLeader, b)).map(room => ({ b, room })));
    } else {
      // 선택 가능성이 가장 낮은 2조부터 배정해 좁은 경우의 수를 보존합니다.
      const tightest = shuffleAvoid(mateOptions).sort((x, y) => x.leaders.length - y.leaders.length)[0];
      options = shuffleAvoid(tightest.leaders).flatMap(a =>
        shuffleAvoid(roomOptions(list, a, tightest.b)).map(room => ({ a, b: tightest.b, room })));
    }
    for (const opt of options) {
      const a = chosenLeader || opt.a;
      const next = place(list, a, opt.b, opt.room);
      const solved = recur(next,
        remainingLeaders.filter(p => key(p) !== key(a)),
        remainingMates.filter(p => key(p) !== key(opt.b)), false);
      if (solved) return solved;
      if (exhausted) return null;
    }
    return null;
  };
  const solution = recur(initial, shuffleAvoid(leaders), shuffleAvoid(mates), true);
  return { solution, reason: solution ? null : exhausted ? 'search_limit' : 'no_solution', nodes };
}
