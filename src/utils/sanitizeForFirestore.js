// src/utils/sanitizeForFirestore.js
// - Firestore 저장 전 undefined 제거 + NaN -> null
// - FieldValue(serverTimestamp 등) / Date / Timestamp / DocumentReference 같은 "비-Plain Object"는 그대로 유지

const isPlainObject = (v) => {
  if (!v || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

export function sanitizeForFirestore(v) {
  if (Array.isArray(v)) {
    return v.map(sanitizeForFirestore).filter((x) => x !== undefined);
  }

  // Firestore FieldValue / Timestamp / Date / DocumentReference 등은 그대로 통과
  if (v && typeof v === 'object' && !isPlainObject(v)) {
    return v;
  }

  if (isPlainObject(v)) {
    const out = {};
    for (const k of Object.keys(v)) {
      const val = v[k];
      if (val === undefined) continue;
      if (typeof val === 'number' && Number.isNaN(val)) {
        out[k] = null;
        continue;
      }
      out[k] = sanitizeForFirestore(val);
    }
    return out;
  }

  if (typeof v === 'number' && Number.isNaN(v)) return null;
  return v;
}
