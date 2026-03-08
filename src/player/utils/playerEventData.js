// /src/player/utils/playerEventData.js

const normId = (v) => String(v ?? '').trim();

function mergeParticipantsById(primary = [], legacy = []) {
  const map = new Map();
  const push = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const p of arr) {
      if (!p) continue;
      const id = normId(p.id || p.uid || p.authCode || '');
      const key = id || JSON.stringify(p);
      if (!map.has(key)) map.set(key, p);
      else map.set(key, { ...map.get(key), ...p });
    }
  };
  push(primary);
  push(legacy);
  return Array.from(map.values());
}

export function getEffectiveParticipantsFromEvent(eventData) {
  const data = eventData || {};
  const mode = (data?.mode === 'fourball' || data?.mode === 'agm') ? 'fourball' : 'stroke';
  const field = mode === 'fourball' ? 'participantsFourball' : 'participantsStroke';
  const primary = Array.isArray(data?.[field]) ? data[field] : [];
  const legacy = Array.isArray(data?.participants) ? data.participants : [];
  return primary.length ? mergeParticipantsById(primary, legacy) : legacy;
}

export function mergeEventInputs(base, live) {
  const out = { ...((base && typeof base === 'object') ? base : {}) };
  const src = (live && typeof live === 'object') ? live : {};
  Object.entries(src).forEach(([evId, liveSlot]) => {
    const baseSlot = out[evId] && typeof out[evId] === 'object' ? out[evId] : {};
    const mergedSlot = { ...baseSlot };

    if (liveSlot && typeof liveSlot === 'object') {
      if (liveSlot.person && typeof liveSlot.person === 'object') {
        mergedSlot.person = { ...(baseSlot.person || {}), ...liveSlot.person };
      }
      if (liveSlot.room && typeof liveSlot.room === 'object') {
        mergedSlot.room = { ...(baseSlot.room || {}), ...liveSlot.room };
      }
      if (liveSlot.team && typeof liveSlot.team === 'object') {
        mergedSlot.team = { ...(baseSlot.team || {}), ...liveSlot.team };
      }
    }

    out[evId] = mergedSlot;
  });
  return out;
}

export function buildLiveEventInputsMapFromDocs(docs = []) {
  const out = {};
  for (const raw of docs) {
    const v = raw || {};
    const evId = String(v.evId || '').trim();
    if (!evId) continue;
    const slot = { ...(out[evId] || {}) };

    if (v.pid != null) {
      const pid = String(v.pid).trim();
      if (pid) {
        const person = { ...(slot.person || {}) };
        if (Array.isArray(v.values)) {
          const obj = { values: [...v.values] };
          if (v.bonus !== undefined) obj.bonus = v.bonus;
          person[pid] = obj;
        } else if (v.value !== undefined && v.value !== null && v.value !== '') {
          person[pid] = v.value;
        } else {
          delete person[pid];
        }
        slot.person = person;
      }
    }

    if (v.room != null && v.value !== undefined && v.pid == null) {
      const room = { ...(slot.room || {}) };
      room[String(v.room)] = v.value;
      slot.room = room;
    }

    if (v.team != null && v.value !== undefined && v.pid == null) {
      const team = { ...(slot.team || {}) };
      team[String(v.team)] = v.value;
      slot.team = team;
    }

    out[evId] = slot;
  }
  return out;
}
