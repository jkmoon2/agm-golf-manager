// /src/player/screens/LoginOrCode.jsx
//
// 변경 요약
// - (삭제) 진입 시 auth_* 존재하면 바로 홈으로 가던 자동 이동 로직
// - (변경) 코드 입력 시 언제나 pending_code 저장 → /player/events 로 이동(즉시 검증/입장 X)
// - (보완) 이메일 회원가입/로그인 안정화 + 이메일 저장 체크박스

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
import { writePlayerTicket } from '../utils/playerState';

function InnerLoginOrCode({ onEnter }) {
  const navigate = useNavigate();
  const { eventId, eventData } = useContext(EventContext) || {};
  const { user, ready, signUpEmail, signInEmail, resetPassword } = usePlayerAuth();
  const { setEventId, setAuthCode, setParticipant } = useContext(PlayerContext) || {};

  const SAVED_EMAIL_KEY = 'agm.player.savedEmail';
  const AUTO_LOGIN_KEY = 'agm.player.autoLogin';
  const AUTO_PW_MASK = '********';
  const [tab, setTab]   = useState('login');
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem(SAVED_EMAIL_KEY) || ''; } catch { return ''; }
  });
  const [rememberEmail, setRememberEmail] = useState(() => {
    try { return !!localStorage.getItem(SAVED_EMAIL_KEY); } catch { return false; }
  });
  const [autoLogin, setAutoLogin] = useState(() => {
    try { return localStorage.getItem(AUTO_LOGIN_KEY) === '1'; } catch { return false; }
  });
  const [pw, setPw]       = useState('');
  const [code, setCode]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [showReset,  setShowReset]  = useState(false);
  const [autoSessionReady, setAutoSessionReady] = useState(false);

  const membersOnly = !!eventData?.membersOnly;


  // 자동 로그인은 비밀번호를 저장하지 않고 Firebase Auth의 로그인 유지 세션을 사용합니다.
  // 기존처럼 비밀번호 칸에 별표를 억지로 채우는 방식 대신,
  // 세션 확인 여부를 별도 안내문으로 명확하게 보여줍니다.
  useEffect(() => {
    if (!ready) return;
    const hasEmailSession = !!(autoLogin && user && !user.isAnonymous && user.email);
    setAutoSessionReady(hasEmailSession);
    if (hasEmailSession) {
      if (user?.email) setEmail(user.email);
      setPw('');
    } else if (pw === AUTO_PW_MASK) {
      setPw('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, autoLogin, user]);

  // ❌ (삭제) auth_* 존재 시 자동 이동 → 리스트 먼저 보여야 하므로 제거
  // useEffect(() => { ... }, []);

  const ensureUserDoc = async (u, extra = {}) => {
    try {
      if (!u?.uid) return;
      const ref = doc(db, 'users', u.uid);
      const snap = await getDoc(ref);
      const old = snap.exists() ? (snap.data() || {}) : {};
      const nextName = extra.name ?? old.name ?? u.displayName ?? '';
      const nextEmail = u.email || extra.email || old.email || null;
      await setDoc(ref, {
        uid: u.uid,
        email: nextEmail,
        name: nextName,
        role: old.role || 'player',
        createdAt: old.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      await ensurePasswordResetIndex(u, { email: nextEmail, name: nextName, createdAt: old.createdAt });
    } catch {}
  };

  const rememberCurrentEmail = (em) => {
    try {
      if (rememberEmail || autoLogin) localStorage.setItem(SAVED_EMAIL_KEY, em || '');
      else localStorage.removeItem(SAVED_EMAIL_KEY);
      if (autoLogin) localStorage.setItem(AUTO_LOGIN_KEY, '1');
      else localStorage.removeItem(AUTO_LOGIN_KEY);
    } catch {}
  };

  const normalizeText = (v) => String(v || '').trim().replace(/\s+/g, ' ');
  const normalizeEmail = (v) => String(v || '').trim().toLowerCase();

  const emailIndexKey = (em) => normalizeEmail(em);

  const ensurePasswordResetIndex = async (u, extra = {}) => {
    try {
      const em = normalizeEmail(extra.email || u?.email || '');
      if (!u?.uid || !em) return;
      const name = normalizeText(extra.name ?? u?.displayName ?? '');
      await setDoc(doc(db, 'passwordResetIndex', emailIndexKey(em)), {
        uid: u.uid,
        email: em,
        name,
        updatedAt: new Date().toISOString(),
        createdAt: extra.createdAt || new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      console.warn('[LoginOrCode] passwordResetIndex ensure failed:', e);
    }
  };

  const findResetIndexByEmail = async (em) => {
    const target = normalizeEmail(em);
    if (!target) return null;
    const snap = await getDoc(doc(db, 'passwordResetIndex', emailIndexKey(target)));
    return snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null;
  };

  const extractCode = (obj) => {
    if (!obj || typeof obj !== 'object') return '';
    const cands = ['authCode', 'code', 'auth_code', 'authcode', 'AuthCode', '인증코드', '인증 코드'];
    for (const k of cands) {
      const hit = Object.keys(obj).find(kk => kk.toLowerCase() === k.toLowerCase());
      if (hit && String(obj[hit]).trim() !== '') return String(obj[hit]).trim();
    }
    return '';
  };
  const verifyCode = async (evtId, input) => {
    const inCode = String(input || '').trim();
    if (!evtId || !inCode) return false;
    try {
      const ev = await getDoc(doc(db, 'events', evtId));
      const data = ev.data() || {};
      if (Array.isArray(data.participants) && data.participants.some(p => extractCode(p) === inCode)) return true;
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
      const ev = await getDoc(doc(db, 'events', evtId));
      const data = ev.data() || {};
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

  const handleLogin = async () => {
    const em = email.trim();
    if (!em) { alert('이메일을 입력해 주세요.'); return; }
    if (autoSessionReady && pw === AUTO_PW_MASK && user && !user.isAnonymous) {
      rememberCurrentEmail(em);
      try { sessionStorage.setItem('agm.authRole', 'player'); } catch {}
      try { writePlayerTicket('global', { via:'email-auto-session', email: user.email || em, ts:Date.now() }); } catch {}
      navigate('/player/events', { replace: true });
      return;
    }
    if (!pw.trim())    { alert('비밀번호를 입력해 주세요.'); return; }
    if (pw === AUTO_PW_MASK && !autoSessionReady) { alert('자동 로그인 세션이 만료되었습니다. 비밀번호를 다시 입력해 주세요.'); setPw(''); return; }
    setBusy(true);
    try {
      const cred = await signInEmail(em, pw);
      await ensureUserDoc(cred?.user, { email: em });
      rememberCurrentEmail(em);
      try { sessionStorage.setItem('agm.authRole', 'player'); } catch {}
      try { writePlayerTicket('global', { via:'email-login', email: em, ts:Date.now() }); } catch {}
      // 이메일 로그인은 특정 대회/참가자 확정 전 단계이므로 항상 대회 목록으로 이동
      navigate('/player/events', { replace: true });
    } catch (err) {
      alert(`로그인 실패: ${err?.message || err}`);
    } finally { setBusy(false); }
  };

  // ✅ 변경: 코드 입력 → 항상 pending_code 저장 → /player/events 로 이동(즉시 검증/입장 X)
  const handleCode = async () => {
    const raw = code.trim();
    if (!raw) { alert('인증코드를 입력해 주세요.'); return; }
    try { sessionStorage.setItem('pending_code', raw); } catch {}
    navigate('/player/events', { replace: true }); // ✅ 변경
  };

  return (
    <div className={styles.wrap}>
      {!ready ? (
        <div className={styles.card}><h2 className={styles.title}>로그인</h2></div>
      ) : (
        <>
          <div className={styles.card}>
            <h2 className={styles.title}>로그인</h2>
            <div className={styles.tabs}>
              <button type="button" className={`${styles.tab} ${tab==='login' ? styles.active : ''} selectable`} onClick={()=>setTab('login')}>이메일 로그인</button>
              <button type="button" className={`${styles.tab} ${tab==='code'  ? styles.active : ''} selectable`} onClick={()=>setTab('code')}>인증코드 입장</button>
            </div>

            {tab === 'login' ? (
              <div className={styles.form}>
                <input className={`${styles.input} selectable`} placeholder="이메일" value={email} onChange={(e)=>setEmail(e.target.value)} />
                <input
                  className={`${styles.input} selectable ${autoSessionReady ? styles.autoPwInput : ''}`}
                  placeholder={autoSessionReady ? '자동 로그인 세션 확인됨' : '비밀번호'}
                  type="password"
                  value={pw}
                  readOnly={autoSessionReady}
                  disabled={autoSessionReady}
                  onChange={(e)=>setPw(e.target.value)}
                />
                <div className={styles.rememberOptions}>
                  <label className={styles.rememberRow}>
                    <input
                      type="checkbox"
                      checked={rememberEmail}
                      onChange={(e)=>{
                        const checked = e.target.checked;
                        setRememberEmail(checked);
                        try {
                          if (checked) localStorage.setItem(SAVED_EMAIL_KEY, email.trim());
                          else if (!autoLogin) localStorage.removeItem(SAVED_EMAIL_KEY);
                        } catch {}
                      }}
                    />
                    <span>이메일 저장</span>
                  </label>
                  <label className={styles.rememberRow}>
                    <input
                      type="checkbox"
                      checked={autoLogin}
                      onChange={(e)=>{
                        const checked = e.target.checked;
                        setAutoLogin(checked);
                        try {
                          if (checked) {
                            localStorage.setItem(AUTO_LOGIN_KEY, '1');
                            localStorage.setItem(SAVED_EMAIL_KEY, email.trim());
                            setRememberEmail(true);
                          } else {
                            localStorage.removeItem(AUTO_LOGIN_KEY);
                          }
                        } catch {}
                      }}
                    />
                    <span>자동 로그인</span>
                  </label>
                </div>
                {autoLogin && (
                  <div className={`${styles.autoLoginStatus} ${autoSessionReady ? styles.autoLoginReady : styles.autoLoginExpired}`}>
                    {autoSessionReady
                      ? '자동 로그인 세션이 확인되었습니다. 로그인 버튼만 누르면 입장합니다.'
                      : '자동 로그인 체크는 유지되어 있지만 세션이 확인되지 않았습니다. 비밀번호를 다시 입력해 주세요.'}
                  </div>
                )}
                <div className={styles.actions}>
                  <button type="button" className={`${styles.primary} selectable`} onClick={handleLogin} disabled={busy}>{autoSessionReady ? '자동 로그인' : '로그인'}</button>
                  <button type="button" className={`${styles.ghost} selectable`}   onClick={()=>setShowSignup(true)} disabled={busy}>회원가입</button>
                  <button type="button" className={`${styles.ghost} selectable`}   onClick={()=>setShowReset(true)}  disabled={busy}>비번 재설정</button>
                </div>
              </div>
            ) : (
              <div className={styles.form}>
                <input className={`${styles.input} selectable`} placeholder="인증코드" value={code} onChange={(e)=>setCode(e.target.value)} />
                <div className={styles.actions}>
                  <button type="button" className={`${styles.primary} selectable`} onClick={handleCode} disabled={busy}>코드로 입장</button>
                </div>
                <div className={styles.helper}>코드 입력 후 <b>대회 목록</b>에서 대회를 선택하세요.</div>
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
                  const u = cred?.user || cred;
                  if (!u?.uid) throw new Error('회원가입 계정 정보를 확인할 수 없습니다.');
                  await setDoc(doc(db, 'users', u.uid), {
                    uid: u.uid,
                    email: u.email || em,
                    name,
                    role: 'player',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  }, { merge: true });
                  await ensurePasswordResetIndex(u, { email: u.email || em, name });
                  setEmail(em);
                  try { sessionStorage.setItem('agm.authRole', 'player'); } catch {}
                  try {
                    if (rememberEmail) localStorage.setItem(SAVED_EMAIL_KEY, em);
                  } catch {}
                  alert('회원가입이 완료되었습니다. 대회 목록에서 참가할 대회를 선택해 주세요.');
                  navigate('/player/events', { replace: true });
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
              onComplete={async ({ email: em, name })=>{
                const resetEmail = normalizeEmail(em);
                const resetName = normalizeText(name);
                if (!resetEmail) { alert('이메일을 입력해 주세요.'); return false; }
                if (!resetName) { alert('회원가입 시 입력한 이름을 입력해 주세요.'); return false; }
                try {
                  const registered = await findResetIndexByEmail(resetEmail);
                  if (!registered) {
                    alert('등록된 회원 이메일을 찾지 못했습니다. 운영자 설정 > 회원 목록에서 새로고침을 한 번 실행해 주세요.');
                    return false;
                  }
                  if (normalizeText(registered.name) !== resetName) {
                    alert('회원가입 시 입력한 이름과 일치하지 않습니다.');
                    return false;
                  }
                  await resetPassword(resetEmail);
                  alert('입력한 이메일로 비밀번호 재설정 메일을 보냈습니다.');
                  return true;
                } catch (err) {
                  alert(`재설정 메일 전송 실패: ${err?.message || err}`);
                  return false;
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
