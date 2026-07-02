// /src/utils/agmDiag.js
// AGM 진단/검증용 최소 유틸 (원본 로직에 영향 없이 콘솔/메모리 추적만 수행)

const DIAG_FLAG_KEY = 'AGM_DEBUG';
const MAX_TIMELINE = 300;

export function isAgmDiagEnabled() {
  try {
    return localStorage.getItem(DIAG_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function safeClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function ensureDiagRoot() {
  try {
    if (typeof window === 'undefined') return null;
    const prev = (window.__AGM_DIAG && typeof window.__AGM_DIAG === 'object') ? window.__AGM_DIAG : {};
    if (!Array.isArray(prev.timeline)) prev.timeline = [];
    window.__AGM_DIAG = prev;
    return window.__AGM_DIAG;
  } catch {
    return null;
  }
}

export function diagMerge(scope, patch) {
  const root = ensureDiagRoot();
  if (!root || !scope) return;
  const prev = (root[scope] && typeof root[scope] === 'object') ? root[scope] : {};
  root[scope] = { ...prev, ...safeClone(patch) };
  if (isAgmDiagEnabled()) {
    try { console.log(`[AGM][diag:${scope}]`, root[scope]); } catch {}
  }
}

export function diagPush(scope, entry) {
  const root = ensureDiagRoot();
  if (!root) return;
  const payload = {
    scope: scope || 'timeline',
    at: Date.now(),
    ...(safeClone(entry) || {}),
  };
  root.timeline.push(payload);
  if (root.timeline.length > MAX_TIMELINE) {
    root.timeline.splice(0, root.timeline.length - MAX_TIMELINE);
  }
  if (isAgmDiagEnabled()) {
    try { console.log('[AGM][diag:timeline]', payload); } catch {}
  }
}

export function diagSummaryEvent(eventId, eventData) {
  const src = (eventData && typeof eventData === 'object') ? eventData : {};
  return {
    eventId: eventId || '',
    title: String(src?.title || ''),
    mode: String(src?.mode || ''),
    roomCount: Number(src?.roomCount || 0),
    eventsCount: Array.isArray(src?.events) ? src.events.length : 0,
    participantsCount: Array.isArray(src?.participants) ? src.participants.length : 0,
    scoresCount: (src?.scores && typeof src.scores === 'object') ? Object.keys(src.scores).length : 0,
    eventInputsCount: (src?.eventInputs && typeof src.eventInputs === 'object') ? Object.keys(src.eventInputs).length : 0,
    inputsUpdatedAt: src?.inputsUpdatedAt || null,
    participantsUpdatedAt: src?.participantsUpdatedAt || null,
  };
}

export function diagSummaryParticipant(participant) {
  const src = (participant && typeof participant === 'object') ? participant : {};
  return {
    id: src?.id ?? '',
    nickname: src?.nickname ?? '',
    authCode: src?.authCode ?? '',
    room: src?.room ?? src?.roomNumber ?? null,
    partner: src?.partner ?? null,
    group: src?.group ?? null,
  };
}

// ✅ [6/10] 라이브 운영 진단 보강
// - 화면/로직에는 영향 없이, 운영 중 문제가 발생했을 때 콘솔에서 상태를 바로 복사할 수 있게 합니다.
export function diagGetSnapshot(extra = {}) {
  const root = ensureDiagRoot() || {};
  const safeTimeline = Array.isArray(root.timeline) ? root.timeline.slice(-120) : [];
  let storage = {};
  try {
    storage = {
      eventId: localStorage.getItem('eventId') || '',
      homeViewMode: localStorage.getItem('homeViewMode') || '',
      installMode: localStorage.getItem('agm.installMode') || '',
      lastRoute: localStorage.getItem('agm.lastRoute') || '',
      pendingCode: sessionStorage.getItem('pending_code') ? 'yes' : 'no',
    };
  } catch {}
  return safeClone({
    at: new Date().toISOString(),
    href: (typeof window !== 'undefined' && window.location) ? window.location.href : '',
    userAgent: (typeof navigator !== 'undefined') ? navigator.userAgent : '',
    storage,
    eventContext: root.eventContext || null,
    eventList: root.eventList || null,
    playerContext: root.playerContext || null,
    playerEventInput: root.playerEventInput || null,
    timeline: safeTimeline,
    ...extra,
  });
}

export function diagMarkError(scope, error, extra = {}) {
  const err = {
    message: String(error?.message || error || ''),
    code: String(error?.code || ''),
    name: String(error?.name || ''),
  };
  diagMerge(scope || 'lastError', { lastErrorAt: Date.now(), lastError: err, ...(safeClone(extra) || {}) });
  diagPush(scope || 'error', { type: `${scope || 'unknown'}.error`, error: err, ...(safeClone(extra) || {}) });
}

export function installAgmDiagHelpers() {
  try {
    if (typeof window === 'undefined') return;
    const root = ensureDiagRoot();
    if (!root || root.__helpersInstalled) return;
    root.__helpersInstalled = true;
    root.snapshot = (extra = {}) => diagGetSnapshot(extra);
    root.clear = () => {
      const next = ensureDiagRoot();
      if (next) next.timeline = [];
      return true;
    };
    root.print = () => {
      const snap = diagGetSnapshot();
      try { console.log('[AGM][DIAG SNAPSHOT]', snap); } catch {}
      return snap;
    };
    root.copy = async () => {
      const text = JSON.stringify(diagGetSnapshot(), null, 2);
      try {
        if (navigator?.clipboard?.writeText) await navigator.clipboard.writeText(text);
      } catch {}
      try { console.log(text); } catch {}
      return text;
    };
  } catch {}
}

installAgmDiagHelpers();
