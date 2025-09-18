// /src/player/screens/LoginOrCode.jsx

import React, { useState, useContext } from 'react';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { EventContext } from '../../contexts/EventContext';
import PlayerAuthProvider, { usePlayerAuth } from '../../contexts/PlayerAuthContext';
import styles from './LoginOrCode.module.css';

// 🆕 모달
import SignupModal from '../components/SignupModal';
import ResetPasswordModal from '../components/ResetPasswordModal';

function InnerLoginOrCode({ onEnter }) {
  const navigate = useNavigate();
  const { eventId, eventData } = useContext(EventContext) || {};
  const { user, ready, ensureAnonymous, signUpEmail, signInEmail, resetPassword } = usePlayerAuth();

  const [tab, setTab] = useState('login'); // 'login' | 'code'
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  // 🆕 팝업 상태
  const [showSignup, setShowSignup] = useState(false);
  const [showReset, setShowReset] = useState(false);

  if (!ready) return null;

  const normalize = (v) => String(v ?? '').trim().toLowerCase();
  const goNext = () => {
    if (typeof onEnter === 'function') onEnter();
    else if (eventId) navigate(`/player/home/${eventId}/1`, { replace: true });
  };
  const setLoginTicket = (evtId) => {
    try { localStorage.setItem(`ticket:${evtId}`, JSON.stringify({ via:'login', ts: Date.now() })); } catch {}
  };
  const setCodeTicket = (evtId, c) => {
    try { localStorage.setItem(`ticket:${evtId}`, JSON.stringify({ code:String(c||''), ts: Date.now() })); } catch {}
  };

  // 로그인 후 멤버십/참가자 매핑
  const syncMembershipAndLinkParticipant = async (firebaseUser, evtId) => {
    if (!firebaseUser || !evtId) return;
    const { uid, email: uEmail } = firebaseUser;
    await setDoc(doc(db, 'events', evtId, 'memberships', uid), {
      uid, email: uEmail || null, joinedAt: new Date().toISOString()
    }, { merge:true });

    const evRef = doc(db, 'events', evtId);
    const snap = await getDoc(evRef);
    const data = snap.data() || {};
    const arr = Array.isArray(data.participants) ? [...data.participants] : [];
    const emailNorm = normalize(uEmail);
    if (arr.length) {
      let idx = arr.findIndex(p => p && p.uid === uid);
      if (idx < 0 && emailNorm) idx = arr.findIndex(p => normalize(p?.email) === emailNorm);
      if (idx < 0 && emailNorm) idx = arr.findIndex(p => normalize(p?.userId) === emailNorm);
      if (idx >= 0) {
        const target = { ...arr[idx] };
        let changed = false;
        if (target.uid !== uid) { target.uid = uid; changed = true; }
        if (!target.email && uEmail) { target.email = uEmail; changed = true; }
        if (changed) {
          arr[idx] = target;
          await setDoc(evRef, { participants: arr }, { merge:true });
        }
      }
    }
  };

  // 인증코드 추출(다국어/여러 키 지원)
  const extractCode = (obj) => {
    if (!obj || typeof obj !== 'object') return '';
    const candidates = ['authCode','code','auth_code','authcode','AuthCode','인증코드','인증 코드'];
    for (const k of candidates) {
      const hit = Object.keys(obj).find(kk => kk.toLowerCase() === k.toLowerCase());
      if (hit && String(obj[hit]).trim() !== '') return String(obj[hit]).trim();
    }
    return '';
  };
  const verifyCode = async (evtId, inputCode) => {
    const inCode = String(inputCode || '').trim();
    if (!evtId || !inCode) return false;

    // 1) 이벤트 문서 배열
    try {
      const evSnap = await getDoc(doc(db, 'events', evtId));
      const data = evSnap.data() || {};
      if (Array.isArray(data.participants) && data.participants.length) {
        if (data.participants.some(p => extractCode(p) === inCode)) return true;
      }
    } catch(e){}
    // 2) 서브컬렉션
    try {
      const qs = await getDocs(collection(db, 'events', evtId, 'participants'));
      let ok = false;
      qs.forEach(d => { if (extractCode(d.data()||{}) === inCode) ok = true; });
      return ok;
    } catch(e){}
    return false;
  };

  // handlers
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
      } catch(e){}
      goNext();
    } catch (err) {
      alert(`로그인 실패: ${err?.message || err}`);
    } finally { setBusy(false); }
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
          <button type="button" className={`${styles.tab} ${tab==='login'?styles.active:''}`} onClick={()=>setTab('login')}>참가자</button>
          <button type="button" className={`${styles.tab} ${tab==='code'?styles.active:''}`} onClick={()=>setTab('code')}
                  disabled={membersOnly} title={membersOnly?'회원 전용 이벤트에서는 인증코드 입장이 제한됩니다.':undefined}>인증코드</button>
        </div>

        {tab === 'login' ? (
          <div className={styles.form}>
            <input className={styles.input} placeholder="이메일" value={email} onChange={e=>setEmail(e.target.value)} />
            <input className={styles.input} placeholder="비밀번호" type="password" value={pw} onChange={e=>setPw(e.target.value)} />
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={handleLogin} disabled={busy}>로그인</button>
              <button type="button" className={styles.ghost} onClick={()=>setShowSignup(true)} disabled={busy}>회원가입</button>
              <button type="button" className={styles.ghost} onClick={()=>setShowReset(true)} disabled={busy}>비번 재설정</button>
            </div>
          </div>
        ) : (
          <div className={styles.form}>
            <input className={styles.input} placeholder="인증코드 6자리" value={code} onChange={e=>setCode(e.target.value)}
                   disabled={membersOnly} title={membersOnly?'회원 전용 이벤트에서는 인증코드 입장이 제한됩니다.':undefined}/>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={handleCode}
                      disabled={busy||membersOnly} title={membersOnly?'회원 전용 이벤트에서는 인증코드 입장이 제한됩니다.':undefined}>코드로 입장</button>
            </div>
          </div>
        )}
      </div>

      {/* 🆕 팝업들 */}
      {showSignup && (
        <SignupModal
          defaultEmail={email}
          onClose={()=>setShowSignup(false)}
          onComplete={async ({email:em,password,name})=>{
            try{
              await signUpEmail(em, password);
              // users/{uid} 저장 (PlayerAuthContext에서 user 갱신 직후 접근)
              if (user) {
                await setDoc(doc(db,'users',user.uid), { email:user.email, name, createdAt:new Date().toISOString() }, { merge:true });
              }
              alert('회원가입이 완료되었습니다.');
            }catch(err){ alert(`회원가입 실패: ${err?.message||err}`); }
          }}
        />
      )}
      {showReset && (
        <ResetPasswordModal
          defaultEmail={email}
          onClose={()=>setShowReset(false)}
          onComplete={async ({email:em})=>{
            try{
              await resetPassword(em);
              alert('입력한 이메일로 비밀번호 재설정 메일을 보냈습니다.');
            }catch(err){ alert(`재설정 메일 전송 실패: ${err?.message||err}`); }
          }}
        />
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
