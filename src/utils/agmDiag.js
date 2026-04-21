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
