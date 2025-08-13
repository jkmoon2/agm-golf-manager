// src/player/logic/assignStroke.js

/**
 * 관리자 STEP5 "같은 조는 같은 방 금지" 규칙 그대로:
 * - 대상 참가자의 group 내에서 이미 사용된 방 제외
 * - 남은 방 중 무작위 선택
 */
export function pickRoomForStroke({ participants, roomCount, target }) {
  const rooms = Array.from({ length: roomCount }, (_, i) => i + 1);
  const usedInGroup = participants
    .filter(p => p.group === target.group && p.room != null)
    .map(p => p.room);

  const available = rooms.filter(r => !usedInGroup.includes(r));
  if (available.length === 0) {
    // 모든 방이 이미 같은 조에 점유되었다면(이상 케이스) 전체에서 랜덤
    return rooms[Math.floor(Math.random() * rooms.length)];
  }
  return available[Math.floor(Math.random() * available.length)];
}
