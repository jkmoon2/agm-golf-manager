// /functions/index.js
// ─────────────────────────────────────────────────────────────
// [원본 유지] + [ADD] 동기화/관리/트랜잭션 샘플
// ─────────────────────────────────────────────────────────────

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();
const ADMIN_EMAILS = new Set(['a@a.com']);

/** [ADD] Auth → Firestore 동기화 */
exports.syncUserCreate = functions.auth.user().onCreate(async (user) => {
  const ref = db.collection('users').doc(user.uid);
  await ref.set(
    { uid: user.uid, email: user.email || '', name: user.displayName || '', createdAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
});
exports.syncUserDelete = functions.auth.user().onDelete(async (user) => {
  await db.collection('users').doc(user.uid).delete().catch(() => {});
});

/** [원본+ADD] 관리자 강제 삭제 */
exports.adminDeleteUser = functions.https.onCall(async (data, context) => {
  const caller = context.auth?.token?.email;
  if (!caller || !ADMIN_EMAILS.has(caller)) {
    throw new functions.https.HttpsError('permission-denied', '관리자만 사용할 수 있습니다.');
  }
  const uid = typeof data?.uid === 'string' && data.uid.trim();
  if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid가 필요합니다.');
  await admin.auth().deleteUser(uid);
  await Promise.all([
    db.collection('users').doc(uid).delete().catch(() => {}),
    db.collection('members').doc(uid).delete().catch(() => {}),
  ]);
  return { ok: true };
});

/** ───────────────────────────────────────────────────────────
 *  [ADD] 트랜잭션 샘플: 개인 이동/트레이드 (1조/2조 공통)
 *  - role: 'g1' | 'g2'
 *  - participantId: 이동/교체 대상 참가자 id(Number or String)
 *  - targetRoom: 숫자
 *  - 정책: 대상 조가 비어있으면 이동, 차있으면 동일 조끼리 스왑
 *  - roomTable 정원 4 보장
 *  - participants 배열/partner 연결 자동 재배선
 *  클라이언트에서 필요시 이 함수를 호출해 race를 서버에서 종결하세요.
 *  (프론트는 현재 Alt/롱프레스 로직을 그대로 사용해도 됨)
 *  ─────────────────────────────────────────────────────────── */
exports.moveOrTradeOneTx = functions.https.onCall(async (data, context) => {
  const { eventId, role, participantId, targetRoom } = data || {};
  if (!eventId || !role || !participantId || !targetRoom) {
    throw new functions.https.HttpsError('invalid-argument', 'eventId/role/participantId/targetRoom 필요');
  }
  const evRef = db.doc(`events/${eventId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(evRef);
    if (!snap.exists) throw new functions.https.HttpsError('not-found', 'event not found');
    const ev = snap.data() || {};
    const parts = Array.isArray(ev.participants) ? [...ev.participants] : [];
    const roomTable = ev.roomTable || {};
    const rtGet = (r)=> Array.isArray(roomTable[r]) ? [...roomTable[r]] : [];

    const byId = new Map(parts.map(p => [String(p.id), p]));
    const me = byId.get(String(participantId));
    if (!me) throw new functions.https.HttpsError('failed-precondition', 'participant not found');

    const isG1 = (p) => Number(p?.group) % 2 === 1;
    const meIsG1 = isG1(me);
    if ((role === 'g1' && !meIsG1) || (role === 'g2' && meIsG1)) {
      throw new functions.https.HttpsError('failed-precondition', '역할 불일치');
    }

    const getInRoom = (room, pred) => parts.filter(p => Number(p.room) === Number(room) && pred(p));
    const g1In = (room)=> getInRoom(room, isG1);
    const g2In = (room)=> getInRoom(room, (p)=>!isG1(p));

    const srcRoom = Number(me.room);
    const dstRoom = Number(targetRoom);
    const dstSameRole = (meIsG1 ? g1In(dstRoom) : g2In(dstRoom));
    const dstOtherRole = (meIsG1 ? g2In(dstRoom) : g1In(dstRoom));
    const srcPartner = me?.partner ? byId.get(String(me.partner)) : null;

    const moveOnly = dstSameRole.length === 0;

    // roomTable 편의함수
    const setRoomTable = (uid, room) => {
      const s = rtGet(room);
      const idx = s.indexOf(uid);
      if (idx === -1) s.push(uid);
      roomTable[room] = s.slice(0, 4); // 상한 4
    };
    const delFromRoomTable = (uid, room) => {
      const s = rtGet(room).filter(x => x !== uid);
      roomTable[room] = s;
    };

    if (moveOnly) {
      // 이동만
      if (rtGet(dstRoom).length >= 4) throw new functions.https.HttpsError('failed-precondition', 'room full');
      // me 이동 + 파트너 재배선
      me.room = dstRoom;
      me.roomNumber = dstRoom;
      const dstOther = dstOtherRole[0] || null;
      me.partner = dstOther?.id ?? null;
      if (dstOther) dstOther.partner = me.id;
      if (srcPartner) srcPartner.partner = null;

      delFromRoomTable(me.id, srcRoom);
      setRoomTable(me.id, dstRoom);
    } else {
      // 동일 조끼리 스왑
      const pick = dstSameRole[0]; // 여러 명이라면 프론트에서 먼저 고른 후 호출
      const pickPartner = pick?.partner ? byId.get(String(pick.partner)) : null;
      // 방 교환
      me.room = dstRoom;    me.roomNumber = dstRoom;
      pick.room = srcRoom;  pick.roomNumber = srcRoom;
      // 파트너 재연결
      if (meIsG1) {
        const dstG2 = dstOtherRole[0] || null;
        if (dstG2) { me.partner = dstG2.id; dstG2.partner = me.id; } else { me.partner = null; }
        if (srcPartner) { srcPartner.partner = pick.id; pick.partner = srcPartner.id; }
      } else {
        const dstG1 = dstOtherRole[0] || null;
        if (dstG1) { me.partner = dstG1.id; dstG1.partner = me.id; } else { me.partner = null; }
        if (srcPartner) { srcPartner.partner = pick.id; pick.partner = srcPartner.id; }
      }
      // roomTable 교환 반영
      delFromRoomTable(me.id, srcRoom);
      delFromRoomTable(pick.id, dstRoom);
      setRoomTable(me.id, dstRoom);
      setRoomTable(pick.id, srcRoom);
    }

    tx.update(evRef, { participants: parts, roomTable });
  });

  return { ok: true };
});

/** [ADD] 트랜잭션 샘플: 페어(2명) 이동 */
exports.movePairTx = functions.https.onCall(async (data, context) => {
  const { eventId, group1Id, targetRoom } = data || {};
  if (!eventId || !group1Id || !targetRoom) throw new functions.https.HttpsError('invalid-argument', 'eventId/group1Id/targetRoom 필요');
  const evRef = db.doc(`events/${eventId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(evRef);
    const ev = snap.data() || {};
    const parts = Array.isArray(ev.participants) ? [...ev.participants] : [];
    const roomTable = ev.roomTable || {};
    const byId = new Map(parts.map(p => [String(p.id), p]));
    const g1 = byId.get(String(group1Id));
    const g2 = g1?.partner ? byId.get(String(g1.partner)) : null;
    if (!g1) throw new functions.https.HttpsError('failed-precondition', 'group1 not found');
    const dst = Array.isArray(roomTable[targetRoom]) ? roomTable[targetRoom] : [];
    if (dst.length > 4 - (g2 ? 2 : 1)) throw new functions.https.HttpsError('failed-precondition', 'room full');

    const srcRoom = Number(g1.room);
    const setRT = (uid, r) => {
      const ar = Array.isArray(roomTable[r]) ? [...roomTable[r]] : [];
      if (!ar.includes(uid)) ar.push(uid);
      roomTable[r] = ar.slice(0,4);
    };
    const delRT = (uid, r) => {
      roomTable[r] = (Array.isArray(roomTable[r]) ? roomTable[r] : []).filter(x => x !== uid);
    };

    g1.room = Number(targetRoom); g1.roomNumber = Number(targetRoom);
    delRT(g1.id, srcRoom); setRT(g1.id, Number(targetRoom));
    if (g2) {
      g2.room = Number(targetRoom); g2.roomNumber = Number(targetRoom);
      delRT(g2.id, srcRoom); setRT(g2.id, Number(targetRoom));
    }
    tx.update(evRef, { participants: parts, roomTable });
  });
  return { ok: true };
});
