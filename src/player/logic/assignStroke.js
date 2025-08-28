// src/player/logic/assignStroke.js

// 스트로크 방 선택 유틸
// 규칙: 같은 방에 같은 group(조)은 금지. 그 안에서 "순수 랜덤" (옵션으로 균형랜덤도 지원)
export function pickRoomForStroke({
  me,            // { id, group, room, ... }
  participants,  // 전체 참가자 배열
  roomCount,     // 방 개수 (정수)
  strategy = 'pure', // 'pure' | 'balanced'
}) {
  const myGroup = Number(me.group) || 0;

  // 방별 인원/그룹 집합
  const byRoom = new Map();
  for (let r = 1; r <= roomCount; r++) {
    byRoom.set(r, { people: [], groups: new Set() });
  }
  for (const p of participants) {
    const r = Number(p.room);
    if (r && byRoom.has(r)) {
      const slot = byRoom.get(r);
      slot.people.push(p);
      if (p.group != null) slot.groups.add(Number(p.group));
    }
  }

  // 같은 group이 이미 있으면 제외
  let candidates = [];
  for (let r = 1; r <= roomCount; r++) {
    const slot = byRoom.get(r);
    if (!slot.groups.has(myGroup)) {
      candidates.push({ r, cnt: slot.people.length });
    }
  }

  // 모두 막히는 경우(이상 케이스)는 전체 방에서 랜덤 (규칙 우선: 가능한 한 발생하지 않음)
  if (candidates.length === 0) {
    for (let r = 1; r <= roomCount; r++) {
      const slot = byRoom.get(r);
      candidates.push({ r, cnt: slot.people.length });
    }
  }

  // 전략 적용
  if (strategy === 'balanced') {
    let min = Math.min(...candidates.map(c => c.cnt));
    candidates = candidates.filter(c => c.cnt === min);
  }
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  return picked?.r ?? 1;
}
