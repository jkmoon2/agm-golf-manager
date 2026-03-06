// src/createEvents.mjs

import 'dotenv/config'; 

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

// 1) Firebase 앱 초기화 (firebase.js와 동일한 설정)
const firebaseConfig = {
  apiKey: "AIzaSyD_9AmDInzzn45aAzfNcjXIHRx27aDO0QY",
  authDomain: "agm-golf-manager.firebaseapp.com",
  projectId: "agm-golf-manager",
  storageBucket: "agm-golf-manager.firebasestorage.app",
  messagingSenderId: "521632418622",
  appId: "1:521632418622:web:50aca7cb09b99c290efa6f",
  measurementId: "G-XHPZ2W4RPQ"
};
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

async function createEvents() {
  const specs = [
    { id: 'stroke-1', mode: 'stroke', title: '안골모 스트로크 #1' },
    { id: 'stroke-2', mode: 'stroke', title: '안골모 스트로크 #2' },
    { id:    'agm-1', mode:    'agm', title: '안골모 포볼   #1' },
    { id:    'agm-2', mode:    'agm', title: '안골모 포볼   #2' },
  ];

  for (const { id, mode, title } of specs) {
    await setDoc(doc(db, 'events', id), {
      mode,
      title,
      roomCount:    4,
      roomNames:    ['A','B','C','D'],
      uploadMethod: '',
      updatedAt:    serverTimestamp(),
    });
    console.log(`✅ 이벤트 문서 “events/${id}” 생성 완료`);
  }
}

createEvents().catch(console.error);
