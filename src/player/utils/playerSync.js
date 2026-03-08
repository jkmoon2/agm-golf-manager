// /src/player/utils/playerSync.js

const normId = (v) => String(v ?? '').trim();

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

export function playerScopedKey(eventId, key) {
  return `agm:player:${getPlayerTabId()}:${eventId || 'noevent'}:${key}`;
}

function readJSON(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function readPlayerRoomFromStorage(eventId) {
  const keys = [
    ['session', `player.currentRoom:${eventId}`],
    ['local', playerScopedKey(eventId, 'currentRoom')],
    ['local', `player.currentRoom:${eventId}`],
    ['local', 'player.currentRoom'],
    ['local', 'player.home.room'],
    ['local', 'player.auth.room'],
  ];
  for (const [where, key] of keys) {
    try {
      const raw = where === 'session' ? sessionStorage.getItem(key) : localStorage.getItem(key);
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 1) return n;
    } catch {}
  }
  return NaN;
}

export function writePlayerRoomToStorage(eventId, roomNo) {
  if (!eventId) return;
  const n = Number(roomNo);
  if (!Number.isFinite(n) || n < 1) return;
  try { sessionStorage.setItem(`player.currentRoom:${eventId}`, String(n)); } catch {}
  try { localStorage.setItem(playerScopedKey(eventId, 'currentRoom'), String(n)); } catch {}
}

export function writePlayerIdentityToStorage(eventId, codeStr, participantObj) {
  if (!eventId) return;
  try {
    sessionStorage.setItem(`auth_${eventId}`, 'true');
    if (codeStr) sessionStorage.setItem(`authcode_${eventId}`, String(codeStr));
    if (participantObj) sessionStorage.setItem(`participant_${eventId}`, JSON.stringify(participantObj));
  } catch {}
  try {
    localStorage.setItem(playerScopedKey(eventId, 'auth'), 'true');
    if (codeStr) localStorage.setItem(playerScopedKey(eventId, 'authcode'), String(codeStr));
    if (participantObj) localStorage.setItem(playerScopedKey(eventId, 'participant'), JSON.stringify(participantObj));
    if (participantObj?.id != null) localStorage.setItem(playerScopedKey(eventId, 'myId'), String(participantObj.id));
    if (participantObj?.nickname) localStorage.setItem(playerScopedKey(eventId, 'nickname'), String(participantObj.nickname));
  } catch {}
}

export function readPlayerIdentityFromStorage(eventId) {
  if (!eventId) return { code: '', participant: null };
  let code = '';
  let participant = null;
  try {
    code = sessionStorage.getItem(`authcode_${eventId}`) || '';
    participant = readJSON(sessionStorage.getItem(`participant_${eventId}`));
    if (code || participant) return { code, participant };
  } catch {}
  try {
    code = localStorage.getItem(playerScopedKey(eventId, 'authcode')) || '';
    participant = readJSON(localStorage.getItem(playerScopedKey(eventId, 'participant')));
    if (code || participant) return { code, participant };
  } catch {}
  try {
    code = localStorage.getItem(`authcode:${eventId}`) || '';
    participant = readJSON(localStorage.getItem(`participant:${eventId}`));
  } catch {}
  return { code, participant };
}

export function writeTicketToStorage(eventId, code) {
  if (!eventId) return;
  const payload = { code: code || '', ts: Date.now() };
  try { localStorage.setItem(playerScopedKey(eventId, 'ticket'), JSON.stringify(payload)); } catch {}
  try { localStorage.setItem(`ticket:${eventId}`, JSON.stringify(payload)); } catch {}
}

export function readTicketFromStorage(eventId) {
  if (!eventId) return null;
  const keys = [playerScopedKey(eventId, 'ticket'), `ticket:${eventId}`];
  for (const key of keys) {
    try {
      const val = readJSON(localStorage.getItem(key));
      if (val) return val;
    } catch {}
  }
  return null;
}

export function getEffectiveParticipantsFromDocData(data, fallback = []) {
  const safeArr = (v) => Array.isArray(v) ? v : [];
  const legacy = safeArr(data?.participants);
  const mode = (data?.mode === 'fourball' || data?.mode === 'agm') ? 'fourball' : 'stroke';
  const field = mode === 'fourball' ? 'participantsFourball' : 'participantsStroke';
  const primary = safeArr(data?.[field]);

  const map = new Map();
  [...legacy, ...primary].forEach((p, i) => {
    if (!p) return;
    const id = normId(p?.id ?? i);
    const key = id || JSON.stringify(p);
    map.set(key, { ...(map.get(key) || {}), ...(p || {}) });
  });

  const merged = Array.from(map.values()).map((p, i) => {
    const room = p?.room ?? p?.roomNumber ?? null;
    return { ...p, id: p?.id ?? i, room, roomNumber: room };
  });

  return merged.length ? merged : safeArr(fallback);
}

export function getEffectiveParticipantsFromEvent(eventData, fallback = []) {
  return getEffectiveParticipantsFromDocData(eventData || {}, fallback);
}
