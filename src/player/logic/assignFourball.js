// src/player/logic/assignFourball.js

import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

// 포볼: 1조가 실행, 미배정 2조 중에서 랜덤으로 팀원 선택 + 방(여유 2자리) 랜덤
export function pickRoomAndPartnerForFourball({
  me, participants, roomCount, roomCapacity = 4, strategy = 'pure', // strategy는 방 고를 때만 사용 ('pure'|'balanced')
}) {
  const myGroup = Number(me.group) || 0;
  if (myGroup !== 1) {
    // 2조는 '확인'만 가능. 호출부에서 메시지를 띄워주세요.
    return { blocked: true, reason: 'group_2_cannot_initiate' };
  }

  // 아직 방/파트너 미배정인 2조 후보
  const freeG2 = participants.filter((p) =>
    Number(p.group) === 2 && !p.room && p.id !== me.id
  );
  if (freeG2.length === 0) {
    return { blocked: true, reason: 'no_free_group2' };
  }

  // 방별 현황
  const byRoom = new Map();
  for (let r = 1; r <= roomCount; r++) {
    byRoom.set(r, { people: [] });
  }
  for (const p of participants) {
    const r = Number(p.room);
    if (r && byRoom.has(r)) byRoom.get(r).people.push(p);
  }

  // 여유 2자리 이상인 방만 후보
  let candidates = [];
  for (let r = 1; r <= roomCount; r++) {
    const cnt = byRoom.get(r).people.length;
    if (cnt <= roomCapacity - 2) candidates.push({ r, cnt });
  }
  // 그래도 없으면(이상 케이스) 모든 방 중 가장 인원이 적은 방에서 진행
  if (candidates.length === 0) {
    let min = Infinity;
    for (let r = 1; r <= roomCount; r++) {
      const cnt = byRoom.get(r).people.length;
      if (cnt < min) min = cnt;
    }
    candidates = [];
    for (let r = 1; r <= roomCount; r++) {
      if (byRoom.get(r).people.length === min) candidates.push({ r, cnt: min });
    }
  }

  if (strategy === 'balanced') {
    const min = Math.min(...candidates.map((c) => c.cnt));
    candidates = candidates.filter((c) => c.cnt === min);
  }

  const roomNumber = candidates[Math.floor(Math.random() * candidates.length)].r;
  const partner = freeG2[Math.floor(Math.random() * freeG2.length)];

  return { roomNumber, partner };
}

function normalizeMode(m) {
  return (m === 'fourball' || m === 'agm') ? 'fourball' : 'stroke';
}
function participantsFieldByMode(m) {
  return normalizeMode(m) === 'fourball' ? 'participantsFourball' : 'participantsStroke';
}

// (선택) Firestore 트랜잭션 버전
// - 이 프로젝트는 참가자 데이터를 events/{eventId} 문서의 participants 배열에 저장함
// - 따라서 트랜잭션도 "event 문서"를 대상으로 동시 확정해야 함
export async function transactionalAssignFourball({
  db,
  eventId,
  me,
  partner,
  roomNumber,
}) {
  const eref = doc(db, 'events', String(eventId));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(eref);
    const data = snap.exists() ? (snap.data() || {}) : {};

    const md = normalizeMode(data.mode);
    const pField = participantsFieldByMode(md);
    const splitEnabled = !!(data.participantsStroke || data.participantsFourball);

    const partsSrc = splitEnabled ? (data[pField] ?? data.participants ?? []) : (data.participants ?? []);
    const parts = (Array.isArray(partsSrc) ? partsSrc : []).map((p) => ({ ...p }));

    const meIdx = parts.findIndex((p) => String(p.id) === String(me.id));
    const ptIdx = parts.findIndex((p) => String(p.id) === String(partner.id));
    if (meIdx < 0 || ptIdx < 0) throw new Error('participant_not_found');

    // 이미 배정되었는지 최종 확인
    if (parts[meIdx].room || parts[ptIdx].room) throw new Error('already_assigned');

    // 방 여유(2자리) 최종 확인
    const peopleInRoom = parts.filter((p) => Number(p.room) === Number(roomNumber));
    if (peopleInRoom.length > 2) throw new Error('room_full');

    // 동시 확정
    parts[meIdx].room = roomNumber;
    parts[ptIdx].room = roomNumber;
    parts[meIdx].partner = String(partner.id);
    parts[ptIdx].partner = String(me.id);

    const payload = {
      participants: parts,
      [pField]: parts,
      participantsUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    tx.set(eref, payload, { merge: true });
  });
}
