// src/contexts/AuthContext.jsx

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut
} from 'firebase/auth';

const AuthContext = createContext({
  firebaseUser: null,
  appRole:      null,
  loginAdmin:   async () => {},
  loginPlayer:  async () => {},
  logout:       async () => {}
});

export function AuthProvider({ children }) {
  const auth = getAuth();
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [appRole,      setAppRole]      = useState(null);

  // ▶ Firebase Auth 상태 구독
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setFirebaseUser(user);
      // user가 null이 되면 role도 null로
      if (!user) setAppRole(null);
    });
    return unsub;
  }, [auth]);

  // ▶ 운영자 로그인
  const loginAdmin = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    setAppRole('admin');
    return cred.user;
  };

  // ▶ 참가자(익명) 로그인
  const loginPlayer = async () => {
    const cred = await signInAnonymously(auth);
    setAppRole('player');
    return cred.user;
  };

  // ▶ 로그아웃
  const logout = async () => {
    await signOut(auth);
    setAppRole(null);
  };

  return (
    <AuthContext.Provider value={{
      firebaseUser,
      appRole,
      loginAdmin,
      loginPlayer,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// 훅으로 내보내기
export function useAuth() {
  return useContext(AuthContext);
}
