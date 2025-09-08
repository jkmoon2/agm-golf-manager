// src/firebase.js

// Firebase SDK v9 모듈식 초기화로 전환
// 기존 compat import 대신 @firebase/app 및 @firebase/firestore, auth 모듈 사용
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence
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

// ──────────────────────────────────────────────
// ★ 추가: 인증 지속성(localStorage) + /player에서 자동 익명 로그인
// ──────────────────────────────────────────────
try {
  setPersistence(auth, browserLocalPersistence);
} catch { /* noop */ }

const isPlayerApp =
  typeof window !== 'undefined' &&
  /^\/player(\/|$)/.test(window.location.pathname);

// 인증 준비 Promise: 인증(일반/익명) 후 resolve
export const whenAuthed = new Promise((resolve) => {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      resolve(user);
      return;
    }
    // 아직 미인증이고 /player 라우트면 익명 로그인 시도
    if (isPlayerApp) {
      try {
        await signInAnonymously(auth);
        // 익명 로그인 직후 onAuthStateChanged 가 다시 호출되며 resolve 됨
      } catch (e) {
        console.warn('[firebase] Anonymous sign-in failed:', e);
      }
    }
    // /admin 등에서는 별도 로그인 흐름(기존) 유지
  });
});
