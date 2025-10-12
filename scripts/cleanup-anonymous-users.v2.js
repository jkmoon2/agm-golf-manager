// /scripts/cleanup-anonymous-users.v2.js
//
// 익명 사용자(Authentication) + 동일 uid의 Firestore users 문서를
// - N일 이전까지 삭제  또는
// - 날짜 범위(UTC, start 포함 ~ end 미포함)로 삭제
// 옵션: --dry (기본: 미삭제, 미리보기), --days=10, --start=YYYY-MM-DD --end=YYYY-MM-DD
//
// 예)
// DRY RUN 기본(7일 이전): node scripts/cleanup-anonymous-users.v2.js --dry
// 실제 삭제(10일 이전):  CLEANUP_DAYS=10 node scripts/cleanup-anonymous-users.v2.js
// 실제 삭제(범위):       node scripts/cleanup-anonymous-users.v2.js --start=2025-09-20 --end=2025-09-23
//

const admin = require('firebase-admin');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (key) => {
    const hit = args.find(a => a.startsWith(`${key}=`));
    return hit ? hit.split('=').slice(1).join('=') : null;
  };
  return {
    dry: args.includes('--dry'),
    start: get('--start'),   // 'YYYY-MM-DD'
    end: get('--end'),       // 'YYYY-MM-DD'
    days: Number(process.env.CLEANUP_DAYS || get('--days') || 7),
    limit: Number(get('--limit') || 1000000), // 안전장치: 최대 삭제 개수 상한
  };
}

function toUtcStart(dateStr) {
  // 'YYYY-MM-DD' → 해당 날짜의 00:00:00Z
  return new Date(`${dateStr}T00:00:00.000Z`);
}
function toUtcEnd(dateStr) {
  // 'YYYY-MM-DD' → 다음날 00:00:00Z(미포함 경계)
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function isAnonymousUser(userRecord) {
  // providerData가 비어 있으면(길이 0) 익명 사용자로 간주
  return (userRecord.providerData || []).length === 0;
}

async function listAllUsers() {
  const all = [];
  let nextToken = undefined;
  do {
    const res = await admin.auth().listUsers(1000, nextToken);
    all.push(...res.users);
    nextToken = res.pageToken;
  } while (nextToken);
  return all;
}

function inDaysModePredicate(cutoffMs) {
  return (u) => {
    const createdMs = new Date(u.metadata.creationTime).getTime();
    return isAnonymousUser(u) && createdMs <= cutoffMs;
  };
}

function inRangeModePredicate(startMs, endMs) {
  return (u) => {
    const createdMs = new Date(u.metadata.creationTime).getTime();
    return isAnonymousUser(u) && createdMs >= startMs && createdMs < endMs;
  };
}

async function run() {
  const { dry, start, end, days, limit } = parseArgs();

  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  // 모드 결정
  let predicate, label;
  if (start || end) {
    const s = start ? toUtcStart(start).getTime() : Number.NEGATIVE_INFINITY;
    const e = end   ? toUtcEnd(end).getTime()   : Date.now();
    if (!(s < e)) {
      console.error('[ERR] 잘못된 날짜 범위입니다. start < end 여야 합니다.');
      process.exit(1);
    }
    predicate = inRangeModePredicate(s, e);
    label = `RANGE ${start || '-∞'} ~ ${end || 'now'} (UTC, end 미포함)`;
  } else {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    predicate = inDaysModePredicate(cutoff);
    label = `OLDER_THAN ${days} days (cutoff=${new Date(cutoff).toISOString()})`;
  }

  console.log('=== Anonymous Users Cleanup ===');
  console.log('Mode :', label);
  console.log('Dry? :', dry);
  console.log('Limit:', limit);
  console.log('--------------------------------');

  // 1) Auth 전체 로드 후 대상 필터
  const all = await listAllUsers();
  const targets = all.filter(predicate).slice(0, limit);
  const targetUids = targets.map(u => u.uid);
  console.log(`Auth users total: ${all.length}`);
  console.log(`Candidates      : ${targets.length}`);
  if (targets.length === 0) {
    console.log('삭제 대상이 없습니다. 종료합니다.');
    return;
  }

  // 미리보기
  const sample = targets.slice(0, 10).map(u => ({
    uid: u.uid,
    createdAt: u.metadata.creationTime,
    email: u.email || '',
    phone: u.phoneNumber || '',
    anon: isAnonymousUser(u),
  }));
  console.table(sample);

  if (dry) {
    console.log('[DRY RUN] 실제 삭제는 수행하지 않습니다.');
    return;
  }

  // 2) 삭제 실행
  const writer = db.bulkWriter();
  // 오류가 나도 계속 진행
  writer.onWriteError((err) => {
    console.warn('[BulkWriter] write error:', err);
    return true; // 계속
  });

  // (a) Firestore users 문서 삭제 (doc id = uid 우선)
  let dbDeletes = 0;
  for (const uid of targetUids) {
    // users/{uid}
    writer.delete(db.collection('users').doc(uid));
    dbDeletes++;
  }
  // (b) 보조: 문서 id가 uid가 아닌 케이스까지 안전하게
  //    uid 필드가 있는 문서를 찾아 추가로 지움 (비용 고려, 큰 규모면 주석 처리 가능)
  for (const uid of targetUids) {
    const qs = await db.collection('users').where('uid', '==', uid).get();
    qs.forEach(snap => {
      writer.delete(snap.ref);
      dbDeletes++;
    });
  }

  await writer.close();
  console.log(`Firestore users deleted (requests queued): ~${dbDeletes}`);

  // (c) Authentication 사용자 삭제
  let authDelOk = 0, authDelFail = 0;
  // 간단한 동시성 제한
  const concurrency = 20;
  let i = 0, active = 0;
  await new Promise((resolve) => {
    const next = () => {
      while (active < concurrency && i < targetUids.length) {
        const uid = targetUids[i++];
        active++;
        admin.auth().deleteUser(uid)
          .then(() => { authDelOk++; })
          .catch((e) => { authDelFail++; console.warn('[Auth] deleteUser failed:', uid, e?.errorInfo || e?.message || e); })
          .finally(() => { active--; next(); });
      }
      if (i >= targetUids.length && active === 0) resolve();
    };
    next();
  });

  console.log('--- 결과 ---');
  console.log('Auth deleted  :', authDelOk);
  console.log('Auth failed   :', authDelFail);
  console.log('DB users      :', dbDeletes, '(queued via BulkWriter)');
  console.log('완료');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
