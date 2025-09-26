// /functions/index.js
// ─────────────────────────────────────────────────────────────
// [원본 유지] + [ADD] Firestore 동기화 트리거 / 보강 삭제 로직
// ─────────────────────────────────────────────────────────────

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// [ADD] Firestore 핸들
const db = admin.firestore();

// 관리자 이메일 화이트리스트 (필요시 추가)
const ADMIN_EMAILS = new Set(['a@a.com']);

/**
 * [ADD] Auth 사용자가 생성될 때 Firestore 'users/{uid}' 문서를 자동 생성
 *  - 회원 목록 화면이 'users' 컬렉션을 읽고 있으므로, 가입 즉시 목록에 반영되도록 보완
 */
exports.syncUserCreate = functions.auth.user().onCreate(async (user) => {
  const ref = db.collection('users').doc(user.uid);
  await ref.set(
    {
      uid: user.uid,
      email: user.email || '',
      name: user.displayName || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
});

/**
 * [ADD] Auth 사용자가 삭제되면 Firestore 문서 정리
 */
exports.syncUserDelete = functions.auth.user().onDelete(async (user) => {
  await db.collection('users').doc(user.uid).delete().catch(() => {});
});

/**
 * [원본] + [ADD] 강제 삭제(관리자 전용)
 *  - 기존 화이트리스트 검증 유지
 *  - [ADD] Auth 삭제 후 Firestore 'users' 및(있다면) 'members' 문서도 함께 삭제
 *  - [ADD] 인자 검증 강화
 */
exports.adminDeleteUser = functions.https.onCall(async (data, context) => {
  const caller = context.auth?.token?.email;
  if (!caller || !ADMIN_EMAILS.has(caller)) {
    throw new functions.https.HttpsError('permission-denied', '관리자만 사용할 수 있습니다.');
  }

  // [ADD] 인자 검증
  const uid = typeof data?.uid === 'string' && data.uid.trim();
  if (!uid) {
    throw new functions.https.HttpsError('invalid-argument', 'uid가 필요합니다.');
  }

  // Auth 계정 삭제
  await admin.auth().deleteUser(uid);

  // [ADD] Firestore 문서도 함께 정리(컬렉션명이 다를 수 있어 둘 다 시도)
  await Promise.all([
    db.collection('users').doc(uid).delete().catch(() => {}),
    db.collection('members').doc(uid).delete().catch(() => {}),
  ]);

  return { ok: true };
});
