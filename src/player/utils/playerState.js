// /src/player/utils/playerState.js

export function normalizeMode(mode = "stroke") {
  const m = String(mode || '').toLowerCase();
  return (m === 'fourball' || m === 'agm') ? 'fourball' : 'stroke';
}

export function participantsFieldByMode(mode = 'stroke') {
  return normalizeMode(mode) === 'fourball' ? 'participantsFourball' : 'participantsStroke';
}

export function mergeParticipantsById(primary = [], legacy = []) {
  const map = new Map();
  const push = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((p, i) => {
      if (!p) return;
      const obj = (p && typeof p === 'object') ? p : {};
      const id = String(obj?.id ?? obj?.uid ?? obj?.authCode ?? i);
      map.set(id, { ...(map.get(id) || {}), ...obj, id: obj?.id ?? id });
    });
  };
  // legacy 먼저, primary 나중 -> primary(모드 분리 필드)가 최종 우선
  push(legacy);
  push(primary);
  return Array.from(map.values()).map((p, i) => {
    const room = p?.room ?? p?.roomNumber ?? null;
    return { ...p, id: p?.id ?? i, room, roomNumber: room };
  });
}

export function getEffectiveParticipantsFromEvent(eventData, fallbackParticipants = [], modeOverride = null) {
  const safeArr = (v) => (Array.isArray(v) ? v : []);
  const md = normalizeMode(modeOverride || eventData?.mode || 'stroke');
  const field = participantsFieldByMode(md);
  const primary = safeArr(eventData?.[field]);
  const legacy = safeArr(eventData?.participants);
  const merged = (primary.length || legacy.length) ? mergeParticipantsById(primary, legacy) : [];
  const normalized = merged
    .filter(Boolean)
    .map((p, i) => {
      const obj = (p && typeof p === 'object') ? p : {};
      const id = obj?.id ?? i;
      const room = obj?.room ?? obj?.roomNumber ?? null;
      return { ...obj, id, room, roomNumber: room };
    });
  return normalized.length ? normalized : safeArr(fallbackParticipants);
}

export function getPlayerTabId() {
  try {
    if (!window.name || !window.name.startsWith('AGM_PLAYER_TAB_')) {
      window.name = `AGM_PLAYER_TAB_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    }
    return window.name;
  } catch {
    return 'AGM_PLAYER_TAB_FALLBACK';
  }
}

export function playerStorageKey(eventId, key) {
  return `agm:player:${getPlayerTabId()}:${eventId || 'noevent'}:${key}`;
}

function safeGet(storage, key) {
  try { return storage.getItem(key) || ''; } catch { return ''; }
}
function safeSet(storage, key, value) {
  try {
    if (value == null || value === '') storage.removeItem(key);
    else storage.setItem(key, String(value));
  } catch {}
}

export function readPlayerAuthCode(eventId, allowLegacyFallback = false) {
  const ss = safeGet(sessionStorage, `authcode_${eventId}`);
  if (ss) return ss;
  const scoped = safeGet(localStorage, playerStorageKey(eventId, 'authcode'));
  if (scoped) return scoped;
  return allowLegacyFallback ? safeGet(localStorage, `authcode:${eventId}`) : '';
}

export function writePlayerAuthCode(eventId, code) {
  safeSet(sessionStorage, `authcode_${eventId}`, code || '');
  safeSet(localStorage, playerStorageKey(eventId, 'authcode'), code || '');
}

export function readPlayerParticipant(eventId, allowLegacyFallback = false) {
  const parse = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
  const ss = parse(safeGet(sessionStorage, `participant_${eventId}`));
  if (ss) return ss;
  const scoped = parse(safeGet(localStorage, playerStorageKey(eventId, 'participant')));
  if (scoped) return scoped;
  return allowLegacyFallback ? parse(safeGet(localStorage, `participant:${eventId}`)) : null;
}

export function writePlayerParticipant(eventId, participant) {
  const raw = participant ? JSON.stringify(participant) : '';
  safeSet(sessionStorage, `participant_${eventId}`, raw);
  safeSet(localStorage, playerStorageKey(eventId, 'participant'), raw);
}

export function markPlayerAuthed(eventId, code = '', participant = null) {
  safeSet(sessionStorage, `auth_${eventId}`, 'true');
  safeSet(localStorage, playerStorageKey(eventId, 'auth'), 'true');
  if (code) writePlayerAuthCode(eventId, code);
  if (participant) writePlayerParticipant(eventId, participant);
}

export function readPlayerRoom(eventId, allowLegacyFallback = false) {
  const candidates = [
    safeGet(sessionStorage, playerStorageKey(eventId, 'room')),
    safeGet(localStorage, playerStorageKey(eventId, 'room')),
  ];
  if (allowLegacyFallback) {
    candidates.push(safeGet(localStorage, `player.currentRoom:${eventId}`));
    candidates.push(safeGet(localStorage, 'player.currentRoom'));
    candidates.push(safeGet(localStorage, 'player.home.room'));
    candidates.push(safeGet(localStorage, 'player.auth.room'));
  }
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  return NaN;
}

export function writePlayerRoom(eventId, room) {
  const v = Number(room);
  if (!Number.isFinite(v) || v < 1) return;
  safeSet(localStorage, playerStorageKey(eventId, 'room'), String(v));
  safeSet(sessionStorage, playerStorageKey(eventId, 'room'), String(v));
}

export function readPlayerTicket(eventId, allowLegacyFallback = false) {
  const parse = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };
  const scoped = parse(safeGet(localStorage, playerStorageKey(eventId || 'global', 'ticket')));
  if (scoped) return scoped;
  return allowLegacyFallback ? parse(safeGet(localStorage, `ticket:${eventId || 'global'}`)) : null;
}

export function writePlayerTicket(eventId, payload) {
  const raw = JSON.stringify(payload || {});
  safeSet(localStorage, playerStorageKey(eventId || 'global', 'ticket'), raw);
}
