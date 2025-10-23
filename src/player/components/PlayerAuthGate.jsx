// /src/player/components/PlayerAuthGate.jsx

import React, { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, signInAnonymously } from 'firebase/auth';

export default function PlayerAuthGate({ children }) {
  const [ready, setReady] = useState(false);
  const [mode, setMode]   = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [pw, setPw]       = useState('');
  const [code, setCode]   = useState('');

  useEffect(() => {
    const auth = getAuth();
    const stop = onAuthStateChanged(auth, () => setReady(true));
    return () => stop();
  }, []);

  if (!ready) return null;

  const authed = !!getAuth().currentUser;
  const pendingCode = (() => {
    try { return sessionStorage.getItem('pending_code') || ''; } catch { return ''; }
  })();

  const doEmailLogin = async (e) => {
    e?.preventDefault?.();
    try {
      await signInWithEmailAndPassword(getAuth(), email.trim(), pw);
      try { sessionStorage.removeItem('pending_code'); } catch {}
      alert('로그인 되었습니다. 대회를 선택하세요.');
    } catch (err) {
      alert('이메일/비밀번호 로그인 실패: ' + (err?.message || ''));
    }
  };

  const doCodeOnly = async (e) => {
    e?.preventDefault?.();
    try {
      sessionStorage.setItem('pending_code', code.trim());
      const auth = getAuth();
      if (!auth.currentUser) await signInAnonymously(auth).catch(() => {});
      alert('인증코드가 저장되었습니다. 대회를 선택하세요.');
    } catch {}
  };

  const doLogout = async () => {
    try { await signOut(getAuth()); } catch {}
    try { sessionStorage.removeItem('pending_code'); } catch {}
  };

  // 이미 로그인 or 미리 입력된 코드가 있으면 바로 children
  if (authed || pendingCode) return children;

  return (
    <div style={{ maxWidth: 420, margin: '32px auto', padding: 16, border: '1px solid #eee', borderRadius: 12 }}>
      <h2 style={{ marginBottom: 12 }}>참가자 로그인</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setMode('email')} style={{ padding: '6px 10px', borderRadius: 8, border: mode==='email' ? '2px solid #111' : '1px solid #ccc' }}>
          아이디/비밀번호
        </button>
        <button onClick={() => setMode('code')} style={{ padding: '6px 10px', borderRadius: 8, border: mode==='code' ? '2px solid #111' : '1px solid #ccc' }}>
          인증코드
        </button>
      </div>

      {mode === 'email' ? (
        <form onSubmit={doEmailLogin} style={{ display: 'grid', gap: 8 }}>
          <input placeholder="이메일" value={email} onChange={e => setEmail(e.target.value)} />
          <input placeholder="비밀번호" type="password" value={pw} onChange={e => setPw(e.target.value)} />
          <button type="submit">로그인</button>
        </form>
      ) : (
        <form onSubmit={doCodeOnly} style={{ display: 'grid', gap: 8 }}>
          <input placeholder="인증코드" value={code} onChange={e => setCode(e.target.value)} />
          <button type="submit">코드 저장 후 이벤트 선택</button>
        </form>
      )}

      {(authed || pendingCode) && (
        <button onClick={doLogout} style={{ marginTop: 12, color: '#b91c1c' }}>로그아웃</button>
      )}
    </div>
  );
}
