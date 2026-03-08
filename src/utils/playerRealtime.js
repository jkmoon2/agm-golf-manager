// /src/utils/playerRealtime.js

const safeArr = (v) => (Array.isArray(v) ? v : []);

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

export function readPlayerScopedLocal(eventId, key, legacyKeys = []) {
  try {
    const scoped = localStorage.getItem(playerStorageKey(eventId, key));
    if (scoped != null && scoped !== '') return scoped;
  } catch {}
  for (const legacy of legacyKeys) {
    try {
      const raw = localStorage.getItem(legacy);
      if (raw != null && raw !== '') return raw;
    } catch {}
  }
  return '';
}

export function writePlayerScopedLocal(eventId, key, value, legacyKeys = []) {
  const next = value == null ? '' : String(value);
  try { localStorage.setItem(playerStorageKey(eventId, key), next); } catch {}
  for (const legacy of legacyKeys) {
    try {
      if (!legacy) continue;
      localStorage.setItem(legacy, next);
    } catch {}
  }
}

export function readPlayerRoomFromStorage(eventId) {
  const tryVals = [
    readPlayerScopedLocal(eventId, 'currentRoom', [`player.currentRoom:${eventId}`]),
    readPlayerScopedLocal(eventId, 'room', []),
    readPlayerScopedLocal(eventId, 'currentRoomLegacy', ['player.home.room', 'player.auth.room']),
  ];
  for (const raw of tryVals) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  return NaN;
}

export function writePlayerRoomToStorage(eventId, roomNo) {
  const n = Number(roomNo);
  if (!Number.isFinite(n) || n < 1) return;
  writePlayerScopedLocal(eventId, 'currentRoom', String(n), [`player.currentRoom:${eventId}`]);
  writePlayerScopedLocal(eventId, 'room', String(n), []);
}

export function mergeParticipantsById(primary = [], legacy = []) {
  const map = new Map();
  const push = (arr) => {
    safeArr(arr).forEach((p, i) => {
      if (!p) return;
      const obj = (p && typeof p === 'object') ? p : {};
      const id = String(obj?.id ?? obj?.uid ?? obj?.authCode ?? i);
      if (!map.has(id)) map.set(id, obj);
      else map.set(id, { ...(map.get(id) || {}), ...obj });
    });
  };
  push(legacy);
  push(primary);
  return Array.from(map.values());
}

export function getEffectiveParticipantsFromEvent(eventData, fallbackParticipants = [], forcedMode = null) {
  const safeEvent = eventData || {};
  const modeFromEvent = forcedMode || ((safeEvent?.mode === 'fourball' || safeEvent?.mode === 'agm') ? 'fourball' : 'stroke');
  const field = (modeFromEvent === 'fourball') ? 'participantsFourball' : 'participantsStroke';
  const primary = safeArr(safeEvent?.[field]);
  const legacy = safeArr(safeEvent?.participants);
  const fallback = safeArr(fallbackParticipants);
  const mergedRaw = primary.length ? mergeParticipantsById(primary, legacy) : (legacy.length ? legacy : fallback);
  return mergedRaw
    .filter(Boolean)
    .map((p, i) => {
      const obj = (p && typeof p === 'object') ? p : {};
      const id = obj?.id ?? i;
      const room = obj?.room ?? obj?.roomNumber ?? null;
      return { ...obj, id, room, roomNumber: room };
    });
}

function isEmptyEventInputValue(val) {
  if (val == null || val === '') return true;
  if (typeof val === 'object') {
    const values = Array.isArray(val?.values) ? val.values : null;
    const bonus = val?.bonus;
    if (values) {
      const hasValue = values.some((x) => String(x ?? '').trim() !== '');
      const hasBonus = Array.isArray(bonus) ? bonus.some((x) => String(x ?? '').trim() !== '') : String(bonus ?? '').trim() !== '';
      return !hasValue && !hasBonus;
    }
    return Object.keys(val).length === 0;
  }
  return false;
}

export function mergeEventInputs(root = {}, live = {}) {
  const out = { ...(root || {}) };
  Object.entries(live || {}).forEach(([evId, slot]) => {
    const outSlot = { ...(out[evId] || {}) };
    const outPerson = { ...(outSlot.person || {}) };
    const livePerson = slot?.person || {};
    Object.entries(livePerson).forEach(([pid, value]) => {
      if (isEmptyEventInputValue(value)) delete outPerson[pid];
      else outPerson[pid] = value;
    });
    outSlot.person = outPerson;
    out[evId] = outSlot;
  });
  return out;
}

export function eventInputDocToNested(data = {}) {
  const evId = String(data?.evId || '');
  const pid = String(data?.pid || '');
  if (!evId || !pid) return null;

  if (Array.isArray(data?.values)) {
    const value = { values: [...data.values] };
    if (data?.bonus !== undefined) value.bonus = data.bonus;
    return { evId, pid, value };
  }

  if (Object.prototype.hasOwnProperty.call(data || {}, 'value')) {
    const raw = data?.value;
    if (raw == null || raw === '') return { evId, pid, value: null };
    return { evId, pid, value: raw };
  }

  return null;
}
