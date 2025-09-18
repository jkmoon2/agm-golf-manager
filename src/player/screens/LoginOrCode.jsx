// /src/player/screens/LoginOrCode.jsx

import React, { useState, useContext } from 'react';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { EventContext } from '../../contexts/EventContext';
import PlayerAuthProvider, { usePlayerAuth } from '../../contexts/PlayerAuthContext';
import styles from './LoginOrCode.module.css';

function InnerLoginOrCode({ onEnter }) {
  const navigate = useNavigate();
  const { eventId, eventData } = useContext(EventContext) || {};
  const { user, ready, ensureAnonymous, signUpEmail, signInEmail, resetPassword } = usePlayerAuth();

  const [tab, setTab] = useState('login'); // 'login' | 'code'
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false); // ◀ 로딩 상태

  if (!ready) return null;

  const normalize = (v) => String(v || '').trim().toLowerCase();
  const goNext = () => {
    if (typeof onEnter === 'function') onEnter();
    else if (eventId) navigate(`/player/home/${eventId}/1`, { replace: true });
  };
  const setLoginTicket = (evtId) => {
    try { localStorage.setItem(`ticket:${evtId}`, JSON.stringify({ via: 'login', ts: Date.now() })); } catch {}
  };
  const setCodeTicket = (evtId, c) => {
    try { localStorage.setItem(`ticket:${evtId}`, JSON.stringify({ code: String(c||''), ts: Date.now() })); } catch {}
  };

  // 참가자 자동 연결: uid/email/userId 기반(보수적)
  const syncMembershipAndLinkParticipant = async (firebaseUser, evtId) => {
    if (!firebaseUser || !evtId) return;
    const { uid, email: uEmail } = firebaseUser;

    // memberships 생성/갱신
    const memRef = doc(db, 'events', evtId, 'memberships', uid);
    await setDoc(memRef, { uid, email: uEmail || null, joinedAt: new Date().toISOString() }, { merge: true });

    // participants 배열 매핑
    const evRef = doc(db, 'events', evtId);
    const snap = await getDoc(evRef);
    const data = snap.data() || {};
    const arr = Array.isArray(data.participants) ? [...data.participants] : [];

    const emailNorm = normalize(uEmail);
    let idx = -1;
    if (arr.length) {
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
    }
  };

  // ── handlers ─────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email.trim()) { alert('이메일을 입력해 주세요.'); return; }
    if (!pw.trim())    { alert('비밀번호를 입력해 주세요.'); return; }
    setBusy(true);
    try {
      await signInEmail(email.trim(), pw);
      try {
        if (eventId && user) {
          await syncMembershipAndLinkParticipant(user, eventId);
          setLoginTicket(eventId);
        }
      } catch (e) { console.warn('post-login sync failed:', e); }
      goNext();
    } catch (err) {
      alert(`로그인 실패: ${err?.message || err}`);
    } finally { setBusy(false); }
  };

  const handleSignUp = async () => {
    if (!email.trim()) { alert('이메일을 입력해 주세요.'); return; }
    if (!pw.trim())    { alert('비밀번호를 입력해 주세요.'); return; }
    setBusy(true);
    try {
      await signUpEmail(email.trim(), pw);
      try {
        if (eventId && user) {
          await syncMembershipAndLinkParticipant(user, eventId);
          setLoginTicket(eventId);
        }
      } catch (e) { console.warn('post-signup sync failed:', e); }
      goNext();
    } catch (err) {
      alert(`회원가입 실패: ${err?.message || err}`);
    } finally { setBusy(false); }
  };

  const handleReset = async () => {
    if (!email.trim()) { alert('비번 재설정을 위해 이메일을 먼저 입력해 주세요.'); return; }
    setBusy(true);
    try {
      await resetPassword(email.trim());
      alert('입력한 이메일로 비밀번호 재설정 메일을 보냈습니다(계정이 존재하는 경우).');
    } catch (err) {
      alert(`재설정 메일 전송 실패: ${err?.message || err}`);
    } finally { setBusy(false); }
  };

  // participants 배열 → 없으면 서브컬렉션 /participants 로 fallback
  const verifyCode = async (evtId, inputCode) => {
    const codeStr = String(inputCode || '').trim();
    if (!evtId || !codeStr) return false;

    // 1) 이벤트 문서의 participants 배열
    try {
      const evSnap = await getDoc(doc(db, 'events', evtId));
      const data = evSnap.data() || {};
      if (Array.isArray(data.participants) && data.participants.length) {
        const okArr = data.participants.some(p =>
          String(p?.authCode || p?.code || '').trim() === codeStr
        );
        if (okArr) return true;
      }
    } catch (e) { console.warn('verifyCode(arr) error:', e); }

    // 2) 서브컬렉션 /events/{evtId}/participants
    try {
      const col = collection(db, 'events', evtId, 'participants');
      const qs = await getDocs(col);
      let ok = false;
      qs.forEach(d => {
        const v = d.data() || {};
        if (String(v?.authCode || v?.code || '').trim() === codeStr) ok = true;
      });
      return ok;
    } catch (e) {
      console.warn('verifyCode(subcollection) error:', e);
    }

    return false;
  };

  const handleCode = async () => {
    if (!code.trim()) { alert('인증코드를 입력해 주세요.'); return; }
    setBusy(true);
    try {
      await ensureAnonymous();
      if (!eventId) { alert('이벤트가 선택되지 않았습니다.'); return; }

      const ok = await verifyCode(eventId, code);
      if (!ok) { alert('인증코드가 올바르지 않습니다.'); return; }

      setCodeTicket(eventId, code);
      goNext();
    } catch (err) {
      alert(`코드 확인 중 오류: ${err?.message || err}`);
    } finally { setBusy(false); }
  };

  const membersOnly = !!eventData?.membersOnly;

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h2 className={styles.title}>로그인</h2>

        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab==='login' ? styles.active : ''}`}
            onClick={() => setTab('login')}
          >
            참가자
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab==='code' ? styles.active : ''}`}
            onClick={() => setTab('code')}
            disabled={membersOnly}
            title={membersOnly ? '회원 전용 이벤트에서는 인증코드 입장이 제한됩니다.' : undefined}
          >
            인증코드
          </button>
        </div>

        {tab === 'login' ? (
          <div className={styles.form}>
            <input
              className={styles.input}
              placeholder="이메일"
              value={email}
              onChange={e=>setEmail(e.target.value)}
            />
            <input
              className={styles.input}
              placeholder="비밀번호"
              type="password"
              value={pw}
              onChange={e=>setPw(e.target.value)}
            />
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={handleLogin} disabled={busy}>로그인</button>
              <button type="button" className={styles.ghost}   onClick={handleSignUp} disabled={busy}>회원가입</button>
              <button type="button" className={styles.ghost}   onClick={handleReset} disabled={busy}>비번 재설정</button>
            </div>
          </div>
        ) : (
          <div className={styles.form}>
            <input
              className={styles.input}
              placeholder="인증코드 6자리"
              value={code}
              onChange={e=>setCode(e.target.value)}
              disabled={membersOnly}
              title={membersOnly ? '회원 전용 이벤트에서는 인증코드 입장이 제한됩니다.' : undefined}
            />
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={handleCode}
                disabled={busy || membersOnly}
                title={membersOnly ? '회원 전용 이벤트에서는 인증코드 입장이 제한됩니다.' : undefined}
              >
                코드로 입장
              </button>
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
