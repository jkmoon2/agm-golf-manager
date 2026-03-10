// /src/utils/crossTabEventSync.js

const CHANNEL_NAME = 'agm:event-sync';

function safeJsonParse(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function safeEventId(v) {
  const s = String(v || '').trim();
  return s || '';
}

export function eventSyncStorageKey(eventId) {
  return `agm:event-sync:${safeEventId(eventId)}`;
}

export function broadcastEventSync(eventId, partial = {}) {
  const id = safeEventId(eventId);
  if (!id) return;
  const payload = { eventId: id, ts: Date.now(), ...(partial || {}) };
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(CHANNEL_NAME);
      bc.postMessage(payload);
      bc.close();
    }
  } catch {}
  try {
    localStorage.setItem(eventSyncStorageKey(id), JSON.stringify(payload));
  } catch {}
}

export function subscribeEventSync(eventId, handler) {
  const id = safeEventId(eventId);
  if (!id || typeof handler !== 'function') return () => {};

  let bc = null;
  const onMessage = (payload) => {
    if (!payload || safeEventId(payload.eventId) !== id) return;
    try { handler(payload); } catch {}
  };

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = (ev) => onMessage(ev?.data);
    }
  } catch {}

  const onStorage = (ev) => {
    if (ev?.key !== eventSyncStorageKey(id)) return;
    onMessage(safeJsonParse(ev?.newValue));
  };

  try { window.addEventListener('storage', onStorage); } catch {}

  return () => {
    try { window.removeEventListener('storage', onStorage); } catch {}
    try { if (bc) bc.close(); } catch {}
  };
}
