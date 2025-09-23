// /src/auth/SignUp.jsx
// [ADD] 모든 필드 필수, 이미 가입된 이메일 처리, 가입 성공 시 Firestore members/{uid} 생성
// [ADD] 로그인 시에도 ensureMemberDoc()으로 보정 가능하도록 함수 분리(다른 화면에서 재사용)

import React, { useState } from 'react';
import { getAuth, fetchSignInMethodsForEmail, createUserWithEmailAndPassword, updateProfile, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import styles from './Auth.module.css';

const db = getFirestore();
const auth = getAuth();

export async function ensureMemberDoc(user, extra = {}) {
  if (!user?.uid) return;
  const ref = doc(db, 'members', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email || '',
      name: user.displayName || extra.name || '',
      createdAt: serverTimestamp(),
      ...extra,
    }, { merge: true });
  }
}

export default function SignUp() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [busy, setBusy] = useState(false);
  const valid = email.trim() && password.trim().length >= 6 && name.trim();

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;

    try {
      setBusy(true);
      await setPersistence(auth, browserLocalPersistence);

      // 이미 가입 여부 체크
      const methods = await fetchSignInMethodsForEmail(auth, email.trim());
      if (methods && methods.length > 0) {
        alert('이미 가입된 이메일입니다. 로그인하거나 비밀번호 재설정을 진행해 주세요.');
        setBusy(false);
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password.trim());
      if (name.trim()) {
        await updateProfile(cred.user, { displayName: name.trim() });
      }
      await ensureMemberDoc(cred.user, { name: name.trim() });

      alert('가입이 완료되었습니다. 로그인 상태로 이동합니다.');
      // 필요 시 라우팅
      // navigate('/'); 
    } catch (err) {
      console.error('[SignUp] error:', err);
      alert(err?.message || '가입 처리 중 오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.panel /* 파란 테두리는 CSS에서 */}>
      <h2 className={styles.title}>회원가입</h2>
      <form onSubmit={onSubmit} className={styles.form}>
        <input type="email" placeholder="이메일" value={email} onChange={(e)=>setEmail(e.target.value)} required />
        <input type="password" placeholder="비밀번호(6자 이상)" value={password} onChange={(e)=>setPassword(e.target.value)} required minLength={6}/>
        <input type="text" placeholder="이름" value={name} onChange={(e)=>setName(e.target.value)} required />
        <div className={styles.row}>
          <button type="button" className={styles.btnGhost} disabled={busy} onClick={()=>{ setEmail(''); setPassword(''); setName(''); }}>취소</button>
          <button type="submit" className={styles.btnPrimary} disabled={!valid || busy}>{busy ? '처리 중…' : '가입 신청'}</button>
        </div>
      </form>
    </div>
  );
}
