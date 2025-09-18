// /src/player/screens/LoginOrCode.jsx

import React, { useState, useContext } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { EventContext } from '../../contexts/EventContext';
import PlayerAuthProvider, { usePlayerAuth } from '../../contexts/PlayerAuthContext';
import styles from './LoginOrCode.module.css';

function InnerLoginOrCode({ onEnter }) {
  const { eventId } = useContext(EventContext) || {};
  const { user, ready, ensureAnonymous, signUpEmail, signInEmail, resetPassword } = usePlayerAuth();

  const [tab, setTab] = useState('login'); // 'login' | 'code'
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');

  if (!ready) return null;

  const normalize = (v) => String(v || '').trim().toLowerCase();
  const setLoginTicket = (evtId) => {
    try { localStorage.setItem(`ticket:${evtId}`, JSON.stringify({ via: 'login', ts: Date.now() })); } catch {}
  };
  const setCodeTicket = (evtId, c) => {
    try { localStorage.setItem(`ticket:${evtId}`, JSON.stringify({ code: String(c||''), ts: Date.now() })); } catch {}
  };

  const syncMembershipAndLinkParticipant = async (firebaseUser, evtId) => {
    if (!firebaseUser || !evtId) return;
    const { uid, email: uEmail } = firebaseUser;

    const memRef = doc(db, 'events', evtId, 'memberships', uid);
    await setDoc(memRef, { uid, email: uEmail || null, joinedAt: new Date().toISOString() }, { merge: true });

    const evRef = doc(db, 'events', evtId);
    const snap = await getDoc(evRef);
    const data = snap.data() || {};
    const arr = Array.isArray(data.participants) ? [...data.participants] : [];
    if (arr.length === 0) return;

    const emailNorm = normalize(uEmail);
    let idx = -1;
    idx = arr.findIndex(p => p && p.uid === uid);
    if (idx < 0 && emailNorm) idx = arr.findIndex(p => normalize(p?.email) === emailNorm);
    if (idx < 0 && emailNorm) idx = arr.findIndex(p => normalize(p?.userId) === emailNorm);

    if (idx >= 0) {
      const target = { ...arr[idx] };
      let changed = false;
      if (target.uid !== uid) { target.uid = uid; changed = true; }
      if (!target.email && uEmail) { target.email = uEmail; changed = true; }
      if (changed) {
        arr[idx] = target;
        await setDoc(evRef, { participants: arr }, { merge: true });
      }
    }
  };

  const handleLogin = async () => {
    await signInEmail(email, pw);
    try {
      if (eventId && user) {
        await syncMembershipAndLinkParticipant(user, eventId);
        setLoginTicket(eventId);
      }
    } catch (e) { console.warn('post-login sync failed:', e); }
    onEnter?.();
  };

  const handleSignUp = async () => {
    await signUpEmail(email, pw);
    try {
      if (eventId && user) {
        await syncMembershipAndLinkParticipant(user, eventId);
        setLoginTicket(eventId);
      }
    } catch (e) { console.warn('post-signup sync failed:', e); }
    onEnter?.();
  };

  const handleReset = async () => {
    await resetPassword(email);
    alert('입력한 이메일로 비밀번호 재설정 메일을 보냈습니다(계정이 존재하는 경우).');
  };

  const handleCode = async () => {
    await ensureAnonymous();
    if (!eventId) { alert('이벤트가 선택되지 않았습니다.'); return; }
    const snap = await getDoc(doc(db, 'events', eventId));
    const data = snap.data() || {};
    const ok = Array.isArray(data.participants)
      && data.participants.some(p => String(p.authCode || '').trim() === String(code).trim());
    if (!ok) { alert('인증코드가 올바르지 않습니다.'); return; }
    setCodeTicket(eventId, code);
    onEnter?.();
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h2 className={styles.title}>로그인</h2>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab==='login' ? styles.active : ''}`}
            onClick={() => setTab('login')}
          >
            참가자
          </button>
          <button
            className={`${styles.tab} ${tab==='code' ? styles.active : ''}`}
            onClick={() => setTab('code')}
          >
            인증코드
          </button>
        </div>

        {tab === 'login' ? (
          <div className={styles.form}>
            <input className={styles.input} placeholder="이메일" value={email} onChange={e=>setEmail(e.target.value)} />
            <input className={styles.input} placeholder="비밀번호" type="password" value={pw} onChange={e=>setPw(e.target.value)} />
            <div className={styles.actions}>
              <button className={styles.primary} onClick={handleLogin}>로그인</button>
              <button className={styles.ghost} onClick={handleSignUp}>회원가입</button>
              <button className={styles.link} onClick={handleReset}>비번 재설정</button>
            </div>
          </div>
        ) : (
          <div className={styles.form}>
            <input className={styles.input} placeholder="인증코드 6자리" value={code} onChange={e=>setCode(e.target.value)} />
            <div className={styles.actions}>
              <button className={styles.primary} onClick={handleCode}>코드로 입장</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginOrCode(props) {
  return (
    <PlayerAuthProvider>
      <InnerLoginOrCode {...props} />
    </PlayerAuthProvider>
  );
}
