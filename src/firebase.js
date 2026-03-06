// src/firebase.js

// Firebase SDK v9 모듈식 초기화로 전환
// 기존 compat import 대신 @firebase/app 및 @firebase/firestore, auth 모듈 사용
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// [ADD] Firestore 보완: users 프로필 ensure 용 (기존 import는 유지)
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// [ADD] Auth 보완: 세션 지속성/익명로그인/onAuthStateChanged
import {
  setPersistence,
  browserSessionPersistence,
  signInAnonymously,
  onAuthStateChanged,
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

// ─────────────────────────────────────────────────────────────
// [ADD] 인증코드 통과 플래그(이벤트별) + 익명 진입 제어
const CODE_PREFIX = 'code.ok:';
function hasAnyCodeOk() {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CODE_PREFIX) && localStorage.getItem(k) === '1') return true;
    }
  } catch {}
  return false;
}
export function markCodeOk(eventId) { try { localStorage.setItem(`${CODE_PREFIX}${eventId}`, '1'); } catch {} }
export function clearCodeOk(eventId) { try { localStorage.removeItem(`${CODE_PREFIX}${eventId}`); } catch {} }
export async function ensureAnonAfterCode() {
  try {
    if (!auth.currentUser && hasAnyCodeOk()) { await signInAnonymously(auth); }
  } catch (err) {
    console.warn('[Auth] ensureAnonAfterCode failed:', err);
  }
}

// [ADD][FIX] 세션 지속성(탭 닫을 때까지 유지)
setPersistence(auth, browserSessionPersistence).catch(err => {
  console.warn('[Auth] setPersistence failed:', err);
});

// [ADD] 이메일/패스워드 회원만 users/{uid} 생성(익명은 금지)
async function ensureUserProfile(user){
  try{
    if(!user || user.isAnonymous) return; // ★ 익명은 users 문서 생성 안 함

    const uid = user.uid;
    const key = `profileEnsured:${uid}`;
    if(localStorage.getItem(key)==='1') return; // 1회만

    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if(!snap.exists()){
      const createdAt =
        (user.metadata && user.metadata.creationTime)
          ? new Date(user.metadata.creationTime)
          : new Date();
      await setDoc(ref, {
        email: user.email || '',
        name: user.displayName || '',
        createdAt,                     // 실제 가입일 보관
        createdAtSrc: 'auth.metadata', // 진단용
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    localStorage.setItem(key,'1');
  }catch(err){
    console.warn('[Auth] ensureUserProfile failed:', err);
  }
}

// [ADD] 상태변경: 코드 통과자만 익명 로그인 1회 생성, 회원이면 프로필 ensure
onAuthStateChanged(auth, (user) => {
  if (user) { ensureUserProfile(user); }
  if (!user && hasAnyCodeOk()) {
    signInAnonymously(auth).catch(err => console.warn('[Auth] signInAnonymously failed:', err));
  }
});

// [NOTE]
// - 익명은 참가/점수 입력 가능(규칙에서 isParticipant() 허용)하되 users 문서는 만들지 않습니다.
// - 재시작하면 세션 만료 → 다시 인증코드(요구사항 맞춤)
