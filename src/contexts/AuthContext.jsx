// src/contexts/AuthContext.jsx

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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

  // [PATCH] appRole을 ref로도 유지해서 auth state 변화(특히 익명 전환) 감지에 사용
  const appRoleRef = useRef(null);
  useEffect(() => { appRoleRef.current = appRole; }, [appRole]);

  // ▶ Firebase Auth 상태 구독
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setFirebaseUser(user);
      // [PATCH] role은 "현재 auth 사용자" 기준으로 결정(새로고침/리로드/토큰갱신에도 유지)
      if (!user) {
        setAppRole(null);
        return;
      }

      // 익명(참가자) / 비익명(운영자) 구분
      if (user.isAnonymous) {
        // 운영자(admin)였다가 익명으로 바뀌는 경우는 경고(같은 브라우저에서 참가자 로그인 등)
        if (appRoleRef.current === 'admin') {
          console.warn('[Auth] admin session switched to anonymous. (same browser session)');
        }
        setAppRole('player');
      } else {
        setAppRole('admin');
      }
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
    // [PATCH] 같은 브라우저에서 운영자 로그인 상태면 참가자(익명) 로그인으로 세션이 덮어써질 수 있음
    if (auth.currentUser && !auth.currentUser.isAnonymous && appRoleRef.current === 'admin') {
      alert(
        '현재 운영자 로그인 상태입니다.\n' +
        '같은 브라우저에서는 참가자(익명) 로그인을 동시에 유지할 수 없습니다.\n' +
        '참가자 테스트는 시크릿 창(Incognito) 또는 다른 브라우저/기기에서 진행해주세요.'
      );
      return auth.currentUser;
    }

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
