// /src/player/screens/LoginOrCode.jsx
//
// 변경 요약
// - eventId 없으면 '인증코드 입장' 비활성(핵심)
// - 코드/로그인 성공 후 이동 경로 goNext로 통일
// - 세션에 저장된 참가자/코드 복원, 기 인증 시 바로 진입

import React, { useState, useContext, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { EventContext } from '../../contexts/EventContext';
import { PlayerContext } from '../../contexts/PlayerContext';
import PlayerAuthProvider, { usePlayerAuth } from '../../contexts/PlayerAuthContext';
import styles from './LoginOrCode.module.css';

import SignupModal from '../components/SignupModal';
import ResetPasswordModal from '../components/ResetPasswordModal';
import { getAuth } from 'firebase/auth';

function InnerLoginOrCode({ onEnter }) {
  const navigate = useNavigate();
  const { eventId, eventData } = useContext(EventContext) || {};
  const { user, ready, ensureAnonymous, signUpEmail, signInEmail, resetPassword } = usePlayerAuth();

  const { setEventId, setAuthCode, setParticipant } = useContext(PlayerContext) || {};

  const [tab, setTab]   = useState('login');
  const [email, setEmail] = useState('');
  const [pw, setPw]       = useState('');
  const [code, setCode]   = useState('');
  const [busy, setBusy]   = useState(false);

  const [showSignup, setShowSignup] = useState(false);
  const [showReset,  setShowReset]  = useState(false);

  const normalize = (v) => String(v ?? '').trim().toLowerCase();

  const goNext = () => {
    if (typeof onEnter === 'function') onEnter();
    else if (eventId) navigate(`/player/home/${eventId}/1`, { replace: true });
    else navigate('/player', { replace: true });
  };

  const setLoginTicket = (evtId) => {
    try { localStorage.setItem(`ticket:${evtId || 'global'}`, JSON.stringify({ via: 'login', ts: Date.now() })); } catch {}
  };
  const setCodeTicket = (evtId, c) => {
    try { localStorage.setItem(`ticket:${evtId}`, JSON.stringify({ code: String(c || ''), ts: Date.now() })); } catch {}
  };

  useEffect(() => {
    if (!eventId) return;
    try {
      const ok = sessionStorage.getItem(`auth_${eventId}`) === 'true';
      if (!ok) return;
      const savedCode = sessionStorage.getItem(`authcode_${eventId}`) || '';
      const savedPart = sessionStorage.getItem(`participant_${eventId}`);
      setEventId?.(eventId);
      if (savedCode) setAuthCode?.(savedCode);
      if (savedPart) setParticipant?.(JSON.parse(savedPart));
      setCodeTicket(eventId, savedCode);
      goNext();
    } catch {}
  }, [eventId]);

  const syncMembershipAndLinkParticipant = async (firebaseUser, evtId) => {
    if (!firebaseUser || !evtId) return;
    const { uid, email: uEmail } = firebaseUser;
    await setDoc(doc(db, 'events', evtId, 'memberships', uid), {
      uid,
      email: uEmail || null,
      joinedAt: new Date().toISOString(),
    }, { merge: true });

    const evRef = doc(db, 'events', evtId);
    const snap  = await getDoc(evRef);
    const data  = snap.data() || {};
    const arr   = Array.isArray(data.participants) ? [...data.participants] : [];
    const emailNorm = normalize(uEmail);
    if (arr.length) {
      let idx = arr.findIndex(p => p && p.uid === uid);
      if (idx < 0 && emailNorm) idx = arr.findIndex(p => normalize(p?.email) === emailNorm);
      if (idx < 0 && emailNorm) idx = arr.findIndex(p => normalize(p?.userId) === emailNorm);
      if (idx >= 0) {
        const target = { ...arr[idx] };
        let changed = false;
        if (!target.uid && uid)       { target.uid = uid; changed = true; }
        if (!target.email && uEmail)  { target.email = uEmail; changed = true; }
        if (changed) {
          arr[idx] = target;
          await setDoc(evRef, { participants: arr }, { merge: true });
        }
      }
    }
  };

  const extractCode = (obj) => {
    if (!obj || typeof obj !== 'object') return '';
    const candidates = ['authCode', 'code', 'auth_code', 'authcode', 'AuthCode', '인증코드', '인증 코드'];
    for (const k of candidates) {
      const hit = Object.keys(obj).find(kk => kk.toLowerCase() === k.toLowerCase());
      if (hit && String(obj[hit]).trim() !== '') return String(obj[hit]).trim();
    }
    return '';
  };

  const verifyCode = async (evtId, input) => {
    const inCode = String(input || '').trim();
    if (!evtId || !inCode) return false;

    try {
      const evSnap = await getDoc(doc(db, 'events', evtId));
      const data = evSnap.data() || {};
      if (Array.isArray(data.participants) && data.participants.length) {
        if (data.participants.some(p => extractCode(p) === inCode)) return true;
      }
    } catch {}
    try {
      const qs = await getDocs(collection(db, 'events', evtId, 'participants'));
      let ok = false;
      qs.forEach(d => { if (extractCode(d.data() || {}) === inCode) ok = true; });
      return ok;
    } catch {}
    return false;
  };

  const findParticipantByCode = async (evtId, input) => {
    const inCode = String(input || '').trim();
    if (!evtId || !inCode) return null;
    try {
      const evSnap = await getDoc(doc(db, 'events', evtId));
      const data = evSnap.data() || {};
      if (Array.isArray(data.participants)) {
        const p = data.participants.find(p => extractCode(p) === inCode);
        if (p) return p;
      }
    } catch {}
    try {
      const qs = await getDocs(collection(db, 'events', evtId, 'participants'));
      let ret = null;
      qs.forEach(d => { if (!ret && extractCode(d.data() || {}) === inCode) ret = { id: d.id, ...(d.data() || {}) }; });
      return ret;
    } catch {}
    return null;
  };

  const ensureUserDoc = async (u) => {
    try {
      if (!u?.uid) return;
      const ref = doc(db, 'users', u.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          uid: u.uid,
          email: u.email || null,
          name: u.displayName || '',
          createdAt: new Date().toISOString(),
        }, { merge: true });
      }
    } catch (e) { console.warn('[ensureUserDoc] failed:', e); }
  };

  const handleLogin = async () => {
    if (!email.trim()) { alert('이메일을 입력해 주세요.'); return; }
    if (!pw.trim())    { alert('비밀번호를 입력해 주세요.'); return; }
    setBusy(true);
    try {
      await signInEmail(email.trim(), pw);

      const cu = getAuth().currentUser;
      if (cu) await ensureUserDoc(cu);

      try {
        if (eventId && cu) {
          await syncMembershipAndLinkParticipant(cu, eventId);
          setLoginTicket(eventId);
        } else {
          setLoginTicket('global');
        }
      } catch {}
      goNext();
    } catch (err) {
      alert(`로그인 실패: ${err?.message || err}`);
    } finally { setBusy(false); }
  };

  const handleCode = async () => {
    if (!eventId) { alert('대회를 먼저 선택해 주세요. (리스트에서 대회 선택 후 입장)'); return; }
    if (!code.trim()) { alert('인증코드를 입력해 주세요.'); return; }
    setBusy(true);
    try {
      await ensureAnonymous();
      const ok = await verifyCode(eventId, code);
      if (!ok) { alert('인증코드가 올바르지 않습니다.'); return; }

      const part = await findParticipantByCode(eventId, code);
      try {
        sessionStorage.setItem(`auth_${eventId}`, 'true');
        sessionStorage.setItem(`authcode_${eventId}`, String(code));
        if (part) sessionStorage.setItem(`participant_${eventId}`, JSON.stringify(part));
      } catch {}
      setEventId?.(eventId);
      setAuthCode?.(String(code));
      if (part) setParticipant?.(part);

      setCodeTicket(eventId, code);
      goNext();
    } catch (err) {
      alert(`코드 확인 중 오류: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  const membersOnly = !!eventData?.membersOnly;

  return (
    <div className={styles.wrap}>
      {!ready ? (
        <div className={styles.card}>
          <h2 className={styles.title}>로그인</h2>
        </div>
      ) : (
        <>
          <div className={styles.card}>
            <h2 className={styles.title}>로그인</h2>

            <div className={styles.tabs}>
              <button
                type="button"
                className={`${styles.tab} ${tab==='login' ? styles.active : ''} selectable`}
                onClick={()=>setTab('login')}
              >
                이메일 로그인
              </button>
              <button
                type="button"
                className={`${styles.tab} ${tab==='code' ? styles.active : ''} selectable`}
                onClick={()=>setTab('code')}
                disabled={!eventId || membersOnly}
                title={!eventId ? '대회를 먼저 선택해야 인증코드 입장이 가능합니다.'
                      : (membersOnly ? '회원 전용 이벤트에서는 인증코드 입장이 제한됩니다.' : undefined)}
              >
                인증코드 입장
              </button>
            </div>

            {tab === 'login' ? (
              <div className={styles.form}>
                <input
                  className={`${styles.input} selectable`}
                  placeholder="이메일"
                  value={email}
                  onChange={(e)=>setEmail(e.target.value)}
                />
                <input
                  className={`${styles.input} selectable`}
                  placeholder="비밀번호"
                  type="password"
                  value={pw}
                  onChange={(e)=>setPw(e.target.value)}
                />
                <div className={styles.actions}>
                  <button type="button" className={`${styles.primary} selectable`} onClick={handleLogin} disabled={busy}>로그인</button>
                  <button type="button" className={`${styles.ghost} selectable`}   onClick={()=>setShowSignup(true)} disabled={busy}>회원가입</button>
                  <button type="button" className={`${styles.ghost} selectable`}   onClick={()=>setShowReset(true)}  disabled={busy}>비번 재설정</button>
                </div>
              </div>
            ) : (
              <div className={styles.form}>
                <input
                  className={`${styles.input} selectable`}
                  placeholder="인증코드 6자리"
                  value={code}
                  onChange={(e)=>setCode(e.target.value)}
                  disabled={!eventId || membersOnly}
                />
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={`${styles.primary} selectable`}
                    onClick={handleCode}
                    disabled={busy || !eventId || membersOnly}
                  >
                    코드로 입장
                  </button>
                </div>
              </div>
            )}
          </div>

          {showSignup && (
            <SignupModal
              defaultEmail={email}
              onClose={()=>setShowSignup(false)}
              onComplete={async ({ email: em, password, name })=>{
                try {
                  const cred = await signUpEmail(em, password);
                  const uid  = cred?.user?.uid;
                  await setDoc(doc(db, 'users', uid), {
                    uid,
                    email: cred?.user?.email || em,
                    name,
                    createdAt: new Date().toISOString(),
                  }, { merge: true });
                  alert('회원가입이 완료되었습니다.');
                } catch (err) {
                  alert(`회원가입 실패: ${err?.message || err}`);
                }
              }}
            />
          )}
          {showReset && (
            <ResetPasswordModal
              defaultEmail={email}
              onClose={()=>setShowReset(false)}
              onComplete={async ({ email: em })=>{
                try {
                  await resetPassword(em);
                  alert('입력한 이메일로 비밀번호 재설정 메일을 보냈습니다.');
                } catch (err) {
                  alert(`재설정 메일 전송 실패: ${err?.message || err}`);
                }
              }}
            />
          )}
        </>
      )}
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
