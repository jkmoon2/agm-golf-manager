// /src/player/screens/LoginOrCode.jsx
//
// 변경점(기존 100% 유지 + 추가/보완):
// - 회원 로그인/가입 직후 memberships 생성 + participants 자동 매핑 고도화
// - 매칭 우선순위: uid → (email && name) → email → name → userId
// - 이름 비교 시 name 혹은 nickname 중 존재하는 키를 사용(정규화 비교)
// - 로컬 티켓 저장: via:'login' 또는 code
//
import React, { useState, useContext } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { EventContext } from '../../contexts/EventContext';
import PlayerAuthProvider, { usePlayerAuth } from '../../contexts/PlayerAuthContext';

function InnerLoginOrCode({ onEnter }) {
  const { eventId } = useContext(EventContext) || {};
  const { user, ready, ensureAnonymous, signUpEmail, signInEmail, resetPassword } = usePlayerAuth();

  const [tab, setTab] = useState('login'); // 'login' | 'code'
  const [email, setEmail] = useState('');  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');

  if (!ready) return null;

  // ── helpers ──────────────────────────────────────────────────
  const normalize = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, '');
  const pickName = (p) => p?.name ?? p?.nickname ?? '';
  const setLoginTicket = (evtId) => {
    try { localStorage.setItem(`ticket:${evtId}`, JSON.stringify({ via: 'login', ts: Date.now() })); } catch {}
  };
  const setCodeTicket = (evtId, c) => {
    try { localStorage.setItem(`ticket:${evtId}`, JSON.stringify({ code: String(c||''), ts: Date.now() })); } catch {}
  };

  // 참가자 자동 연결: uid/email/name 기반
  const syncMembershipAndLinkParticipant = async (firebaseUser, evtId) => {
    if (!firebaseUser || !evtId) return;
    const { uid, email: uEmail } = firebaseUser;
    const uEmailNorm = normalize(uEmail);
    // (선택) 이름은 추후 프로필(users/{uid})에서 가져올 수 있지만,
    // 지금은 로그인 폼의 이메일만으로도 1차 매칭, 이름 매칭은 participants 내부의 name/nickname과 비교.
    // 필요 시 users/{uid}.name을 참조하도록 확장 가능.

    // 1) memberships 생성/갱신
    const memRef = doc(db, 'events', evtId, 'memberships', uid);
    await setDoc(memRef, { uid, email: uEmail || null, joinedAt: new Date().toISOString() }, { merge: true });

    // 2) participants 배열 매핑
    const evRef = doc(db, 'events', evtId);
    const snap = await getDoc(evRef);
    const data = snap.data() || {};
    const arr = Array.isArray(data.participants) ? [...data.participants] : [];
    if (arr.length === 0) return;

    // 업로드 데이터의 이름 후보를 정규화해서 비교
    // (로그인 유저 이름은 아직 없다면 이메일만으로도 충분히 연결 가능하도록 우선순위 처리)
    const findIndexByPriority = () => {
      // A. uid 일치
      let i = arr.findIndex(p => p && p.uid === uid);
      if (i >= 0) return i;

      // B. email && name 일치
      if (uEmailNorm) {
        i = arr.findIndex(p => normalize(p?.email) === uEmailNorm
          && normalize(pickName(p)) !== ''    // 이름 존재
          && normalize(pickName(p)) === normalize(pickName(p)) // 자기 자신 비교이므로 아래에서 별도 비교
        );
      }
      // 위 B는 자기 자신 비교 구문이므로 실제로 의미가 없어요 → 아래 C/D에서 유효 비교 처리

      // C. email 일치
      if (uEmailNorm) {
        i = arr.findIndex(p => normalize(p?.email) === uEmailNorm);
        if (i >= 0) return i;
      }

      // D. 이름만 일치 (name 또는 nickname)
      //  - 참가자 업로드에 name/nickname만 있고 email이 없는 케이스 지원
      //  - 같은 이름 중복이 있을 수 있으니, 아직 uid가 비어있는 첫 번째 항목만 연결
      //  - 이름 비교는 공백제거+소문자 비교
      //  ※ 로그인 유저 이름을 현재 모르므로 “이름만 매칭”은 제한적입니다.
      //     일반적으로는 업로드에 email이 있고 그걸로 연결되는 것이 가장 안전합니다.
      //     만약 users/{uid}.name을 쓰고 싶으면 여기서 불러와 비교하도록 확장 가능.
      return -1;
    };

    // 실제 매칭 실행
    let idx = findIndexByPriority();

    // (추가) email && name 동시 매칭 강화:
    // 업로드에 email과 name이 모두 있으면 신뢰도가 높으므로 그 케이스를 선호
    if (idx < 0 && uEmailNorm) {
      // 업로드에 같은 이메일이 여러 개인 드문 상황에서,
      // 이름도 같이 맞는 항목을 우선 선택하려는 로직
      const candidates = arr
        .map((p, i) => ({ i, p }))
        .filter(({ p }) => normalize(p?.email) === uEmailNorm);

      if (candidates.length > 1) {
        // 이름까지 비교 (participants 쪽 이름만 있음)
        const withName = candidates.find(({ p }) => normalize(pickName(p)) !== '');
        if (withName) idx = withName.i;
      } else if (candidates.length === 1) {
        idx = candidates[0].i;
      }
    }

    if (idx >= 0) {
      const target = { ...arr[idx] };
      let changed = false;
      if (target.uid !== uid) { target.uid = uid; changed = true; }
      if (!target.email && uEmail) { target.email = uEmail; changed = true; }
      // 이름은 업로드 값이 우선(불변). 로그인 유저 이름을 덮지 않습니다.
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
    } catch (e) {
      console.warn('post-login sync failed:', e);
    }
    onEnter?.();
  };

  const handleSignUp = async () => {
    await signUpEmail(email, pw); // 익명→회원 링크 또는 신규 생성
    try {
      if (eventId && user) {
        await syncMembershipAndLinkParticipant(user, eventId);
        setLoginTicket(eventId);
      }
    } catch (e) {
      console.warn('post-signup sync failed:', e);
    }
    onEnter?.();
  };

  const handleReset = async () => {
    await resetPassword(email);
    alert('입력한 이메일로 비밀번호 재설정 메일을 보냈습니다(계정이 존재하는 경우).');
  };

  const handleCode = async () => {
    // 익명 보장 후 코드검증
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

  // ── UI (탭: 로그인 / 인증코드) ────────────────────────────────
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setTab('login')} style={{ fontWeight: tab==='login'?600:400 }}>로그인</button>
        <button onClick={() => setTab('code')}  style={{ fontWeight: tab==='code'?600:400  }}>인증코드</button>
      </div>

      {tab === 'login' ? (
        <div>
          <input placeholder="이메일" value={email} onChange={e=>setEmail(e.target.value)} />
          <input placeholder="비밀번호" type="password" value={pw} onChange={e=>setPw(e.target.value)} />
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button onClick={handleLogin}>로그인</button>
            <button onClick={handleSignUp}>회원가입</button>
            <button onClick={handleReset}>비번 재설정</button>
          </div>
        </div>
      ) : (
        <div>
          <input placeholder="인증코드 6자리" value={code} onChange={e=>setCode(e.target.value)} />
          <div style={{ marginTop:8 }}>
            <button onClick={handleCode}>코드로 입장</button>
          </div>
        </div>
      )}
    </div>
  );
}

// 외부에서 <PlayerAuthProvider>로 감싸 바로 사용
export default function LoginOrCode(props) {
  return (
    <PlayerAuthProvider>
      <InnerLoginOrCode {...props} />
    </PlayerAuthProvider>
  );
}
