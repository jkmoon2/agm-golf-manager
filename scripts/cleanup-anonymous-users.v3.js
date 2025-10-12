// /scripts/cleanup-anonymous-users.v3.js
//
// 차이점:
// 1) --creds=경로, --project=프로젝트ID 로 직접 지정 가능 (env 없이도 OK)
// 2) 날짜 범위(end 미포함) 계산 버그 수정: toUtcEnd는 다음날 00:00:00Z
// 3) 초기화/로그 보강: 실제 사용 프로젝트 ID를 출력
//
// 사용 예:
//   node scripts/cleanup-anonymous-users.v3.js --creds="C:\...\serviceAccount.json" --project=agm-golf-manager --start=2025-09-01 --end=2025-09-30 --dry
//   CLEANUP_DAYS=10 node scripts/cleanup-anonymous-users.v3.js --creds=./serviceAccount.json --project=agm-golf-manager

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (key) => {
    const hit = args.find(a => a.startsWith(`${key}=`));
    return hit ? hit.split('=').slice(1).join('=') : null;
  };
  return {
    dry: args.includes('--dry'),
    start: get('--start'),             // 'YYYY-MM-DD'
    end: get('--end'),                 // 'YYYY-MM-DD'
    days: Number(process.env.CLEANUP_DAYS || get('--days') || 7),
    limit: Number(get('--limit') || 1_000_000),
    creds: get('--creds') || process.env.GOOGLE_APPLICATION_CREDENTIALS || null,
    project: get('--project') || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || null,
  };
}

function toUtcStart(dateStr) {           // 'YYYY-MM-DD' → 그 날 00:00:00Z
  return new Date(`${dateStr}T00:00:00.000Z`);
}
function toUtcEnd(dateStr) {             // 'YYYY-MM-DD' → **다음날** 00:00:00Z (미포함 경계)
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function isAnonymousUser(userRecord) {
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

function initAdmin(credsPath, projectId) {
  if (admin.apps.length) return;

  if (credsPath) {
    const abs = path.resolve(credsPath);
    const json = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const pid = projectId || json.project_id;
    if (!pid) {
      console.error('[ERR] 프로젝트 ID를 찾을 수 없습니다. --project 플래그로 명시하세요.');
      process.exit(1);
    }
    admin.initializeApp({
      credential: admin.credential.cert(json),
      projectId: pid,
    });
    console.log('[init] via service account file:', abs);
    console.log('[init] projectId:', pid);
  } else {
    // ADC (GOOGLE_APPLICATION_CREDENTIALS 또는 gcloud ADC)
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: projectId || undefined,
    });
    console.log('[init] via applicationDefault()');
    console.log('[init] projectId:', admin.app().options.projectId || '(none resolved)');
  }
}

async function run() {
  const args = parseArgs();
  initAdmin(args.creds, args.project);
  const db = admin.firestore();

  // 모드 결정
  let predicate, label;
  if (args.start || args.end) {
    const s = args.start ? toUtcStart(args.start).getTime() : Number.NEGATIVE_INFINITY;
    const e = args.end   ? toUtcEnd(args.end).getTime()   : Date.now();
    if (!(s < e)) {
      console.error('[ERR] 잘못된 날짜 범위입니다. start < end 여야 합니다.');
      process.exit(1);
    }
    predicate = inRangeModePredicate(s, e);
    label = `RANGE ${args.start || '-∞'} ~ ${args.end || 'now'} (UTC, end 미포함)`;
  } else {
    const cutoff = Date.now() - args.days * 24 * 60 * 60 * 1000;
    predicate = inDaysModePredicate(cutoff);
    label = `OLDER_THAN ${args.days} days (cutoff=${new Date(cutoff).toISOString()})`;
  }

  console.log('=== Anonymous Users Cleanup ===');
  console.log('Mode :', label);
  console.log('Dry? :', !!args.dry);
  console.log('Limit:', args.limit);
  console.log('--------------------------------');

  const all = await listAllUsers();
  const targets = all.filter(predicate).slice(0, args.limit);
  const targetUids = targets.map(u => u.uid);
  console.log(`Auth users total: ${all.length}`);
  console.log(`Candidates      : ${targets.length}`);
  if (targets.length === 0) {
    console.log('삭제 대상이 없습니다. 종료합니다.');
    return;
  }

  console.table(targets.slice(0, 10).map(u => ({
    uid: u.uid,
    createdAt: u.metadata.creationTime,
    email: u.email || '',
    anon: isAnonymousUser(u),
  })));

  if (args.dry) {
    console.log('[DRY RUN] 실제 삭제는 수행하지 않습니다.');
    return;
  }

  // Firestore users 문서 삭제
  const writer = db.bulkWriter();
  writer.onWriteError((err) => { console.warn('[BulkWriter] write error:', err); return true; });

  let dbDeletes = 0;
  for (const uid of targetUids) {
    writer.delete(db.collection('users').doc(uid)); // users/{uid}
    dbDeletes++;
  }
  // uid 필드로도 확인(아이디가 다른 경우)
  for (const uid of targetUids) {
    const qs = await db.collection('users').where('uid', '==', uid).get();
    qs.forEach(snap => { writer.delete(snap.ref); dbDeletes++; });
  }
  await writer.close();
  console.log(`Firestore users deleted (queued): ~${dbDeletes}`);

  // Auth 사용자 삭제
  let ok = 0, fail = 0;
  const concurrency = 20;
  let i = 0, active = 0;
  await new Promise((resolve) => {
    const next = () => {
      while (active < concurrency && i < targetUids.length) {
        const uid = targetUids[i++];
        active++;
        admin.auth().deleteUser(uid)
          .then(() => { ok++; })
          .catch((e) => { fail++; console.warn('[Auth] deleteUser failed:', uid, e?.errorInfo || e?.message || e); })
          .finally(() => { active--; next(); });
      }
      if (i >= targetUids.length && active === 0) resolve();
    };
    next();
  });

  console.log('--- 결과 ---');
  console.log('Auth deleted  :', ok);
  console.log('Auth failed   :', fail);
  console.log('DB users      :', dbDeletes);
  console.log('완료');
}

run().catch(e => { console.error(e); process.exit(1); });
