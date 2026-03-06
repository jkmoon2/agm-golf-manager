// src/player/logic/assignFourball.js

import { arrayUnion, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { sanitizeForFirestore } from '../../utils/sanitizeForFirestore';

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

/*
  Firestore 트랜잭션 버전(모듈러 SDK)
  - 기존 샘플(compat: db.collection / db.runTransaction) 때문에
    `t.collection is not a function` 에러가 발생했고,
    fallback tx(수동 tx)로 내려가면서 participantsFourball 분리 저장 이벤트에서
    "배정이 풀리는" 문제가 생겼습니다.

  ✅ 현재 프로젝트 표준
  - 이벤트 루트 문서에 participants + participantsFourball(모드별 필드) 동시 저장
  - 트랜잭션 내부에서 최신 스냅샷 기준으로 방/파트너를 확정
  - fourballRooms/{roomNumber} 도 같이 갱신(운영 화면과 동기화)

  호출부(PlayerContext)에서 사용하는 형태:
    transactionalAssignFourball({ db, eventId, participants, roomCount, selfId })
*/

const normId = (v) => String(v ?? '').trim();
const normName = (s) => (s ?? '').toString().normalize('NFC').trim();
const toInt = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export async function transactionalAssignFourball({
  db,
  eventId,
  participants, // (옵션) caller가 가진 로컬 participants. 트랜잭션에서는 서버 스냅샷을 우선.
  roomCount,
  selfId,

  // (레거시) 예전 샘플 형태: me/partner/roomNumber
  me,
  partner,
  roomNumber,
}) {
  if (!db) throw new Error('missing_db');
  if (!eventId) throw new Error('missing_eventId');

  const eref = doc(db, 'events', eventId);

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(eref);
    if (!snap.exists()) throw new Error('event_not_found');
    const data = snap.data() || {};

    const fieldParts = 'participantsFourball';
    const baseParts = (Array.isArray(data?.[fieldParts]) && data[fieldParts]?.length)
      ? data[fieldParts]
      : (Array.isArray(data?.participants) && data.participants?.length)
        ? data.participants
        : (Array.isArray(participants) ? participants : []);

    const parts = (baseParts || []).map((p, i) => ({
      ...((p && typeof p === 'object') ? p : {}),
      id: normId(p?.id ?? i),
      nickname: normName(p?.nickname),
      group: toInt(p?.group, 0),
      room: p?.room ?? null,
      partner: p?.partner != null ? normId(p?.partner) : null,
    }));

    const rc = toInt(roomCount, toInt(data?.roomCount, 4));
    if (!rc || rc < 1) throw new Error('invalid_roomCount');

    // 1) 레거시 인자(me/partner/roomNumber)가 들어오면 그대로 확정
    let chosenRoom = toInt(roomNumber, 0);
    let mateId = normId(partner?.id);
    let pid = normId(selfId ?? me?.id);
    if (!pid) throw new Error('missing_selfId');

    const self = parts.find((p) => normId(p.id) === pid);
    if (!self) throw new Error('Participant not found');
    if (toInt(self.group) !== 1) throw new Error('group_2_cannot_initiate');
    if (self.room) throw new Error('already_assigned');

    // 2) 신형 호출(selfId/roomCount)일 때는 최신 스냅샷 기준으로 랜덤 선택
    if (!chosenRoom) {
      // 방별 인원 수
      const counts = Array.from({ length: rc }, () => 0);
      for (const p of parts) {
        const r = toInt(p.room, 0);
        if (r >= 1 && r <= rc) counts[r - 1] += 1;
      }
      // 여유 2자리 이상(roomCapacity=4 기준) 방 후보
      let roomCandidates = [];
      for (let r = 1; r <= rc; r++) {
        if (counts[r - 1] <= 2) roomCandidates.push(r);
      }
      if (roomCandidates.length === 0) {
        const min = Math.min(...counts);
        for (let r = 1; r <= rc; r++) {
          if (counts[r - 1] === min) roomCandidates.push(r);
        }
      }
      chosenRoom = roomCandidates[Math.floor(Math.random() * roomCandidates.length)];
    }

    if (!mateId) {
      const pool = parts.filter(
        (p) => toInt(p.group) === 2 && !p.room && !p.partner && normId(p.id) !== pid
      );
      if (!pool.length) throw new Error('no_free_group2');
      mateId = normId(pool[Math.floor(Math.random() * pool.length)].id);
    }

    const next = parts.map((p) => {
      if (normId(p.id) === pid) return { ...p, room: chosenRoom, partner: mateId || null };
      if (mateId && normId(p.id) === mateId) return { ...p, room: chosenRoom, partner: pid };
      return p;
    });

    tx.set(
      eref,
      sanitizeForFirestore({
        participants: next,
        [fieldParts]: next,
        participantsUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );

    // 운영/표 출력용: fourballRooms 누적
    const fbref = doc(db, 'events', eventId, 'fourballRooms', String(chosenRoom));
    if (mateId) {
      tx.set(fbref, { pairs: arrayUnion({ p1: pid, p2: mateId }), updatedAt: serverTimestamp() }, { merge: true });
    } else {
      tx.set(fbref, { singles: arrayUnion(pid), updatedAt: serverTimestamp() }, { merge: true });
    }

    return { roomNumber: chosenRoom, partnerId: mateId || null, nextParticipants: next };
  });
}
