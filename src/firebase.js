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
  browserLocalPersistence,
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
if (typeof window !== 'undefined') window.auth = auth;

// ─────────────────────────────────────────────────────────────
// [ADD] 인증 복원/인증코드 전용 익명 진입 제어
// - 이메일 로그인 세션은 browserLocalPersistence로 유지
// - 인증코드 1회성 상태는 기존처럼 sessionStorage(auth_*, pending_code)가 담당
// - 앱/화면 진입만으로 익명 로그인하지 않고, 인증코드 흐름이 확인될 때만 익명 로그인
function hasSessionCodeAuth(eventId = '') {
  try {
    if (sessionStorage.getItem('pending_code')) return true;
    if (eventId && sessionStorage.getItem(`auth_${eventId}`) === 'true') return true;
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('auth_') && sessionStorage.getItem(k) === 'true') return true;
    }
  } catch {}
  return false;
}
export function hasPlayerCodeSession(eventId = '') {
  return hasSessionCodeAuth(eventId);
}

let authRestorePromise = null;
export function waitForAuthRestored(timeoutMs = 1800) {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (authRestorePromise) return authRestorePromise;

  authRestorePromise = new Promise((resolve) => {
    let done = false;
    let off = null;
    const finish = (user) => {
      if (done) return;
      done = true;
      try { if (off) off(); } catch {}
      const ret = user || auth.currentUser || null;
      authRestorePromise = null;
      resolve(ret);
    };

    try {
      off = onAuthStateChanged(auth, (user) => {
        finish(user || null);
      });
    } catch {
      finish(auth.currentUser || null);
      return;
    }

    setTimeout(() => finish(auth.currentUser || null), timeoutMs);
  });

  return authRestorePromise;
}

export async function ensureAnonAfterCode(eventId = '', opts = {}) {
  try {
    const restored = await waitForAuthRestored(opts.timeoutMs || 1800);
    if (restored) return restored;
    if (!hasSessionCodeAuth(eventId)) return null;
    const cred = await signInAnonymously(auth);
    return cred?.user || auth.currentUser || null;
  } catch (err) {
    console.warn('[Auth] ensureAnonAfterCode failed:', err);
    return auth.currentUser || null;
  }
}

// 과거 코드 호환용 이름은 유지하되, localStorage 영구 플래그는 더 이상 사용하지 않습니다.
export function markCodeOk(eventId) {
  try { if (eventId) sessionStorage.setItem(`auth_${eventId}`, 'true'); } catch {}
}
export function clearCodeOk(eventId) {
  try { if (eventId) sessionStorage.removeItem(`auth_${eventId}`); } catch {}
}

// [ADD][FIX] 이메일 회원 자동 로그인 보존을 위해 기본 지속성은 local로 둡니다.
// 인증코드 1회성 여부는 Firebase persistence가 아니라 sessionStorage로 유지합니다.
setPersistence(auth, browserLocalPersistence).catch(err => {
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

// [ADD] 상태변경: 이메일 회원이면 프로필만 보강합니다.
// 로그인 화면/앱 초기 진입만으로 익명 계정이 생성되면 이메일 세션 복원과 충돌할 수 있으므로,
// 익명 로그인은 인증코드 검증 이후 흐름에서만 ensureAnonAfterCode()로 실행합니다.
onAuthStateChanged(auth, (user) => {
  if (user) { ensureUserProfile(user); }
});

// [NOTE]
// - 익명은 참가/점수 입력 가능(규칙에서 isAuthed() 허용)하되 users 문서는 만들지 않습니다.
// - 인증코드 운영의 브라우저 닫기 초기화는 sessionStorage가 담당합니다.
