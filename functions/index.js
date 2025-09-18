// /functions/index.js

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// 운영자 이메일 화이트리스트
const ADMIN_EMAILS = new Set(['a@a.com']);

exports.adminDeleteUser = functions.https.onCall(async (data, context) => {
  const caller = context.auth?.token?.email;
  if (!caller || !ADMIN_EMAILS.has(caller)) {
    throw new functions.https.HttpsError('permission-denied', '관리자만 사용할 수 있습니다.');
  }
  const uid = data?.uid;
  if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid가 필요합니다.');
  await admin.auth().deleteUser(uid);
  return { ok: true };
});
