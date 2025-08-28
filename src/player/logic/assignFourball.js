// src/player/logic/assignFourball.js

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
  const freeG2 = participants.filter(p =>
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
    const min = Math.min(...candidates.map(c => c.cnt));
    candidates = candidates.filter(c => c.cnt === min);
  }

  const roomNumber = candidates[Math.floor(Math.random() * candidates.length)].r;
  const partner = freeG2[Math.floor(Math.random() * freeG2.length)];

  return { roomNumber, partner };
}

/* --- (선택) Firestore 트랜잭션 버전 샘플 --- 
   두 사람(1조, 2조)을 "동시에" 같은 방/파트너로 저장해서
   경합/중복을 더 강하게 방지하고 싶을 때 사용하세요.
   실제 프로젝트의 firestore 인스턴스/컬렉션 경로 이름에 맞게 바꿔서 쓰면 됩니다. */
export async function transactionalAssignFourball({
  db, eventId, me, partner, roomNumber,
}) {
  const meRef = db.collection('events').doc(eventId).collection('participants').doc(String(me.id));
  const ptRef = db.collection('events').doc(eventId).collection('participants').doc(String(partner.id));

  await db.runTransaction(async (tx) => {
    const [meSnap, ptSnap] = await Promise.all([tx.get(meRef), tx.get(ptRef)]);
    const meData = meSnap.data();
    const ptData = ptSnap.data();

    // 이미 배정되었는지 최종 확인
    if (meData.room || ptData.room) {
      throw new Error('already_assigned');
    }
    // 동시 확정
    tx.update(meRef, { room: roomNumber, partnerId: partner.id });
    tx.update(ptRef, { room: roomNumber, partnerId: me.id });
  });
}
