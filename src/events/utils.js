// /src/events/utils.js
// 팀(포볼) 구성 계산 유틸 - Step8 로직과 동일한 규칙을 최대한 유지

export function buildTeamsByRoom(participants = [], roomCount = 4) {
  const byRoom = Array.from({ length: roomCount }, () => []);
  (participants || []).forEach(p => {
    if (p.room != null && p.room >= 1 && p.room <= roomCount) {
      byRoom[p.room - 1].push(p);
    }
  });

  // ordered slots: [p0,p1,p2,p3] (1조 짝 먼저)
  const orderedByRoom = byRoom.map(roomArr => {
    const slot = [null,null,null,null];
    const used = new Set();
    const half = (participants?.length || 0) / 2;

    const pairs = [];
    roomArr.filter(p => p.id < half).forEach(p1 => {
      if (used.has(p1.id)) return;
      const partner = roomArr.find(x => x.id === p1.partner);
      if (partner && !used.has(partner.id)) {
        pairs.push([p1, partner]);
        used.add(p1.id); used.add(partner.id);
      }
    });
    pairs.forEach((pair, idx) => {
      if (idx === 0) { slot[0] = pair[0]; slot[1] = pair[1]; }
      if (idx === 1) { slot[2] = pair[0]; slot[3] = pair[1]; }
    });
    roomArr.forEach(p => {
      if (!used.has(p.id)) {
        const i = slot.findIndex(s => s == null);
        if (i >= 0) { slot[i] = p; used.add(p.id); }
      }
    });
    return slot.map(p => p || { nickname:'', handicap:0, score:0 });
  });

  // team keys: `${roomIdx+1}-A`, `${roomIdx+1}-B`
  const teamsByRoom = orderedByRoom.map((slot, roomIdx) => {
    const [p0,p1,p2,p3] = slot;
    return [
      { key: `${roomIdx+1}-A`, roomIdx, members:[p0,p1] },
      { key: `${roomIdx+1}-B`, roomIdx, members:[p2,p3] }
    ];
  });

  return { byRoom, orderedByRoom, teamsByRoom };
}
