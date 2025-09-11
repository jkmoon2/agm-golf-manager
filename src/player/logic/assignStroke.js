// /src/player/logic/assignStroke.js

// ⬆️ 반드시 최상단에 import 배치 (ESLint: import/first 준수)
import { runTransaction, doc } from 'firebase/firestore';

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
  for (const p of (participants || [])) {
    const rr = Number(p?.room) || 0;
    if (rr >= 1 && rr <= roomCount) {
      const slot = byRoom.get(rr);
      slot.people.push(p);
      slot.groups.add(Number(p.group) || 0);
    }
  }

  // 후보: 같은 조 없는 방
  let candidates = [];
  for (let r = 1; r <= roomCount; r++) {
    const slot = byRoom.get(r);
    if (!slot.groups.has(myGroup) && slot.people.length < 4) {
      candidates.push({ r, cnt: slot.people.length });
    }
  }

  // 만약 전부 같은 조 있거나 꽉 찼다면, 아직 4명 미만인 방 중에서
  if (candidates.length === 0) {
    for (let r = 1; r <= roomCount; r++) {
      const slot = byRoom.get(r);
      if (slot.people.length < 4) candidates.push({ r, cnt: slot.people.length });
    }
  }
  // 그래도 없으면 1~roomCount 중 랜덤 (이론상 거의 없음)
  if (candidates.length === 0) {
    const fallback = 1 + Math.floor(Math.random() * Math.max(1, roomCount));
    return fallback;
  }

  // 전략 적용
  if (strategy === 'balanced') {
    let min = Math.min(...candidates.map(c => c.cnt));
    candidates = candidates.filter(c => c.cnt === min);
  }
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  return picked?.r ?? 1;
}

// 트랜잭션 기반 스트로크 배정 (Admin/Player 동시 배정 충돌 방지)
// - 동일 방에 같은 조 금지
// - 방당 4명 제한
// - 현재 스냅샷 기준으로 방을 선택하고 즉시 커밋
export async function transactionalAssignStroke({ db, eventId, participantId }) {
  if (!db || !eventId || !participantId) throw new Error('invalid_args');
  const result = await runTransaction(db, async (tx) => {
    const eref = doc(db, 'events', eventId);
    const snap = await tx.get(eref);
    if (!snap.exists()) throw new Error('event_not_found');
    const data = snap.data() || {};
    const roomCount = Number(data.roomCount || 0) || 0;
    const parts = Array.isArray(data.participants) ? data.participants.map((p, i) => ({
      ...(p && typeof p === 'object' ? p : {}),
      id: p?.id ?? i,
      group: Number(p?.group) || 0,
      room: Number(p?.room) || 0,
      nickname: p?.nickname || '',
    })) : [];

    const meIdx = parts.findIndex(p => String(p.id) === String(participantId));
    if (meIdx < 0) throw new Error('participant_not_found');

    // 이미 배정되어 있으면 그대로 리턴
    const me = parts[meIdx];
    if (Number(me.room) > 0) {
      return { roomNumber: Number(me.room) };
    }

    // 방 선택 (같은 조 금지 + 균형랜덤)
    const picked = pickRoomForStroke({
      me,
      participants: parts,
      roomCount,
      strategy: 'balanced',
    });

    const chosen = Number(typeof picked === 'number' ? picked : (picked?.roomNumber ?? picked?.room) || 0) || 0;
    if (!chosen) throw new Error('no_room');

    // 유효성 재확인: 선택된 방에 동일 조가 있는지, 인원이 4 미만인지
    const current = parts.filter(p => Number(p.room) === chosen);
    const hasSameGroup = current.some(p => Number(p.group) === Number(me.group));
    if (hasSameGroup) throw new Error('conflict_same_group');
    if (current.length >= 4) throw new Error('room_full');

    // 커밋
    parts[meIdx] = { ...me, room: chosen };
    tx.update(eref, { participants: parts });

    return { roomNumber: chosen };
  });
  return result;
}
