// /src/utils/playerPresence.js

import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { db } from '../firebase';

const HEARTBEAT_MS = 25000;
const IDLE_MS = 5 * 60 * 1000;

const DEBUG = (() => {
  try { return localStorage.getItem('AGM_DEBUG') === '1'; } catch { return false; }
})();


function getPresenceTabId() {
  try {
    if (!window.name || !window.name.startsWith('AGM_PLAYER_TAB_')) {
      window.name = `AGM_PLAYER_TAB_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    }
    return window.name;
  } catch {
    return `AGM_PLAYER_TAB_FALLBACK_${Date.now()}`;
  }
}

export function makePresenceSessionId(eventId = '') {
  return `${eventId || 'noevent'}__${getPresenceTabId()}`;
}

async function ensureAuthReady() {
  const auth = getAuth();
  if (!auth.currentUser) {
    const cred = await signInAnonymously(auth);
    try { await cred.user.getIdToken(true); } catch {}
    return cred.user || null;
  }
  try { await auth.currentUser.getIdToken(true); } catch {}
  return auth.currentUser || null;
}

function nowMs() {
  return Date.now();
}

export function startPlayerPresence(opts = {}) {
  const {
    eventId = '',
    page = '',
    authCode = '',
    participant = null,
    currentRoom = null,
  } = opts;

  if (!eventId) return () => {};

  const sessionId = makePresenceSessionId(eventId);
  const sessionRef = doc(db, 'events', eventId, 'presence', sessionId);

  let disposed = false;
  let heartbeatTimer = null;
  let lastActivityAt = nowMs();

  const markActivity = () => {
    lastActivityAt = nowMs();
  };

  const writePresence = async ({ closing = false } = {}) => {
    if (disposed) return;
    try {
      const user = await ensureAuthReady();
      const idle = (nowMs() - lastActivityAt) > IDLE_MS;
      const visible = (typeof document !== 'undefined') ? !document.hidden : true;

      const payload = {
        sessionId,
        identityKey: String(
          participant?.id || authCode || user?.uid || participant?.nickname || sessionId
        ).trim(),
        uid: user?.uid || '',
        authCode: String(authCode || ''),
        participantId: participant?.id ?? '',
        nickname: participant?.nickname || '',
        room: Number.isFinite(Number(currentRoom ?? participant?.room)) ? Number(currentRoom ?? participant?.room) : null,
        page: String(page || ''),
        visibility: visible ? 'visible' : 'hidden',
        state: closing ? 'closed' : (idle ? 'idle' : 'active'),
        isOnline: !closing && !idle,
        lastSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastSeenAtClient: nowMs(),
        updatedAtClient: nowMs(),
        lastActivityAtClient: lastActivityAt,
      };

      if (!closing) {
        payload.loginAt = serverTimestamp();
      }

      await setDoc(sessionRef, payload, { merge: true });
      if (DEBUG) {
        try {
          console.log('[AGM][presence] writeSuccess', {
            eventId,
            sessionId,
            state: payload.state,
            identityKey: payload.identityKey,
            room: payload.room,
            page: payload.page,
            uid: payload.uid,
          });
        } catch {}
      }
    } catch (e) {
      try { console.warn('[AGM][presence] writeFailed:', e); } catch {}
    }
  };

  const onVisible = () => {
    markActivity();
    void writePresence();
  };

  const onUserActivity = () => {
    markActivity();
  };

  let unloadFired = false;
  const onUnload = () => {
    if (unloadFired) return;
    unloadFired = true;
    void writePresence({ closing: true });
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('click', onUserActivity, true);
    window.addEventListener('touchstart', onUserActivity, true);
    window.addEventListener('keydown', onUserActivity, true);
    window.addEventListener('scroll', onUserActivity, true);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible, true);
  }

  void writePresence();
  heartbeatTimer = setInterval(() => {
    void writePresence();
  }, HEARTBEAT_MS);

  return () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('click', onUserActivity, true);
      window.removeEventListener('touchstart', onUserActivity, true);
      window.removeEventListener('keydown', onUserActivity, true);
      window.removeEventListener('scroll', onUserActivity, true);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible, true);
    }
    // 일반적인 React effect cleanup(의존성 변경/재실행)에서는 세션을 닫지 않습니다.
    // 실제 탭 종료/이탈(beforeunload/pagehide)에서만 closed 기록을 남깁니다.
    disposed = true;
  };
}
