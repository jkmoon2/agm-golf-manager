// /scripts/backfill-users-to-firestore.js
// Auth 모든 사용자 → Firestore users/{uid} 보정
// - 문서 없으면 생성, 있으면 createdAt 누락/오값 보정
// - createdAt = Auth metadata.creationTime (실제 가입일)
// - DRY=1 : 쓰기 없이 영향만 로그
// - SKIP_ANON=0 : 익명도 포함(기본은 익명 제외)

const path  = require('path');
const fs    = require('fs');
const admin = require('firebase-admin');

function resolveKeyPath(raw) {
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

const RAW_KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json';
const SERVICE_KEY  = resolveKeyPath(RAW_KEY_PATH);

console.log('[INFO] GOOGLE_APPLICATION_CREDENTIALS =', RAW_KEY_PATH);
console.log('[INFO] Resolved key path             =', SERVICE_KEY);
if (!fs.existsSync(SERVICE_KEY)) {
  console.error('[ERROR] Service account JSON not found at:', SERVICE_KEY);
  process.exit(1);
}

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || undefined;

admin.initializeApp({
  credential: admin.credential.cert(require(SERVICE_KEY)),
  projectId: PROJECT_ID,
});

const db        = admin.firestore();
const DRY       = process.env.DRY === '1';           // [ADD] 드라이런
const SKIP_ANON = process.env.SKIP_ANON !== '0';     // [ADD] 기본(true)=익명 제외

function isAnonymous(u) {
  // 이메일 없고 providerData가 비어있으면 사실상 익명
  return !u.email && (!u.providerData || u.providerData.length === 0);
}

function toDate(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

async function upsertOrFixUser(u) {
  if (SKIP_ANON && isAnonymous(u)) {
    console.log('~ skip anonymous :', u.uid);
    return;
  }
  const uid = u.uid;
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();

  const authCreated = (u.metadata && u.metadata.creationTime)
    ? new Date(u.metadata.creationTime)
    : null;

  if (!snap.exists) {
    const payload = {
      uid,
      email: u.email || '',
      name: u.displayName || '',
      createdAt: authCreated || new Date(),            // [FIX] 실제 가입일 우선
      createdAtSrc: authCreated ? 'auth.metadata' : 'now',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    console.log(DRY ? '(DRY) + add' : '+ add', uid, payload.email, payload.createdAt);
    if (!DRY) await ref.set(payload, { merge: true });
    return;
  }

  // 기존 문서 보정: createdAt 누락/오값이면 Auth 값으로 덮기
  const oldCreated = toDate(snap.get('createdAt'));
  const needFix = !oldCreated || (authCreated && Math.abs(oldCreated - authCreated) > 1000);

  if (needFix) {
    const next = {
      createdAt: authCreated || oldCreated || new Date(),
      createdAtSrc: authCreated ? 'auth.metadata' : (oldCreated ? 'kept' : 'now'),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    console.log(DRY ? `(DRY) * fix ${uid}` : `* fix ${uid}`,
      oldCreated ? oldCreated.toISOString() : 'null', '→',
      next.createdAt.toISOString()
    );
    if (!DRY) await ref.set(next, { merge: true });
  }
}

async function main() {
  console.log('[INFO] Start backfill...', { DRY, SKIP_ANON });
  let nextPageToken;
  do {
    const res = await admin.auth().listUsers(1000, nextPageToken);
    for (const u of res.users) {
      await upsertOrFixUser(u);
    }
    nextPageToken = res.pageToken;
  } while (nextPageToken);
  console.log('[INFO] Done.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
