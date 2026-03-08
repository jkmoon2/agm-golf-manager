// src/utils/authSessionDebug.js

import { getAuth, onAuthStateChanged } from 'firebase/auth';

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function compactUser(user) {
  if (!user) return null;
  return {
    uid: user.uid || null,
    email: user.email || null,
    isAnonymous: !!user.isAnonymous,
    providerIds: Array.isArray(user.providerData)
      ? user.providerData.map((p) => p?.providerId).filter(Boolean)
      : [],
  };
}

function buildSnapshot({ screen, eventId, route, appRole, firebaseUser, extra }) {
  const auth = getAuth();
  const currentUser = auth.currentUser || null;
  const contextUser = firebaseUser || null;

  const authRole = currentUser
    ? (currentUser.isAnonymous ? 'player' : 'admin')
    : null;

  const roleMismatch = !!(appRole && authRole && appRole !== authRole);
  const uidMismatch = !!(
    currentUser &&
    contextUser &&
    String(currentUser.uid || '') !== String(contextUser.uid || '')
  );
  const anonMismatch = !!(
    currentUser &&
    contextUser &&
    !!currentUser.isAnonymous !== !!contextUser.isAnonymous
  );
  const uiOnlyRoleChangeLikely = !uidMismatch && !anonMismatch && roleMismatch;
  const realAuthChangedLikely = uidMismatch || anonMismatch;

  return {
    ts: new Date().toISOString(),
    screen,
    route: route || (typeof window !== 'undefined' ? window.location.pathname : null),
    eventId: eventId || null,
    appRole: appRole || null,
    authRole,
    roleMismatch,
    uidMismatch,
    anonMismatch,
    uiOnlyRoleChangeLikely,
    realAuthChangedLikely,
    authCurrentUser: compactUser(currentUser),
    contextFirebaseUser: compactUser(contextUser),
    visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
    hasFocus: typeof document !== 'undefined' && typeof document.hasFocus === 'function'
      ? !!document.hasFocus()
      : null,
    storage: {
      eventId: safeLocalStorageGet('eventId'),
      installMode: safeLocalStorageGet('agm.installMode'),
      lastMode: safeLocalStorageGet('agm.lastMode'),
      homeViewMode: safeLocalStorageGet('homeViewMode'),
    },
    extra: extra || null,
  };
}

export function setupAuthSessionDebug({ screen, eventId, route, appRole, firebaseUser }) {
  const prefix = `[AGM][AUTHDBG][${screen}]`;

  const emit = (reason, extra = {}) => {
    const snapshot = buildSnapshot({
      screen,
      eventId,
      route,
      appRole,
      firebaseUser,
      extra: { reason, ...(extra || {}) },
    });

    try {
      const prev = (typeof window !== 'undefined' && window.__AGM_AUTHDBG__) || {};
      const history = Array.isArray(prev.history) ? prev.history.slice(-49) : [];
      if (typeof window !== 'undefined') {
        window.__AGM_AUTHDBG__ = {
          ...prev,
          last: snapshot,
          history: [...history, snapshot],
        };
      }
    } catch {}

    if (snapshot.realAuthChangedLikely || snapshot.uiOnlyRoleChangeLikely || snapshot.roleMismatch) {
      console.warn(prefix, snapshot);
    } else {
      console.log(prefix, snapshot);
    }

    return snapshot;
  };

  emit('mount');

  const auth = getAuth();
  const stopAuth = onAuthStateChanged(auth, (user) => {
    emit('onAuthStateChanged', {
      authUid: user?.uid || null,
      authIsAnonymous: !!user?.isAnonymous,
    });
  });

  const handleFocus = () => emit('window.focus');
  const handleVisibility = () => emit('visibilitychange');
  const handlePageShow = () => emit('pageshow');
  const handleStorage = (e) => {
    if (!e?.key) return;
    if (
      e.key === 'eventId' ||
      e.key === 'homeViewMode' ||
      e.key.startsWith('agm.') ||
      e.key.startsWith('ticket:')
    ) {
      emit('storage', { storageKey: e.key, newValue: e.newValue ?? null });
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('storage', handleStorage);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  return {
    emit,
    teardown() {
      try {
        stopAuth();
      } catch {}
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('pageshow', handlePageShow);
        window.removeEventListener('storage', handleStorage);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    },
  };
}
