// /src/player/screens/LoginOrCode.jsx
//
// 보완사항:
// - onEnter prop이 없을 때도 자체적으로 /player/home/:eventId/1 로 이동하도록 처리(버튼 무반응 이슈 해결)
// - 버튼에 type="button" 지정
// - 레이아웃은 CSS 모듈에서 중앙정렬/넘침 해결
// - "비번 재설정" 버튼을 ghost 스타일로 변경(회원가입과 동일한 톤)
// - 기본 버튼 텍스트 사이즈 약간 확대
//
import React, { useState, useContext } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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

  if (!ready) return null;

  // ── helpers ──────────────────────────────────────────────────
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

  // ── handlers ─────────────────────────────────────────────────
  const handleLogin = async () => {
    await signInEmail(email, pw);
    try {
      if (eventId && user) {
        await syncMembershipAndLinkParticipant(user, eventId);
        setLoginTicket(eventId);
      }
    } catch (e) { console.warn('post-login sync failed:', e); }
    goNext();
  };

  const handleSignUp = async () => {
    await signUpEmail(email, pw);
    try {
      if (eventId && user) {
        await syncMembershipAndLinkParticipant(user, eventId);
        setLoginTicket(eventId);
      }
    } catch (e) { console.warn('post-signup sync failed:', e); }
    goNext();
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
    goNext();
  };

  // membersOnly면 인증코드 탭 비활성(표시는 하되 안내)
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
              <button type="button" className={styles.primary} onClick={handleLogin}>로그인</button>
              <button type="button" className={styles.ghost} onClick={handleSignUp}>회원가입</button>
              <button type="button" className={styles.ghost} onClick={handleReset}>비번 재설정</button>
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
                disabled={membersOnly}
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
