// /src/contexts/PlayerAuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged, setPersistence,
  browserLocalPersistence, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendPasswordResetEmail,
  linkWithCredential, EmailAuthProvider, signOut
} from 'firebase/auth';
import { auth, ensureAnonAfterCode } from '../firebase';

const Ctx = createContext(null);
export const usePlayerAuth = () => useContext(Ctx);

export default function PlayerAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(()=>{});
    const off = onAuthStateChanged(auth, (u) => { setUser(u); setReady(true); });
    return () => off();
  }, []);

  const ensureAnonymous = async (eventId = '') => {
    // 인증코드 입장 흐름에서만 익명 로그인을 보장합니다.
    // 이메일 세션이 복원 중일 수 있으므로 즉시 signInAnonymously 하지 않습니다.
    if (!auth.currentUser) {
      await ensureAnonAfterCode(eventId);
    }
    return auth.currentUser;
  };

  const signUpEmail = async (email, password) => {
    // 이메일 회원은 자동 로그인/재방문을 위해 local persistence를 명시적으로 적용합니다.
    await setPersistence(auth, browserLocalPersistence).catch(()=>{});
    // 익명사용자였다면 링크(데이터 유지), 아니면 신규생성
    // LoginOrCode.jsx에서 cred.user 형태로 안정적으로 처리할 수 있도록 반환값 통일
    const anon = auth.currentUser && auth.currentUser.isAnonymous;
    if (anon) {
      const cred = EmailAuthProvider.credential(email, password);
      return await linkWithCredential(auth.currentUser, cred);
    }
    return await createUserWithEmailAndPassword(auth, email, password);
  };

  const signInEmail = async (email, password) => {
    // 로그인 화면 진입 전 firebase.js에서 session persistence가 적용될 수 있으므로,
    // 이메일 로그인 직전에 local persistence를 다시 명시해 브라우저 종료 후에도 세션이 유지되게 합니다.
    await setPersistence(auth, browserLocalPersistence).catch(()=>{});
    return signInWithEmailAndPassword(auth, email, password);
  };

  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  const logout = () => signOut(auth);

  const value = { user, ready, ensureAnonymous, signUpEmail, signInEmail, resetPassword, logout };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
