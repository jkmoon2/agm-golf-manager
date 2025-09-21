// /src/firebase.js

// Firebase SDK v9 모듈식 초기화로 전환
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInAnonymously,
  onAuthStateChanged
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyD_9AmDInzzn45aAzfNcjXIHRx27aDO0QY",
  authDomain: "agm-golf-manager.firebaseapp.com",
  projectId: "agm-golf-manager",
  storageBucket: "agm-golf-manager.firebasestorage.app",
  messagingSenderId: "521632418622",
  appId: "1:521632418622:web:50aca7cb09b99c290efa6f",
  measurementId: "G-XHPZ2W4RPQ"
};

// 앱 초기화
const app = initializeApp(firebaseConfig);

// Firestore 인스턴스
export const db = getFirestore(app);

// Auth 인스턴스
export const auth = getAuth(app);

// [ADD] 인증 지속성(Local) + 익명 로그인 보장
setPersistence(auth, browserLocalPersistence)
  .catch(err => console.warn('[Auth] setPersistence failed:', err));

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth).catch(err => {
      console.warn('[Auth] signInAnonymously failed:', err);
    });
  }
});
