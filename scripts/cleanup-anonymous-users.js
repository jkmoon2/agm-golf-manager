// /scripts/cleanup-anonymous-users.v2.js
// 사용법 A) N일 이전의 '익명' 계정/문서 일괄 삭제
//   CLEANUP_DAYS=7 node scripts/cleanup-anonymous-users.v2.js
// 사용법 B) 기간 지정(UTC 기준) 삭제
//   node scripts/cleanup-anonymous-users.v2.js --start=2025-09-20 --end=2025-09-23
// 공통 옵션) --dry 또는 --dry-run  → 실제 삭제 대신 대상만 출력
//
// ✔ 한 번에 처리: Auth(익명 계정) + Firestore(users/{uid} 문서) + 하위 서브컬렉션 재귀 삭제
// ✔ 익명 판정: providerData.length === 0 && !email && !phoneNumber
// ✔ 안전장치: Firestore 문서가 없어도 넘어감(try/catch)
// ✔ 삭제 순서: Firestore(문서/하위 모두) → Auth 계정
//
// 필요 전제: GOOGLE_APPLICATION_CREDENTIALS 환경변수로 서비스 계정 키 사용

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const auth = admin.auth();
const db   = admin.firestore();

// ---------- 옵션 파서 ----------
function parseArgs() {
  const args = process.argv.slice(2);
  const opt = { days: Number(process.env.CLEANUP_DAYS || 0), start: null, end: null, dry: false };
  for (const a of args) {
    if (a.startsWith('--start=')) opt.start = new Date(a.slice(8) + 'T00:00:00Z');
    else if (a.startsWith('--end=')) opt.end = new Date(a.slice(6) + 'T00:00:00Z');
    else if (a === '--dry' || a === '--dry-run') opt.dry = true;
  }
  return opt;
}
function inRange(createdMs, opt) {
  if (opt.start && opt.end) {
    return createdMs >= opt.start.getTime() && createdMs < opt.end.getTime();
  }
  if (opt.days && opt.days > 0) {
    const th = Date.now() - opt.days * 24 * 60 * 60 * 1000;
    return createdMs < th;
  }
  // 기본: 7일 이전
  const TH = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return createdMs < TH;
}
function isAnonymous(u) {
  return (u.providerData || []).length === 0 && !u.email && !u.phoneNumber;
}

// ---------- Firestore 재귀 삭제 ----------
async function deleteDocRecursive(docRef, batchSize = 300) {
  // 하위 컬렉션부터 모두 비우고 마지막에 현재 문서를 삭제
  const subcols = await docRef.listCollections();
  for (const col of subcols) {
    await deleteCollectionRecursive(col, batchSize);
  }
  await docRef.delete().catch(() => {});
}

async function deleteCollectionRecursive(colRef, batchSize = 300) {
  while (true) {
    const snap = await colRef.limit(batchSize).get();
    if (snap.empty) break;

    // 각 문서의 하위까지 먼저 비우고, 자신을 삭제
    const jobs = [];
    snap.forEach((d) => jobs.push(deleteDocRecursive(d.ref, batchSize)));
    await Promise.all(jobs);
  }
}

// ---------- Auth+Firestore 함께 삭제 ----------
async function deleteEverywhere(uid, dry) {
  if (dry) {
    console.log('[DRY] would delete Firestore users/%s (with subcollections) and Auth user', uid);
    return;
  }
  try {
    await deleteDocRecursive(db.collection('users').doc(uid));   // ← 재귀 삭제
    console.log('Firestore deleted (recursive): users/%s', uid);
  } catch (e) {
    console.warn('Firestore recursive delete failed(%s): %s', uid, e.message);
  }
  try {
    await auth.deleteUser(uid);
    console.log('Auth deleted: %s', uid);
  } catch (e) {
    console.warn('Auth delete failed(%s): %s', uid, e.message);
  }
}

// ---------- 메인 ----------
async function main() {
  const opt = parseArgs();
  let pageToken = undefined;
  let scanned = 0, matched = 0;

  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      scanned++;
      if (!isAnonymous(u)) continue;

      const createdMs = new Date(u.metadata.creationTime).getTime();
      if (!inRange(createdMs, opt)) continue;

      matched++;
      await deleteEverywhere(u.uid, opt.dry);
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`done. scanned=${scanned}, deleted(or matched)=${matched}, mode=${opt.start && opt.end ? 'range' : (opt.days||7)+'days'}${opt.dry?' (dry-run)':''}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
