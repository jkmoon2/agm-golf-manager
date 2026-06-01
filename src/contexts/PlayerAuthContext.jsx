// /src/contexts/PlayerAuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged, setPersistence,
  browserLocalPersistence, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendPasswordResetEmail,
  linkWithCredential, EmailAuthProvider, signOut, updateProfile
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

  const signUpEmail = async (email, password, name = '') => {
    // 이메일 회원은 자동 로그인/재방문을 위해 local persistence를 명시적으로 적용합니다.
    await setPersistence(auth, browserLocalPersistence).catch(()=>{});

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '');
    const cleanName = String(name || '').trim();

    const makeFriendlyAlreadyInUseError = (cause) => {
      const e = new Error('이미 가입된 이메일입니다. 기존 비밀번호로 로그인하거나, 비밀번호를 모르면 비번 재설정을 이용해 주세요.');
      e.code = 'agm/email-already-registered';
      e.cause = cause;
      return e;
    };

    const applyDisplayName = async (result) => {
      const u = result?.user || result;
      if (u?.uid && cleanName && u.displayName !== cleanName) {
        try { await updateProfile(u, { displayName: cleanName }); } catch {}
      }
      return result;
    };

    // 이미 Auth 계정이 만들어진 이메일인 경우에는, 같은 비밀번호로 로그인 가능하면
    // "가입 완료" 흐름으로 복구합니다. 비밀번호가 다르면 새 가입이 아니라 기존 계정 안내를 띄웁니다.
    const signInExistingEmailAccount = async (cause) => {
      try {
        await setPersistence(auth, browserLocalPersistence).catch(()=>{});
        const signed = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        return await applyDisplayName(signed);
      } catch (signInErr) {
        if (
          signInErr?.code === 'auth/wrong-password' ||
          signInErr?.code === 'auth/invalid-credential' ||
          signInErr?.code === 'auth/invalid-login-credentials'
        ) {
          throw makeFriendlyAlreadyInUseError(cause || signInErr);
        }
        throw signInErr;
      }
    };

    const createEmailAccount = async () => {
      try {
        const created = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        return await applyDisplayName(created);
      } catch (err) {
        // 회원가입 도중 네트워크 오류 후 실제 Auth 계정만 생성되어 다음 시도에서
        // auth/email-already-in-use가 나올 수 있으므로, 같은 비밀번호로 로그인되면 정상 가입 완료로 복구합니다.
        if (err?.code === 'auth/email-already-in-use' || err?.code === 'auth/credential-already-in-use') {
          return await signInExistingEmailAccount(err);
        }
        throw err;
      }
    };

    // 익명사용자였다면 링크(데이터 유지), 아니면 신규생성
    // LoginOrCode.jsx에서 cred.user 형태로 안정적으로 처리할 수 있도록 반환값 통일
    const anon = auth.currentUser && auth.currentUser.isAnonymous;
    if (anon) {
      const credential = EmailAuthProvider.credential(cleanEmail, cleanPassword);
      try {
        const linked = await linkWithCredential(auth.currentUser, credential);
        return await applyDisplayName(linked);
      } catch (err) {
        // linkWithCredential 단계에서 이미 가입된 이메일이면 신규 생성이 아니라 기존 계정 로그인 복구가 맞습니다.
        if (err?.code === 'auth/email-already-in-use' || err?.code === 'auth/credential-already-in-use') {
          try { await signOut(auth); } catch {}
          return await signInExistingEmailAccount(err);
        }

        // 라이브 운영 중 일부 기기에서 익명 세션 link 단계가 auth/network-request-failed로 실패하는 경우가 있어,
        // 실제 이메일 계정 생성/복구 흐름을 한 번 더 안전하게 재시도합니다.
        if (err?.code !== 'auth/network-request-failed') throw err;
        try { await signOut(auth); } catch {}
        await setPersistence(auth, browserLocalPersistence).catch(()=>{});
        return await createEmailAccount();
      }
    }
    return await createEmailAccount();
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
