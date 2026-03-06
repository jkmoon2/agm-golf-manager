// Auth의 생성시각(metadata.creationTime)으로 Firestore users/{uid}.createdAt 보정
const admin = require('firebase-admin');

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

async function main(){
  let pageToken;
  let count = 0, updated = 0;
  do{
    const res = await admin.auth().listUsers(1000, pageToken);
    for(const u of res.users){
      count++;
      const created = new Date(u.metadata.creationTime);
      const ref = db.collection('users').doc(u.uid);
      const snap = await ref.get();
      if(!snap.exists) continue;
      await ref.set({
        uid: u.uid,
        email: u.email || '',
        name: u.displayName || '',
        createdAt: admin.firestore.Timestamp.fromDate(created)  // ★ 보정
      }, { merge: true });
      updated++;
      console.log('updated', u.uid, u.email, created.toISOString().slice(0,10));
    }
    pageToken = res.pageToken;
  } while(pageToken);
  console.log('done. scanned=', count, 'updated=', updated);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
