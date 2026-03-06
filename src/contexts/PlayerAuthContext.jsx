// /src/contexts/PlayerAuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged, signInAnonymously, setPersistence,
  browserLocalPersistence, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendPasswordResetEmail,
  linkWithCredential, EmailAuthProvider, signOut
} from 'firebase/auth';
import { auth } from '../firebase';

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

  const ensureAnonymous = async () => {
    if (!auth.currentUser) await signInAnonymously(auth);
    return auth.currentUser;
  };

  const signUpEmail = async (email, password) => {
    // 익명사용자였다면 링크(데이터 유지), 아니면 신규생성
    const anon = auth.currentUser && auth.currentUser.isAnonymous;
    if (anon) {
      const cred = EmailAuthProvider.credential(email, password);
      await linkWithCredential(auth.currentUser, cred);
      return auth.currentUser;
    }
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    return user;
  };

  const signInEmail = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  const logout = () => signOut(auth);

  const value = { user, ready, ensureAnonymous, signUpEmail, signInEmail, resetPassword, logout };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
