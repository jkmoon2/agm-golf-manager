// /src/player/screens/PlayerEventList.jsx

import React, { useContext, useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventContext } from '../../contexts/EventContext';
import { db, waitForAuthRestored, ensureAnonAfterCode } from '../../firebase';
import { collection, getDocs, getDocsFromServer, getDoc, doc, setDoc } from 'firebase/firestore'; // ✅ 변경: setDoc 추가
import styles from './EventSelectScreen.module.css';
import { getAuth, onAuthStateChanged } from 'firebase/auth'; // ✅ 이메일 로그인 감지
import { markPlayerAuthed, writePlayerTicket } from '../utils/playerState';
import { diagMerge, diagPush, diagMarkError } from '../../utils/agmDiag';

export default function PlayerEventList() {
  const nav = useNavigate();
  const { allEvents = [], loadEvent, setEventId, eventsLoading = false, eventsError = null, refreshEventsNow } = useContext(EventContext) || {};
  const [cache, setCache] = useState([]);
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const events = useMemo(() => (allEvents?.length ? allEvents : cache), [allEvents, cache]);


  // ✅ 이메일 세션이 살아 있어도, 로그인 화면에서 사용자가 버튼을 누른 현재 JS 실행 컨텍스트에서만
  //    대회 목록/참가자 홈 진입을 허용합니다. sessionStorage는 브라우저 복원 시 살아날 수 있어 최종 기준으로 쓰지 않습니다.
  const EMAIL_ENTRY_GATE_GLOBAL = '__AGM_EMAIL_ENTRY_GATE__';
  const EMAIL_ENTRY_GATE_TTL_MS = 12 * 60 * 60 * 1000;
  const getFreshEmailEntryGate = (expectedEmail = '') => {
    try {
      const gate = window[EMAIL_ENTRY_GATE_GLOBAL];
      if (!gate || gate.via !== 'email') return null;
      const now = Date.now();
      const at = Number(gate.at || 0);
      const expireAt = Number(gate.expireAt || 0);
      if (!at || now - at > EMAIL_ENTRY_GATE_TTL_MS) return null;
      if (expireAt && now > expireAt) return null;
      const gateEmail = normEmail(gate.email || '');
      const expected = normEmail(expectedEmail);
      if (expected && gateEmail && expected !== gateEmail) return null;
      return gate;
    } catch {
      return null;
    }
  };

  // ✅ 숨김 처리: 참가자 화면에서 숨긴 대회(isHidden) 제외
  const visibleEvents = useMemo(
    () => (Array.isArray(events) ? events.filter(ev => !ev?.isHidden) : []),
    [events]
  );

  useEffect(() => {
    let alive = true;
    let retryTimer = null;

    const clearRetry = () => {
      try { if (retryTimer) clearTimeout(retryTimer); } catch {}
      retryTimer = null;
    };
    const scheduleRetry = () => {
      if (!alive) return;
      clearRetry();
      retryTimer = setTimeout(() => {
        retryTimer = null;
        loadEventsOnce();
      }, 900);
    };

    const loadEventsOnce = async () => {
      if (!alive) return;
      if (allEvents && allEvents.length) return;
      try { diagPush('timeline', { type: 'playerEventList.loadEvents:start', allEventsCount: Array.isArray(allEvents) ? allEvents.length : 0 }); } catch {}
      try {
        // ✅ 인증코드 입장 직후에는 아직 Firebase 사용자가 없을 수 있습니다.
        // Firestore 규칙상 events 읽기는 isAuthed()가 필요하므로,
        // pending_code가 있을 때만 익명 인증을 먼저 확보한 뒤 대회 목록을 읽습니다.
        const hasPendingCode = !!sessionStorage.getItem('pending_code');
        const auth = getAuth();
        if (hasPendingCode && !auth.currentUser) {
          await ensureAnonAfterCode('__event_list__', { timeoutMs: 1200 });
        } else if (!auth.currentUser) {
          await waitForAuthRestored(1200);
        }

        if (!getAuth().currentUser) {
          scheduleRetry();
          return;
        }

        if (typeof refreshEventsNow === 'function') {
          const list = await refreshEventsNow('player-event-list');
          if (!alive) return;
          setCache(Array.isArray(list) ? list : []);
          try {
            diagMerge('playerEventList', { lastLoadAt: Date.now(), source: 'EventContext.refreshEventsNow', count: Array.isArray(list) ? list.length : 0 });
            diagPush('timeline', { type: 'playerEventList.loadEvents:success', source: 'refreshEventsNow', count: Array.isArray(list) ? list.length : 0 });
          } catch {}
          return;
        }
        let snap = null;
        try {
          snap = await getDocsFromServer(collection(db, 'events'));
        } catch {
          snap = await getDocs(collection(db, 'events'));
        }
        if (!alive) return;
        const list = [];
        snap.forEach(d => { const v = d.data() || {}; list.push({ id: d.id, ...v }); });
        setCache(list);
        try {
          diagMerge('playerEventList', { lastLoadAt: Date.now(), source: 'directFirestore', count: list.length });
          diagPush('timeline', { type: 'playerEventList.loadEvents:success', source: 'directFirestore', count: list.length });
        } catch {}
      } catch (e) {
        try { diagMarkError('playerEventList', e, { type: 'playerEventList.loadEvents:fail' }); } catch {}
        console.warn('[PlayerEventList] events load failed; retrying:', e);
        if (alive) scheduleRetry();
      }
    };

    loadEventsOnce();
    return () => {
      alive = false;
      clearRetry();
    };
  }, [allEvents, authReady, authUser, refreshEventsNow]);

  useEffect(() => {
    const auth = getAuth();
    const off = onAuthStateChanged(auth, (u) => {
      setAuthUser(u || null);
      setAuthReady(true);
    });
    return () => off();
  }, []);

  // /player/events로 바로 들어온 경우: 코드도 없고 이전 인증도 없고 이메일 로그인도 아니면 로그인으로
  useEffect(() => {
    if (!authReady) return;
    try {
      const hasPending = !!sessionStorage.getItem('pending_code');
      const authedSome = Object.keys(sessionStorage).some(
        k => k.startsWith('auth_') && sessionStorage.getItem(k) === 'true'
      );
      const emailUser = !!(authUser && !authUser.isAnonymous);
      const emailGate = emailUser ? !!getFreshEmailEntryGate(authUser?.email || '') : false;
      let hasCodeVia = false;
      try {
        for (let i = 0; i < sessionStorage.length; i += 1) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith('agm.loginVia_') && sessionStorage.getItem(k) === 'code') hasCodeVia = true;
        }
      } catch {}
      if (emailUser && !emailGate && !hasPending && !hasCodeVia) {
        nav('/player/login-or-code', { replace: true });
        return;
      }
      if (!hasPending && !authedSome && !emailUser) {
        nav('/player/login-or-code', { replace: true });
      }
    } catch {}
  }, [nav, authReady, authUser]);

  const fmt = (s) =>
    (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s))
      ? s.replaceAll('-', '.')
      : '미정';

  const tsToMillis = (ts) => {
    if (ts == null) return null;
    if (typeof ts === 'number') return ts;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (typeof ts.seconds === 'number') return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1e6;
    return null;
  };
  const dateStrToMillis = (s, kind) => {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const t = kind === 'start' ? '00:00:00' : '23:59:59';
    const d = new Date(`${s}T${t}`);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  };
  const getStartEnd = (ev) => ({
    startAt: tsToMillis(ev?.accessStartAt) ?? dateStrToMillis(ev?.dateStart, 'start'),
    endAt:   tsToMillis(ev?.accessEndAt)   ?? dateStrToMillis(ev?.dateEnd, 'end'),
  });
  const isAccessAllowed = (ev) => {
    if (!ev?.allowDuringPeriodOnly) return true;
    const { startAt, endAt } = getStartEnd(ev);
    const now = Date.now();
    if (startAt && now < startAt) return false;
    if (endAt && now > endAt) return false;
    return true;
  };
  const isEnded = (ev) => {
    const { endAt } = getStartEnd(ev);
    return !!(endAt && Date.now() > endAt);
  };

  const normEmail = (v) => String(v || '').trim().toLowerCase();
  const normText = (v) => String(v || '').normalize('NFC').trim();
  const getParticipantEmail = (p) => normEmail(
    p?.email ?? p?.playerEmail ?? p?.loginEmail ?? p?.userEmail ?? p?.memberEmail ?? p?.accountEmail ?? ''
  );
  const getParticipantName = (p) => normText(p?.nickname ?? p?.name ?? p?.displayName ?? '');
  const getParticipantRealName = (p) => normText(p?.name ?? p?.displayName ?? '');
  const enrichEmailParticipant = (p, email, pre = null) => {
    if (!p) return p;
    const patch = {};
    if (email && !getParticipantEmail(p)) patch.email = email;
    if (pre?.name && !getParticipantRealName(p)) patch.name = pre.name;
    if (pre?.nickname && !normText(p?.nickname)) patch.nickname = pre.nickname;
    return Object.keys(patch).length ? { ...p, ...patch } : p;
  };

  const collectParticipantsFromEvent = async (eventId, ev = {}) => {
    const merged = [];
    const push = (arr) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((p, i) => {
        if (!p) return;
        merged.push({ id: p?.id ?? p?.uid ?? `${merged.length || i}`, ...p });
      });
    };
    push(ev.participants);
    push(ev.participantsStroke);
    push(ev.participantsFourball);
    try {
      const snap = await getDoc(doc(db, 'events', eventId));
      const ed = snap.exists() ? (snap.data() || {}) : {};
      push(ed.participants);
      push(ed.participantsStroke);
      push(ed.participantsFourball);
    } catch {}
    try {
      const qs = await getDocs(collection(db, 'events', eventId, 'participants'));
      qs.forEach(d => merged.push({ id: d.id, ...(d.data() || {}) }));
    } catch {}
    const map = new Map();
    const mergeKeepFilled = (prev = {}, cur = {}) => {
      const out = { ...prev, ...cur };
      ['email', 'playerEmail', 'loginEmail', 'userEmail', 'memberEmail', 'accountEmail', 'name', 'nickname', 'authCode'].forEach((k) => {
        if ((cur?.[k] === undefined || cur?.[k] === null || cur?.[k] === '') && prev?.[k] !== undefined && prev?.[k] !== null && prev?.[k] !== '') {
          out[k] = prev[k];
        }
      });
      return out;
    };
    merged.forEach((p, i) => {
      const key = String(p?.id ?? p?.authCode ?? p?.nickname ?? i);
      map.set(key, map.has(key) ? mergeKeepFilled(map.get(key), p) : p);
    });
    return Array.from(map.values());
  };

  const findParticipantByEmailUser = async (eventId, ev, user) => {
    const email = normEmail(user?.email);
    if (!eventId || !email) return null;
    const list = await collectParticipantsFromEvent(eventId, ev);

    // 1순위: 참가자 명단에 이메일 컬럼이 있으면 이메일로 정확히 매칭
    let found = list.find(p => getParticipantEmail(p) === email) || null;
    if (found) return enrichEmailParticipant(found, email);

    // 2순위: preMembers의 nickname/name/group을 이용해 참가자 명단과 연결
    let pre = null;
    try {
      const preSnap = await getDoc(doc(db, 'events', eventId, 'preMembers', email));
      if (preSnap.exists()) pre = preSnap.data() || {};
    } catch {}
    const preGroup = Number(pre?.group);
    const hasPreGroup = Number.isFinite(preGroup);
    const preNames = [pre?.nickname, pre?.name, pre?.nameCell].map(normText).filter(Boolean);
    for (const nm of preNames) {
      let matches = list.filter(p => getParticipantName(p) === nm || getParticipantRealName(p) === nm);
      if (matches.length > 1 && hasPreGroup) {
        const groupMatches = matches.filter(p => Number(p?.group) === preGroup);
        if (groupMatches.length === 1) matches = groupMatches;
      }
      if (matches.length === 1) return enrichEmailParticipant(matches[0], email, pre);
    }

    // 3순위: users/{uid}.name 또는 Firebase displayName이 참가자 닉네임과 정확히 1명만 일치할 때만 허용
    let userName = normText(user?.displayName || '');
    try {
      const uSnap = await getDoc(doc(db, 'users', user.uid));
      if (uSnap.exists()) userName = normText(uSnap.data()?.name || userName);
    } catch {}
    if (userName) {
      const matches = list.filter(p => getParticipantName(p) === userName || getParticipantRealName(p) === userName);
      if (matches.length === 1) return enrichEmailParticipant(matches[0], email, { name: userName });
    }

    return null;
  };

  const verifyPendingCode = async (eventId) => {
    try {
      const code = sessionStorage.getItem('pending_code') || '';
      if (!code) return { ok:false };
      const snap = await getDoc(doc(db, 'events', eventId));
      if (!snap.exists()) return { ok:false };

      const findInArray = (arr) =>
        Array.isArray(arr) && arr.find(p => {
          const v = String(p?.authCode ?? p?.code ?? p?.auth_code ?? p?.authcode ?? '').trim();
          return v && v.toUpperCase() === code.toUpperCase();
        });

      // ✅ 모드 분리 저장(participantsStroke/participantsFourball)까지 모두 탐색
      const ed = snap.data() || {};
      let participant =
        findInArray(ed.participants) ||
        findInArray(ed.participantsStroke) ||
        findInArray(ed.participantsFourball);
      if (!participant) {
        const qs = await getDocs(collection(db, 'events', eventId, 'participants'));
        qs.forEach(d => {
          const v = d.data() || {};
          const vv = String(v?.authCode ?? v?.code ?? v?.auth_code ?? v?.authcode ?? '').trim();
          if (!participant && vv.toUpperCase() === (sessionStorage.getItem('pending_code') || '').toUpperCase()) {
            participant = { id: d.id, ...v };
          }
        });
      }
      if (!participant) return { ok:false };

      // 통과 처리 (세션 보존)
      markPlayerAuthed(eventId, sessionStorage.getItem('pending_code') || '', participant);
      try { sessionStorage.setItem(`agm.loginVia_${eventId}`, 'code'); } catch {}
      writePlayerTicket(eventId, { code: sessionStorage.getItem('pending_code') || '', via: 'code', ts: Date.now() });
      return { ok:true, participant };
    } catch {
      return { ok:false };
    }
  };

  // ✅ 변경: 인증 보장 + (옵션) membership 문서 생성
  // - 인증코드 입장은 비로그인 상태일 때만 익명 로그인
  // - 이메일 로그인 사용자는 이메일 계정을 그대로 유지
  const ensureAnonymousAndMembership = async (eventId, via = 'code', participant = null) => {
    const auth = getAuth();
    const user = via === 'email'
      ? (await waitForAuthRestored(1200))
      : (auth.currentUser || await ensureAnonAfterCode(eventId));
    if (!user) return;
    try {
      await setDoc(
        doc(db, 'events', eventId, 'memberships', user.uid),
        {
          uid: user.uid,
          email: user.email || null,
          via,
          participantId: participant?.id ?? null,
          nickname: participant?.nickname || null,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    } catch {}
  };

  const goNext = async (ev) => {
    if (!isAccessAllowed(ev)) { alert('대회 기간이 아닙니다.'); return; }
    setEventId?.(ev.id);
    try { localStorage.setItem('eventId', ev.id); } catch {}

    const auth = getAuth();
    const restoredUser = await waitForAuthRestored(1200);
    const emailUser = (restoredUser && !restoredUser.isAnonymous)
      ? restoredUser
      : ((auth.currentUser && !auth.currentUser.isAnonymous)
        ? auth.currentUser
        : ((authUser && !authUser.isAnonymous) ? authUser : null));

    const pendingCode = (() => { try { return sessionStorage.getItem('pending_code') || ''; } catch { return ''; } })();

    // 이메일 로그인 사용자는 먼저 해당 대회의 참가자와 매칭한 뒤 입장
    // 단, 현재 화면에서 인증코드를 새로 입력한 경우에는 인증코드 흐름을 우선합니다.
    if (emailUser && !pendingCode) {
      const participant = await findParticipantByEmailUser(ev.id, ev, emailUser);
      if (!participant) {
        alert(
          '이 이메일 계정과 연결된 참가자를 찾지 못했습니다.\n\n' +
          '확인할 내용:\n' +
          '1) 운영자 STEP4 엑셀에 이메일 컬럼이 저장되어 있는지 확인\n' +
          '2) 또는 preMembers에 이메일/닉네임/이름이 등록되어 있는지 확인\n' +
          '3) STEP4 엑셀을 이번 패치 적용 후 다시 업로드했는지 확인'
        );
        return;
      }
      try { sessionStorage.setItem(`agm.loginVia_${ev.id}`, 'email'); } catch {}
      markPlayerAuthed(ev.id, participant?.authCode || '', participant);
      writePlayerTicket(ev.id, { via: 'email', email: emailUser.email || '', participantId: participant?.id ?? null, ts: Date.now() });
      await ensureAnonymousAndMembership(ev.id, 'email', participant);
      if (typeof loadEvent === 'function') { try { await loadEvent(ev.id); } catch {} }
      nav(`/player/home/${ev.id}`, { replace: true });
      return;
    }

    // 이미 인증된 대회면 코드 없이 바로 입장
    try {
      if (sessionStorage.getItem(`auth_${ev.id}`) === 'true') {
        try {
          if (!sessionStorage.getItem(`agm.loginVia_${ev.id}`)) sessionStorage.setItem(`agm.loginVia_${ev.id}`, 'code');
        } catch {}
        await ensureAnonymousAndMembership(ev.id, 'code'); // ✅ 변경
        if (typeof loadEvent === 'function') { try { await loadEvent(ev.id); } catch {} }
        nav(`/player/home/${ev.id}`, { replace: true });
        return;
      }
    } catch {}

    // 아직 인증되지 않은 대회는 pending_code로 검증
    const code = sessionStorage.getItem('pending_code');
    if (!code) {
      alert('먼저 참가자 로그인 화면에서 인증코드를 입력해 주세요.');
      nav('/player/login-or-code', { replace: true });
      return;
    }

    const { ok, participant } = await verifyPendingCode(ev.id);
    if (ok) {
      await ensureAnonymousAndMembership(ev.id, 'code', participant); // ✅ 변경
      if (typeof loadEvent === 'function') { try { await loadEvent(ev.id); } catch {} }
      nav(`/player/home/${ev.id}`, { replace: true });
    } else {
      alert('이 대회 참가 명단에 해당 인증코드가 없습니다. 다시 입력해 주세요.');
      try { sessionStorage.removeItem('pending_code'); } catch {}
      nav('/player/login-or-code', { replace: true });
    }
  };

  const endedBadgeStyle = {
    marginLeft: 6,
    padding: '2px 6px',
    borderRadius: 8,
    background: '#fee2e2',
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap'
  };

  return (
    <div className={styles.container}>
      {!visibleEvents.length && <div className={styles.empty}>등록된 대회가 없습니다.</div>}
      <ul className={styles.list}>
        {visibleEvents.map(ev => {
          const dateStart = ev.dateStart ?? ev.startDate ?? '';
          const dateEnd   = ev.dateEnd   ?? ev.endDate   ?? '';
          const count = Array.isArray(ev.participants) ? ev.participants.length : 0;
          const isFour = (ev.mode === 'agm' || ev.mode === 'fourball');
          const accessOk = isAccessAllowed(ev);
          const ended = isEnded(ev);

          return (
            <li
              key={ev.id}
              className={styles.card}
              onClick={() => goNext(ev)}
              style={accessOk ? undefined : { opacity: 0.55, cursor: 'not-allowed' }}
              title={accessOk ? undefined : '대회 기간 외 접속 제한'}
            >
              <div className={styles.titleRow}>
                <h3 className={styles.title} title={ev.title}>{ev.title || ev.id}</h3>
                <span className={`${styles.badge} ${isFour ? styles.badgeFour : styles.badgeStroke}`}>
                  {isFour ? 'AGM 포볼' : '스트로크'}
                </span>
                {ended && <span style={endedBadgeStyle}>종료</span>}
              </div>
              <div className={styles.subline}>
                <span>👥 참가자 {count}명</span>
                {(dateStart || dateEnd) && <span>📅 {fmt(dateStart)} ~ {fmt(dateEnd)}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
