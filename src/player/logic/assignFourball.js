// src/player/logic/assignFourball.js

/**
 * 관리자 STEP7 룰 호환(방 선택 단계만):
 * - 참가자를 1그룹/2그룹으로 1:1 매칭 전제(관리자 코드와 동일하게 id의 절반 분기)
 * - 같은 그룹이 방에 2명 초과되지 않도록 방을 선택
 * - 남은 방 중 무작위
 * 
 * 주의: partner 선택은 PlayerRoomSelect에서 사용자가 고르는 순간 joinFourBall()로 확정 처리
 */
export function pickRoomForFourball({ participants, roomCount, target }) {
  const toNum = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const rooms = Array.from({ length: roomCount }, (_, i) => i + 1);
  const half = Math.floor(participants.length / 2);
  const isGroup1 = toNum(target.id) < half;

  // 방별 같은 그룹 카운트
  const sameGroupCountByRoom = new Map();
  rooms.forEach(r => sameGroupCountByRoom.set(r, 0));
  participants.forEach(p => {
    if (p.room == null) return;
    const pg1 = toNum(p.id) < half;
    if (pg1 === isGroup1) {
      sameGroupCountByRoom.set(p.room, (sameGroupCountByRoom.get(p.room) || 0) + 1);
    }
  });

  // 같은 그룹 인원이 2명 미만인 방만 후보
  const candidates = rooms.filter(r => (sameGroupCountByRoom.get(r) || 0) < 2);
  if (candidates.length === 0) {
    // 모두 꽉 찼다면 아무 방이나
    return rooms[Math.floor(Math.random() * rooms.length)];
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}
