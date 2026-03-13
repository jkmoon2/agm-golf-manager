// /src/player/screens/PlayerEventInput.jsx

import React, { useMemo, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import baseCss from './PlayerRoomTable.module.css';
import tCss   from './PlayerEventInput.module.css';
import { EventContext } from '../../contexts/EventContext';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { computeHoleRankForce, normalizeForcedRanks, normalizeSelectedHoles } from '../../events/holeRankForce';
import { getParticipantGroupNo, getPickLineupConfig, getPickLineupRequiredCount, normalizeMemberIds } from '../../events/pickLineup';


function getPlayerTabId(){
  try {
    if (!window.name || !window.name.startsWith('AGM_PLAYER_TAB_')) {
      window.name = `AGM_PLAYER_TAB_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    }
    return window.name;
  } catch {
    return 'AGM_PLAYER_TAB_FALLBACK';
  }
}
function playerStorageKey(eventId, key){
  return `agm:player:${getPlayerTabId()}:${eventId || 'noevent'}:${key}`;
}

const LONG_PRESS_MS = 450;


const FORCED_PREVIEW_LAYOUT = 'balanced'; // 'tight' | 'balanced' | 'roomy'

function getForcedPreviewPresetClass(styles){
  if (FORCED_PREVIEW_LAYOUT === 'tight') return styles.viewerPresetTight;
  if (FORCED_PREVIEW_LAYOUT === 'roomy') return styles.viewerPresetRoomy;
  return styles.viewerPresetBalanced;
}


function formatDisplayNumber(value){
  if (value === '' || value == null) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const s = n.toFixed(2);
  return s.replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');
}

function displayPickOption(p){
  return String(p?.nickname || '');
}


function estimatePickTextUnits(text = ''){
  return Array.from(String(text || '')).reduce((sum, ch) => {
    return sum + (/[^\u0000-\u00ff]/.test(ch) ? 1.85 : 1);
  }, 0);
}

const PICK_MENU_WIDTH_PX = 150;

function getPickMenuWidthPx(){
  return PICK_MENU_WIDTH_PX;
}

function getPickPreviewLineText(cells = []){
  return (Array.isArray(cells) ? cells : []).map((v) => String(v || '').trim()).filter(Boolean).join(' / ');
}

function getPickPreviewLineClass(styles, text = '', isJo = false){
  const len = String(text || '').length;
  if (len >= (isJo ? 25 : 28)) return styles.pickPreviewTeamXs;
  if (len >= (isJo ? 18 : 22)) return styles.pickPreviewTeamSm;
  return styles.pickPreviewTeamMd;
}

function getEffectiveParticipants(eventData){
  const safeArr = (v) => (Array.isArray(v) ? v : []);
  const mode = (eventData?.mode === 'fourball' || eventData?.mode === 'agm') ? 'fourball' : 'stroke';
  const field = (mode === 'fourball') ? 'participantsFourball' : 'participantsStroke';
  const primary = safeArr(eventData?.[field]);
  const legacy = safeArr(eventData?.participants);
  if (!primary.length) {
    return legacy.map((p, i) => {
      const obj = (p && typeof p === 'object') ? p : {};
      const room = (obj?.room ?? obj?.roomNumber ?? null);
      return { ...obj, id: obj?.id ?? i, room, roomNumber: room };
    });
  }
  const map = new Map();
  legacy.forEach((p, i) => {
    const obj = (p && typeof p === 'object') ? p : {};
    const id = String(obj?.id ?? i);
    map.set(id, { ...(map.get(id) || {}), ...obj });
  });
  primary.forEach((p, i) => {
    const obj = (p && typeof p === 'object') ? p : {};
    const id = String(obj?.id ?? i);
    map.set(id, { ...(map.get(id) || {}), ...obj });
  });
  return Array.from(map.values()).map((p, i) => {
    const obj = (p && typeof p === 'object') ? p : {};
    const room = (obj?.room ?? obj?.roomNumber ?? null);
    return { ...obj, id: obj?.id ?? i, room, roomNumber: room };
  });
}

function normalizeGate(raw){
  if (!raw || typeof raw !== 'object') return { steps:{}, step1:{ teamConfirmEnabled:true } };
  const g = { ...raw };
  const steps = g.steps || {};
  const out = { steps:{}, step1:{ ...(g.step1 || {}) } };
  for (let i=1;i<=8;i+=1) out.steps[i] = steps[i] || 'enabled';
  if (typeof out.step1.teamConfirmEnabled !== 'boolean') out.step1.teamConfirmEnabled = true;
  return out;
}
function pickGateByMode(playerGate, mode){
  const isFour = (mode === 'fourball' || mode === 'agm');
  const nested = isFour ? playerGate?.fourball : playerGate?.stroke;
  const base = nested && typeof nested === 'object' ? nested : playerGate;
  return normalizeGate(base);
}
function tsToMillis(ts){
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1e6;
  return Number(ts) || 0;
}

function readRoomFromLocal(eventId){
  try {
    const v = localStorage.getItem(playerStorageKey(eventId, 'currentRoom'));
    const n = Number(v);
    if (Number.isFinite(n) && n >= 1) return n;
  } catch {}
  return NaN;
}

const MAX_PER_ROOM = 4;

function orderSlotsByPairs(roomArr = [], allParticipants = []) {
  const N    = Array.isArray(allParticipants) ? allParticipants.length : 0;
  const half = Math.floor(N / 2) || 0;
  const asNum = (v) => Number(v ?? NaN);

  const slot = [null, null, null, null];
  const used = new Set();

  const pairs = [];
  roomArr
    .filter((p) => Number.isFinite(asNum(p?.id)) && asNum(p.id) < half)
    .forEach((p1) => {
      const id1 = asNum(p1.id);
      if (used.has(id1)) return;
      const partner = roomArr.find(
        (x) => Number.isFinite(asNum(x?.id)) && asNum(x.id) === asNum(p1.partner)
      );
      if (partner && !used.has(asNum(partner.id))) {
        pairs.push([p1, partner]);
        used.add(id1); used.add(asNum(partner.id));
      }
    });

  pairs.forEach((pair, idx) => {
    if (idx === 0) { slot[0] = pair[0]; slot[1] = pair[1]; }
    else if (idx === 1) { slot[2] = pair[0]; slot[3] = pair[1]; }
  });

  roomArr.forEach((p) => {
    const pid = asNum(p?.id);
    if (!used.has(pid)) {
      const empty = slot.findIndex((x) => x === null);
      if (empty >= 0) { slot[empty] = p; used.add(pid); }
    }
  });

  while (slot.length < MAX_PER_ROOM) slot.push(null);
  return slot.slice(0, MAX_PER_ROOM);
}

function inferRoomFromSelf(participants = [], eventData = {}) {
  const ids = [
    eventData?.auth?.uid, eventData?.player?.uid, eventData?.me?.uid,
    eventData?.auth?.id,  eventData?.player?.id,  eventData?.me?.id,
  ].filter(Boolean);

  for (const p of participants) {
    if (ids.includes(p?.uid) || ids.includes(p?.id)) {
      const r = Number(p?.room);
      if (Number.isFinite(r) && r >= 1) return r;
    }
  }

  const myNick = (eventData?.auth?.nickname || eventData?.player?.nickname || eventData?.me?.nickname || '').trim().toLowerCase();
  if (myNick) {
    for (const p of participants) {
      const pn = String(p?.nickname || '').trim().toLowerCase();
      if (pn && pn === myNick) {
        const r = Number(p?.room);
        if (Number.isFinite(r) && r >= 1) return r;
      }
    }
  }

  return NaN;
}

async function ensureMembership(eventId, myRoom) {
  try {
    const uid = auth?.currentUser?.uid || null;
    if (!uid || !eventId || !myRoom) return;
    const ref = doc(db, 'events', eventId, 'memberships', uid);
    await setDoc(ref, { room: myRoom }, { merge: true });
  } catch (e) {
    console.warn('ensureMembership failed', e);
  }
}

export default function PlayerEventInput(){
  const nav = useNavigate();
  const { eventId } = useParams();
  const { eventId: ctxId, loadEvent, eventData, updateEventImmediate } = useContext(EventContext) || {};

  const [fallbackGate, setFallbackGate] = useState(null);
  const [fallbackAt, setFallbackAt] = useState(0);
  const [pickMenuState, setPickMenuState] = useState(null);
  const pickButtonRefs = useRef({});
  useEffect(() => {
    const id = eventId || ctxId;
    if (!id) return;
    const ref = doc(db, 'events', id);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      if (d?.playerGate) {
        setFallbackGate(d.playerGate);
        setFallbackAt(tsToMillis(d?.gateUpdatedAt));
      }
    });
    return unsub;
  }, [eventId, ctxId]);

  const latestGate = useMemo(() => {
    const mode = (eventData?.mode === 'fourball' ? 'fourball' : 'stroke');
    const ctxG = pickGateByMode(eventData?.playerGate || {}, mode);
    const ctxAt = tsToMillis(eventData?.gateUpdatedAt);
    const fbG  = pickGateByMode(fallbackGate || {}, mode);
    const fbAt = fallbackAt;
    return (ctxAt >= fbAt) ? ctxG : fbG;
  }, [eventData?.playerGate, eventData?.gateUpdatedAt, eventData?.mode, fallbackGate, fallbackAt]);

  const nextDisabled = useMemo(() => (latestGate?.steps?.[4] !== 'enabled'), [latestGate]);

  useEffect(() => {
    if (!pickMenuState) return undefined;
    const closeMenu = () => setPickMenuState(null);
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.overscrollBehavior = 'contain';
    window.addEventListener('resize', closeMenu);
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      document.body.style.overscrollBehavior = prevOverscroll;
      window.removeEventListener('resize', closeMenu);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pickMenuState]);

  useEffect(()=>{ if(eventId && eventId!==ctxId && typeof loadEvent==='function'){ loadEvent(eventId); } },[eventId,ctxId,loadEvent]);

  const participants = useMemo(
    () => getEffectiveParticipants(eventData),
    [eventData?.mode, eventData?.participants, eventData?.participantsStroke, eventData?.participantsFourball]
  );
  const events = useMemo(
    () => Array.isArray(eventData?.events) ? eventData.events.filter(e => e?.enabled !== false && e?.template !== 'group-battle') : [],
    [eventData]
  );

  const roomNames = useMemo(() => {
    if (Array.isArray(eventData?.roomNames) && eventData.roomNames.length) {
      return eventData.roomNames.map(v => String(v ?? ''));
    }
    const cnt = Number(eventData?.roomCount || 0);
    return Number.isFinite(cnt) && cnt > 0
      ? Array.from({ length: cnt }, (_, i) => `${i + 1}번방`)
      : [];
  }, [eventData]);

  const allRoomNos = useMemo(() => {
    const s = new Set();
    participants.forEach(p => { const r = Number(p?.room); if (Number.isFinite(r) && r >= 1) s.add(r); });
    return Array.from(s).sort((a,b)=>a-b);
  }, [participants]);

  const roomFromCtx = useMemo(() => {
    const cands = [ eventData?.myRoom, eventData?.player?.room, eventData?.auth?.room, eventData?.currentRoom ];
    return cands.map(Number).find(n => Number.isFinite(n) && n >= 1);
  }, [eventData]);

  const roomFromSelf = useMemo(
    () => inferRoomFromSelf(participants, eventData),
    [participants, eventData]
  );

  const roomIdx = useMemo(() => {
    const ls  = readRoomFromLocal(eventId);
    const pick = [roomFromCtx, ls, roomFromSelf].find(
      n => Number.isFinite(n) && allRoomNos.includes(n)
    );
    return pick || allRoomNos[0] || 1;
  }, [roomFromCtx, roomFromSelf, eventId, allRoomNos]);

  useEffect(() => {
    if (Number.isFinite(roomIdx) && roomIdx >= 1) {
      try { localStorage.setItem(playerStorageKey(eventId, 'currentRoom'), String(roomIdx)); } catch {}
    }
  }, [roomIdx, eventId]);

  const openPickMenuAt = (evId, pid, idx, options = [], buttonEl = null) => {
    const rect = buttonEl?.getBoundingClientRect?.();
    const menuWidth = getPickMenuWidthPx(options);
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 640;
    const estimatedHeight = Math.min(Math.max((Array.isArray(options) ? options.length : 0) + 1, 4) * 40 + 16, Math.min(viewportHeight * 0.52, 320));
    const left = rect
      ? Math.max(8, Math.min(rect.left + (rect.width / 2) - (menuWidth / 2), viewportWidth - menuWidth - 8))
      : 12;
    let top = 56;
    if (rect) {
      const belowTop = rect.bottom + 6;
      const belowSpace = viewportHeight - belowTop - 8;
      if (belowSpace >= Math.min(estimatedHeight, 180)) {
        top = belowTop;
      } else {
        top = Math.max(8, rect.top - estimatedHeight - 6);
      }
    }
    setPickMenuState({ evId, pid, idx, left, top, width: menuWidth });
  };

  const roomMembers = useMemo(() => {
    const inRoom = participants.filter(p => Number(p?.room) === roomIdx);
    return orderSlotsByPairs(inRoom, participants);
  }, [participants, roomIdx]);

  const inputsByEventServer = eventData?.eventInputs || {};

  const [draft, setDraft] = useState(() => inputsByEventServer ? JSON.parse(JSON.stringify(inputsByEventServer)) : {});
  const [dirty, setDirty] = useState(false);
  const eventInputRefs = useRef({});
  const longPressTimersRef = useRef({});

  const focusEventInput = (evId, pid, idx) => {
    try {
      const key = `${evId}:${pid}:${idx}`;
      const el = eventInputRefs.current?.[key];
      if (el && typeof el.focus === 'function') el.focus();
    } catch {}
  };

  const cancelEventLongPress = (key) => {
    const timer = longPressTimersRef.current?.[key];
    if (timer) clearTimeout(timer);
    if (longPressTimersRef.current) delete longPressTimersRef.current[key];
  };

  const startEventLongMinus = (evId, pid, idx, rawValue, attemptsOverride) => {
    const key = `${evId}:${pid}:${idx}`;
    cancelEventLongPress(key);
    longPressTimersRef.current[key] = setTimeout(() => {
      const current = String(rawValue ?? '').trim();
      const next = current === '' ? '-' : (current.startsWith('-') ? current : `-${current}`);
      patchAccum(evId, pid, idx, next, attemptsOverride);
      setTimeout(() => focusEventInput(evId, pid, idx), 0);
    }, LONG_PRESS_MS);
  };

  useEffect(() => {
    if (!dirty) setDraft(inputsByEventServer ? JSON.parse(JSON.stringify(inputsByEventServer)) : {});
  }, [inputsByEventServer, dirty]);

  const inputsByEvent = draft || {};

  const getServerSingle = (evId, pid) => {
    const v = inputsByEventServer?.[evId]?.person?.[pid];
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const getServerAccum = (evId, pid, attempts) => {
    const arr = inputsByEventServer?.[evId]?.person?.[pid]?.values;
    const base = Array.isArray(arr) ? [...arr] : [];
    while (base.length < attempts) base.push('');
    return base.map((x) => {
      if (x === '' || x == null) return '';
      const n = Number(x);
      return Number.isFinite(n) ? String(n) : '';
    });
  };

  const padPickIds = (arr, count) => {
    const need = Math.max(1, Number(count || 1));
    const base = Array.isArray(arr) ? [...arr] : [];
    while (base.length < need) base.push('');
    return base.slice(0, need).map((x) => String(x || ''));
  };

  const getServerPickIds = (evId, pid, requiredCount) => {
    const arr = normalizeMemberIds(inputsByEventServer?.[evId]?.person?.[pid]);
    return padPickIds(arr, requiredCount);
  };

  const patchValue = (evId, pid, value) => {
    const all  = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    const prev = String(person[pid] ?? '');
    const next = String(value ?? '');
    if (prev === next) return;
    person[pid] = next;
    slot.person = person; all[evId] = slot;
    setDraft(all);
  };

  const patchAccum = (evId, pid, idx, value, attemptsOverride) => {
    const all  = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    const obj = person[pid] && typeof person[pid]==='object' && Array.isArray(person[pid].values)
      ? { ...person[pid], values:[...person[pid].values] } : { values:[] };
    const atts = Number.isFinite(Number(attemptsOverride)) ? Number(attemptsOverride) : (idx+1);
    while (obj.values.length < atts) obj.values.push('');
    const prev = String(obj.values[idx] ?? '');
    const next = String(value ?? '');
    if (prev === next) return;
    obj.values[idx] = next;
    person[pid]=obj; slot.person=person; all[evId]=slot;
    setDraft(all);
  };

  const patchPickMember = (evId, pid, idx, value, requiredCount) => {
    const all  = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    const prevObj = person[pid] && typeof person[pid] === 'object' ? { ...person[pid] } : {};
    const arr = padPickIds(normalizeMemberIds(prevObj), requiredCount);
    const next = String(value || '');
    if (arr[idx] === next) return;

    if (next) {
      for (let i = 0; i < arr.length; i += 1) {
        if (i !== idx && arr[i] === next) arr[i] = '';
      }
    }
    arr[idx] = next;

    if (!arr.some(Boolean)) {
      person[pid] = { memberIds: [] };
    } else {
      person[pid] = { ...prevObj, memberIds: arr };
    }

    slot.person = person; all[evId] = slot;
    setDraft(all);
  };

  const finalizeValue = (evId, pid, raw) => {
    const v = String(raw ?? '').trim();
    const num = v === '' ? NaN : Number(v);

    const all  = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };

    if (!v || Number.isNaN(num)) delete person[pid];
    else person[pid] = num;

    slot.person = person; all[evId] = slot;
    setDraft(all);
  };
  const finalizeAccum = (evId, pid, idx, raw, attemptsOverride) => {
    const v = String(raw ?? '').trim();
    const num = v === '' ? NaN : Number(v);

    const all  = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    const obj = person[pid] && typeof person[pid]==='object' && Array.isArray(person[pid].values)
      ? { ...person[pid], values:[...person[pid].values] } : { values:[] };
    const atts = Number.isFinite(Number(attemptsOverride)) ? Number(attemptsOverride) : (idx+1);
    while (obj.values.length < atts) obj.values.push('');

    obj.values[idx] = Number.isNaN(num) ? '' : num;
    if (!obj.values.some(s => String(s).trim() !== '')) delete person[pid];
    else person[pid] = obj;

    slot.person = person; all[evId] = slot;
    setDraft(all);
  };

  const patchBonus = (evId, pid, idxOrVal, value, isAccum, attemptsOverride) => {
    const all = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    const obj = person[pid] && typeof person[pid]==='object'
      ? { ...person[pid] } : {};
    if (isAccum) {
      const arr = Array.isArray(obj.bonus) ? [...obj.bonus] : [];
      const atts = Number.isFinite(Number(attemptsOverride)) ? Number(attemptsOverride) : (Number(idxOrVal)+1);
      while (arr.length < atts) arr.push('');
      const prev = String(arr[idxOrVal] ?? '');
      const next = String(value ?? '');
      if (prev !== next) {
        arr[idxOrVal] = next;
        obj.bonus = arr;
      }
    } else {
      const prev = String(obj.bonus ?? '');
      const next = String(value ?? '');
      if (prev !== next) obj.bonus = next;
    }
    person[pid] = obj; slot.person = person; all[evId] = slot;
    setDraft(all);
  };

  const calcPopupWidth = (evId) => {
    try {
      const ev = events.find(e => e.id === evId);
      const opts = (ev && ev.template === 'range-convert-bonus' && Array.isArray(ev.params?.bonus))
        ? ev.params.bonus : [];
      const labels = [
        ...opts.map(b => `${b.label}${b.score != null ? ` (+${b.score})` : ''}`),
        '선택 해제',
      ];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      const textW = Math.max(...labels.map(s => ctx.measureText(String(s)).width || 0));
      const PADDING_X = 16;
      const SHADOW_BORDER = 8;
      const W = Math.ceil(textW + PADDING_X + SHADOW_BORDER);
      return Math.min(Math.max(W, 90), 168);
    } catch {
      return 136;
    }
  };

  const [bonusPopup, setBonusPopup] = useState({ open:false, x:0, y:0, evId:null, pid:null, idx:0, attempts:0, w:136 });
  const openBonusPopup = (evId, pid, idx, attempts, e) => {
    e.stopPropagation();
    const w  = calcPopupWidth(evId);
    const r  = e.currentTarget.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 360;
    const GAP = 8;
    let x = r.left + r.width / 2;
    const half = w / 2;
    if (x + half + GAP > vw) x = vw - (half + GAP);
    if (x - half - GAP < 0)  x = half + GAP;
    const y = r.bottom + 6;
    setBonusPopup({ open:true, x, y, evId, pid, idx, attempts, w });
  };
  const closeBonusPopup = () => setBonusPopup({ open:false, x:0, y:0, evId:null, pid:null, idx:0, attempts:0, w:136 });
  useEffect(()=>{ const onDoc=()=>setBonusPopup(p=>(p.open?{...p,open:false}:p)); document.addEventListener('click',onDoc); return()=>document.removeEventListener('click',onDoc); },[]);

  const sortedParticipants = useMemo(() => {
    const arr = Array.isArray(participants) ? [...participants] : [];
    arr.sort((a, b) => {
      const roomDiff = (Number(a?.room ?? 999) - Number(b?.room ?? 999));
      if (roomDiff) return roomDiff;
      const groupDiff = (Number(getParticipantGroupNo(a) || 999) - Number(getParticipantGroupNo(b) || 999));
      if (groupDiff) return groupDiff;
      return String(a?.nickname || '').localeCompare(String(b?.nickname || ''), 'ko');
    });
    return arr;
  }, [participants]);

  const participantById = useMemo(() => {
    return new Map(sortedParticipants.map((p) => [String(p?.id), p]));
  }, [sortedParticipants]);

  const getPickOptions = (ev, slotIdx) => {
    const cfg = getPickLineupConfig(ev);
    if (cfg.mode === 'jo') {
      const groupNo = cfg.openGroups[slotIdx];
      return sortedParticipants.filter((p) => Number(getParticipantGroupNo(p)) === Number(groupNo));
    }
    return sortedParticipants;
  };

  const saveDraft = async () => {
    try{
      await ensureMembership((eventId || ctxId), roomIdx);

      const base = inputsByEventServer || {};
      const src  = draft || {};
      const roomPids = new Set(roomMembers.filter(Boolean).map(p=>String(p.id)));
      const merged = { ...base };

      Object.entries(src).forEach(([evId, slot])=>{
        const sPerson = slot?.person || {};
        if (!merged[evId]) merged[evId] = {};
        const mSlot = { ...(merged[evId]||{}) };
        const mPerson = { ...(mSlot.person||{}) };

        Object.entries(sPerson).forEach(([pid, val])=>{
          if (!roomPids.has(String(pid))) return;
          const isEmptyPick = typeof val === 'object' && val && Array.isArray(val.memberIds) && !val.memberIds.some(Boolean);
          if (val === '' || val == null || isEmptyPick || (typeof val==='object' && !Array.isArray(val.values) && !Object.keys(val).length)) {
            delete mPerson[pid];
          } else {
            mPerson[pid] = val;
          }
        });

        mSlot.person = mPerson;
        merged[evId] = mSlot;
      });


      if (typeof updateEventImmediate === 'function') {
        await updateEventImmediate({ eventInputs: merged }, false);
      } else {
        await setDoc(doc(db, 'events', eventId || ctxId), { eventInputs: merged }, { merge: true });
      }

      setDraft(merged ? JSON.parse(JSON.stringify(merged)) : {});
      setDirty(false);
      alert('저장되었습니다.');
    }catch(e){
      console.error('saveDraft error', e);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  useEffect(() => {
    const roomPids = new Set(roomMembers.filter(Boolean).map(p => String(p.id)));

    const eq = (a, b) => a === b;
    const toNumOrNull = (x) => {
      if (x === '' || x == null) return null;
      const n = Number(x);
      return Number.isFinite(n) ? n : null;
    };

    const hasDiff = () => {
      for (const ev of events) {
        const evId = ev.id;
        const isAccum = ev.inputMode === 'accumulate';
        const attempts = Math.max(2, Math.min(Number(ev.attempts || 4), 20));

        const dSlot = draft?.[evId]?.person || {};
        const sSlot = inputsByEventServer?.[evId]?.person || {};

        for (const pid of roomPids) {
          if (ev.template === 'pick-lineup') {
            const requiredCount = getPickLineupRequiredCount(ev);
            const baseArr = getServerPickIds(evId, pid, requiredCount);
            const dArr = padPickIds(normalizeMemberIds(dSlot?.[pid]), requiredCount);
            if (dArr.length !== baseArr.length) return true;
            for (let i = 0; i < dArr.length; i += 1) {
              if (!eq(dArr[i], baseArr[i])) return true;
            }
          } else if (isAccum) {
            const baseArr = getServerAccum(evId, pid, attempts);
            const dVals = (() => {
              const v = dSlot?.[pid]?.values;
              const arr = Array.isArray(v) ? [...v] : [];
              while (arr.length < attempts) arr.push('');
              return arr.map((x) => {
                if (x === '' || x == null) return '';
                const n = Number(x);
                return Number.isFinite(n) ? String(n) : '';
              });
            })();

            if (dVals.length !== baseArr.length) return true;
            for (let i = 0; i < dVals.length; i += 1) {
              if (!eq(dVals[i], baseArr[i])) return true;
            }
          } else {
            const sNum = getServerSingle(evId, pid);
            const dRaw = dSlot?.[pid];
            const dNum = toNumOrNull(dRaw);
            if (!eq(sNum ?? null, dNum ?? null)) return true;
          }
        }
      }
      return false;
    };

    setDirty(hasDiff());
  }, [draft, inputsByEventServer, roomMembers, events]);

  return (
    <div className={baseCss.page}>
      <div className={baseCss.content}>

        {events.map(ev => {
          const isHoleRankForce = ev.template === 'hole-rank-force';
          const selectedHoles = isHoleRankForce ? normalizeSelectedHoles(ev?.params?.selectedHoles) : [];
          const forcedRanks = isHoleRankForce ? normalizeForcedRanks(ev?.params?.forcedRanks) : {};
          const hasForcedViewer = isHoleRankForce && Object.keys(forcedRanks || {}).length > 0;
          const isAccum  = isHoleRankForce ? true : (ev.inputMode === 'accumulate');
          const attempts = isHoleRankForce ? selectedHoles.length : Math.max(2, Math.min(Number(ev.attempts || 4), 20));
          const NICK_PCT = 35;
          const ONE_PCT  = isHoleRankForce ? Math.max(10, 53 / Math.max(selectedHoles.length || 1, 1)) : (65 / 4);
          const TOTAL_PCT = isHoleRankForce ? 12 : 0;
          const tableWidthPct = isAccum ? (NICK_PCT + attempts * ONE_PCT + TOTAL_PCT) : 100;
          const bonusOpts = (ev.template === 'range-convert-bonus' && Array.isArray(ev.params?.bonus)) ? ev.params.bonus : [];
          const pickCfg = ev.template === 'pick-lineup' ? getPickLineupConfig(ev) : null;
          const orderedRoomRows = orderSlotsByPairs(
            participants.filter((p) => Number(p?.room) === (Number.isFinite(roomIdx) ? roomIdx : NaN)),
            participants
          );

          const rawSubtotal = isHoleRankForce
            ? selectedHoles.map((holeNo) => {
                let sum = 0;
                let hasAny = false;
                orderedRoomRows.forEach((p) => {
                  const raw = p ? (inputsByEvent?.[ev.id]?.person?.[p.id]?.values?.[holeNo - 1] ?? '') : '';
                  const n = Number(raw);
                  if (Number.isFinite(n)) {
                    sum += n;
                    hasAny = true;
                  }
                });
                return { holeNo, sum, hasAny };
              })
            : [];
          const rawGrandTotal = rawSubtotal.reduce((acc, item) => acc + (Number.isFinite(item.sum) ? item.sum : 0), 0);
          const rawGrandHasAny = rawSubtotal.some((item) => item.hasAny);

          const forcedData = hasForcedViewer
            ? computeHoleRankForce(ev, participants, inputsByEvent, { roomNames })
            : null;
          const forcedRoom = hasForcedViewer
            ? (forcedData?.rooms || []).find((room) => Number(room?.roomNo) === Number(roomIdx))
            : null;
          const forcedSubtotal = forcedRoom
            ? selectedHoles.map((holeNo) => {
                let sum = 0;
                let hasAny = false;
                (forcedRoom?.slots || []).forEach((slot) => {
                  const n = Number(slot?.effectiveHoleScores?.[holeNo]);
                  if (Number.isFinite(n)) {
                    sum += n;
                    hasAny = true;
                  }
                });
                return { holeNo, sum, hasAny };
              })
            : [];
          const forcedGrandTotal = forcedSubtotal.reduce((acc, item) => acc + (Number.isFinite(item.sum) ? item.sum : 0), 0);
          const forcedGrandHasAny = forcedSubtotal.some((item) => item.hasAny);

          if (pickCfg) {
            const requiredCount = getPickLineupRequiredCount(ev);
            const slotLabels = pickCfg.mode === 'jo'
              ? pickCfg.openGroups.map((groupNo) => `${groupNo}조`)
              : Array.from({ length: requiredCount }, (_, i) => `선택${i + 1}`);
            const isFourJo = pickCfg.mode === 'jo' && requiredCount === 4;
            const nickColPct = isFourJo ? 20 : 32;
            const pickColPct = (100 - nickColPct) / Math.max(requiredCount, 1);
            const previewNickPct = pickCfg.mode === 'jo' ? 28 : 28;
            const previewTotalPct = pickCfg.mode === 'jo' ? 7 : 8;
            const previewTeamPct = 100 - previewNickPct - previewTotalPct;
            const locked = !!ev?.params?.selectionLocked;
            const previewRows = roomMembers.map((p) => {
              if (!p) return { selectorName: '', cells: slotLabels.map(() => ''), teamLine: '', handicapSum: '', hasAny: false };
              const rowIds = padPickIds(normalizeMemberIds(inputsByEvent?.[ev.id]?.person?.[p.id]), requiredCount);
              const members = rowIds.map((id) => participantById.get(String(id))).filter(Boolean);
              const cells = [members.map((m) => String(m.nickname || '')).filter(Boolean).join(' / ')];
              const handicapSum = members.reduce((sum, m) => {
                const override = Number(ev?.params?.handicapOverrides?.[String(m?.id)]);
                return sum + (Number.isFinite(override) ? override : (Number(m?.handicap ?? 0) || 0));
              }, 0);
              const teamLine = getPickPreviewLineText(cells);
              return {
                selectorName: String(p?.nickname || ''),
                cells,
                teamLine,
                handicapSum: members.length ? handicapSum : '',
                hasAny: members.length > 0,
              };
            });
            const hasPreviewRows = previewRows.some((row) => row.hasAny);

            return (
              <div key={ev.id} className={`${baseCss.card} ${tCss.eventCard}`}>
                <div className={baseCss.cardHeader}>
                  <div className={`${baseCss.cardTitle} ${tCss.eventTitle}`}>{ev.title}</div>
                </div>

                <div style={{ padding: '0 12px 8px', fontSize: 12, color: '#667085', lineHeight: 1.5 }}>
                  {pickCfg.mode === 'jo'
                    ? `오픈 조: ${pickCfg.openGroups.map((g) => `${g}조`).join(', ')}${pickCfg.lastPlaceHalf && pickCfg.openGroups.length === 4 ? ' · 꼴등반띵 적용' : ''}`
                    : `전체 참가자 중 ${pickCfg.pickCount}명 선택`}
                </div>

                {locked && <div className={tCss.lockNotice}>선택이 마감되어 더 이상 수정할 수 없습니다.</div>}

                <div className={`${baseCss.tableWrap} ${tCss.noOverflow}`}>
                  <table className={tCss.table} style={{ width: '100%' }}>
                    <colgroup>
                      <col style={{ width: `${nickColPct}%` }} />
                      {slotLabels.map((_, idx) => <col key={idx} style={{ width: `${pickColPct}%` }} />)}
                    </colgroup>
                    <thead>
                      <tr>
                        <th>닉네임</th>
                        {slotLabels.map((label, idx) => <th key={idx}>{label}</th>)}
                      </tr>
                    </thead>

                    <tbody>
                      {roomMembers.map((p, rIdx) => {
                        const rowIds = p
                          ? padPickIds(normalizeMemberIds(inputsByEvent?.[ev.id]?.person?.[p.id]), requiredCount)
                          : padPickIds([], requiredCount);

                        return (
                          <tr key={rIdx}>
                            <td style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', padding:'0 4px' }}>{p ? p.nickname : ''}</td>
                            {slotLabels.map((_, idx) => {
                              const options = getPickOptions(ev, idx);
                              const selectedId = p ? (rowIds[idx] || '') : '';
                              const selectedOpt = options.find((opt) => String(opt?.id) === String(selectedId));
                              const buttonText = selectedOpt ? displayPickOption(selectedOpt) : '선택';
                              return (
                                <td key={idx} className={tCss.cellEditable}>
                                  <div className={tCss.pickMenuHolder} onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      className={`${tCss.pickSelectButton} ${isFourJo ? tCss.pickSelectButtonCompact : ''}`}
                                      ref={(el) => {
                                        const key = `${ev.id}:${p?.id || 'blank'}:${idx}`;
                                        if (el) pickButtonRefs.current[key] = el;
                                        else delete pickButtonRefs.current[key];
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!p || locked) return;
                                        const same = pickMenuState?.evId === ev.id && pickMenuState?.pid === p.id && pickMenuState?.idx === idx;
                                        if (same) {
                                          setPickMenuState(null);
                                          return;
                                        }
                                        openPickMenuAt(ev.id, p.id, idx, options, e.currentTarget);
                                      }}
                                      disabled={!p || locked}
                                      title={buttonText}
                                    >
                                      <span className={tCss.pickSelectText}>{buttonText}</span>
                                    </button>

                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {hasPreviewRows && (
                  <div className={tCss.pickPreviewWrap}>
                    <div className={tCss.pickPreviewTitle}>선택 미리보기</div>
                    <div className={`${baseCss.tableWrap} ${tCss.noOverflow} ${tCss.pickPreviewTableWrap}`}>
                      <table className={tCss.table} style={{ width: '100%' }}>
                        <colgroup>
                          <col style={{ width: `${previewNickPct}%` }} />
                          <col style={{ width: `${previewTeamPct}%` }} />
                          <col style={{ width: `${previewTotalPct}%` }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>닉네임</th>
                            <th>선택팀</th>
                            <th>합계</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, idx) => (
                            <tr key={`pick-preview-${idx}`}>
                              <td className={`${tCss.pickPreviewCell} ${tCss.pickPreviewStrong} ${pickCfg.mode === 'jo' ? tCss.pickPreviewNickWide : tCss.pickPreviewNick}`}>{row.selectorName}</td>
                              <td
                                className={`${tCss.pickPreviewCell} ${getPickPreviewLineClass(tCss, row.teamLine, pickCfg.mode === 'jo')}`}
                                title={row.teamLine}
                              >
                                {row.teamLine}
                              </td>
                              <td className={`${tCss.pickPreviewCell} ${tCss.pickPreviewHandicap}`}>{row.handicapSum !== '' ? row.handicapSum : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={ev.id} className={`${baseCss.card} ${tCss.eventCard}`}>
              <div className={baseCss.cardHeader}>
                <div className={`${baseCss.cardTitle} ${tCss.eventTitle}`}>{ev.title}</div>
              </div>

              <div className={`${baseCss.tableWrap} ${tCss.noOverflow}`}>
                <table className={tCss.table} style={{ width: isAccum ? `${tableWidthPct}%` : '100%' }}>
                  <colgroup>
                    <col style={{ width: `${NICK_PCT}%` }} />
                    {isAccum
                      ? Array.from({ length: attempts }, (_,i) => <col key={i} style={{ width: `${ONE_PCT}%` }} />)
                      : <col style={{ width: '65%' }} />
                    }
                    {isHoleRankForce && <col style={{ width: `${TOTAL_PCT}%` }} />}
                  </colgroup>

                  <thead>
                    <tr>
                      <th>닉네임</th>
                      {isAccum
                        ? (isHoleRankForce
                          ? selectedHoles.map((holeNo) => (<th key={holeNo}>{holeNo}</th>))
                          : Array.from({length: attempts}, (_,i)=>(<th key={i}>{`입력${i+1}`}</th>)))
                        : <th>입력값</th>}
                      {isHoleRankForce && <th>합계</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {orderedRoomRows.map((p, rIdx) => {
                      const rowRawValues = isHoleRankForce
                        ? selectedHoles.map((holeNo) => (p ? (inputsByEvent?.[ev.id]?.person?.[p.id]?.values?.[holeNo - 1] ?? '') : ''))
                        : (isAccum
                          ? Array.from({ length: attempts }, (_, i) => (p ? (inputsByEvent?.[ev.id]?.person?.[p.id]?.values?.[i] ?? '') : ''))
                          : []);
                      const rowValues = rowRawValues.map((raw) => {
                        const n = Number(raw);
                        return Number.isFinite(n) ? n : 0;
                      });
                      const rowHasValue = rowRawValues.some((raw) => String(raw ?? '').trim() !== '');
                      const rowTotal = rowValues.reduce((sum, n) => sum + n, 0);
                      const rowTotalDisplay = p ? (rowHasValue ? formatDisplayNumber(rowTotal) : '') : '';

                      return (
                        <tr key={rIdx}>
                          <td>{p ? p.nickname : ''}</td>

                          {isAccum ? (
                            (isHoleRankForce ? selectedHoles : Array.from({length: attempts}, (_,i)=>i+1)).map((holeOrIdx, cellIdx) => {
                              const valueIndex = isHoleRankForce ? (holeOrIdx - 1) : cellIdx;
                              const cellValue = p ? (inputsByEvent?.[ev.id]?.person?.[p.id]?.values?.[valueIndex] ?? '') : '';
                              const inputKey = `${ev.id}:${p ? p.id : 'empty'}:${valueIndex}`;
                              return (
                                <td
                                  key={holeOrIdx}
                                  className={tCss.cellEditable}
                                  onClick={(e)=>{ if (bonusOpts.length) openBonusPopup(ev.id, p?.id, cellIdx, attempts, e); }}
                                >
                                  <input
                                    ref={(el) => {
                                      if (el) eventInputRefs.current[inputKey] = el;
                                      else delete eventInputRefs.current[inputKey];
                                    }}
                                    type="text"
                                    inputMode="decimal"
                                    pattern={isHoleRankForce ? "[0-9.+\-]*" : "[0-9.]*"}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    className={tCss.cellInput}
                                    value={cellValue}
                                    onChange={e=> p && patchAccum(ev.id, p.id, valueIndex, e.target.value, isHoleRankForce ? 18 : attempts)}
                                    onBlur={e=> p && finalizeAccum(ev.id, p.id, valueIndex, e.target.value, isHoleRankForce ? 18 : attempts)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                    onPointerDown={(e) => {
                                      if (isHoleRankForce && p) {
                                        e.stopPropagation();
                                        startEventLongMinus(ev.id, p.id, valueIndex, cellValue, 18);
                                      }
                                    }}
                                    onPointerUp={() => cancelEventLongPress(inputKey)}
                                    onPointerCancel={() => cancelEventLongPress(inputKey)}
                                    onPointerLeave={() => cancelEventLongPress(inputKey)}
                                    onTouchStart={(e) => {
                                      if (isHoleRankForce && p) {
                                        e.stopPropagation();
                                        startEventLongMinus(ev.id, p.id, valueIndex, cellValue, 18);
                                      }
                                    }}
                                    onTouchEnd={() => cancelEventLongPress(inputKey)}
                                    onTouchCancel={() => cancelEventLongPress(inputKey)}
                                    data-focus-evid={ev.id}
                                    data-focus-pid={p ? p.id : ''}
                                    data-focus-idx={valueIndex}
                                  />
                                </td>
                              );
                            })
                          ) : (
                            <td
                              className={tCss.cellEditable}
                              onClick={(e)=>{ if (bonusOpts.length) openBonusPopup(ev.id, p?.id, 0, 1, e); }}
                            >
                              <input
                                type="text"
                                inputMode="decimal"
                                pattern="[0-9.]*"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                className={tCss.cellInput}
                                value={p ? (inputsByEvent?.[ev.id]?.person?.[p.id] ?? '') : ''}
                                onChange={(e)=> p && patchValue(ev.id, p.id, e.target.value)}
                                onBlur={(e)=> p && finalizeValue(ev.id, p.id, e.target.value)}
                                data-focus-evid={ev.id}
                                data-focus-pid={p ? p.id : ''}
                                data-focus-idx={0}
                              />
                            </td>
                          )}

                          {isHoleRankForce && <td className={tCss.totalCell}>{rowTotalDisplay}</td>}
                        </tr>
                      );
                    })}

                    {isHoleRankForce && (
                      <tr className={tCss.subtotalRow}>
                        <td className={tCss.subtotalLabel}>소계</td>
                        {rawSubtotal.map((item) => (
                          <td key={`raw-sub-${item.holeNo}`} className={tCss.subtotalBlue}>
                            {item.hasAny ? formatDisplayNumber(item.sum) : ''}
                          </td>
                        ))}
                        <td className={tCss.subtotalRed}>
                          {rawGrandHasAny ? formatDisplayNumber(rawGrandTotal) : ''}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {hasForcedViewer && forcedRoom && (
                <div className={`${tCss.viewerWrap} ${getForcedPreviewPresetClass(tCss)}`}>
                  <div className={tCss.viewerTitle}>환산 적용 미리보기</div>
                  <div className={`${baseCss.tableWrap} ${tCss.noOverflow} ${tCss.viewerTableWrap}`}>
                    <table className={tCss.table} style={{ width: `${tableWidthPct}%` }}>
                      <colgroup>
                        <col style={{ width: `${NICK_PCT}%` }} />
                        {Array.from({ length: attempts }, (_,i) => <col key={i} style={{ width: `${ONE_PCT}%` }} />)}
                        <col style={{ width: `${TOTAL_PCT}%` }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>닉네임</th>
                          {selectedHoles.map((holeNo) => (<th key={`viewer-head-${holeNo}`}>{holeNo}</th>))}
                          <th>합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderedRoomRows.map((p, rIdx) => {
                          const forcedSlot = p ? (forcedRoom?.slots || []).find((slot) => String(slot?.participantId ?? '') === String(p.id)) : null;
                          const viewerRawValues = selectedHoles.map((holeNo) => forcedSlot?.effectiveHoleScores?.[holeNo]);
                          const viewerHasValue = viewerRawValues.some((value) => Number.isFinite(Number(value)));
                          const viewerTotal = Number(forcedSlot?.total);
                          return (
                            <tr key={`viewer-${rIdx}`}>
                              <td>{p ? p.nickname : ''}</td>
                              {selectedHoles.map((holeNo) => {
                                const value = forcedSlot?.effectiveHoleScores?.[holeNo];
                                return (
                                  <td key={`viewer-${rIdx}-${holeNo}`}>
                                    {formatDisplayNumber(value)}
                                  </td>
                                );
                              })}
                              <td className={tCss.totalCell}>
                                {viewerHasValue && Number.isFinite(viewerTotal) ? formatDisplayNumber(viewerTotal) : ''}
                              </td>
                            </tr>
                          );
                        })}

                        <tr className={tCss.subtotalRow}>
                          <td className={tCss.subtotalLabel}>소계</td>
                          {forcedSubtotal.map((item) => (
                            <td key={`forced-sub-${item.holeNo}`} className={tCss.subtotalBlue}>
                              {item.hasAny ? formatDisplayNumber(item.sum) : ''}
                            </td>
                          ))}
                          <td className={tCss.subtotalRed}>
                            {forcedGrandHasAny ? formatDisplayNumber(forcedGrandTotal) : ''}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}


        {pickMenuState && (() => {
          const activeEvent = events.find((item) => item.id === pickMenuState.evId);
          const requiredCount = getPickLineupRequiredCount(activeEvent);
          const selector = roomMembers.find((item) => String(item?.id) === String(pickMenuState.pid));
          const rowIds = selector
            ? padPickIds(normalizeMemberIds(inputsByEvent?.[pickMenuState.evId]?.person?.[selector.id]), requiredCount)
            : padPickIds([], requiredCount);
          const options = activeEvent ? getPickOptions(activeEvent, pickMenuState.idx) : [];
          const selectedId = selector ? (rowIds[pickMenuState.idx] || '') : '';
          const portalNode = typeof document !== 'undefined' ? document.body : null;
          if (!portalNode || !activeEvent || !selector) return null;

          return createPortal(
            <div
              className={tCss.pickMenuOverlay}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) {
                  e.stopPropagation();
                  setPickMenuState(null);
                }
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
              }}
            >
              <div
                className={tCss.pickMenu}
                style={{ left: pickMenuState.left, top: pickMenuState.top, width: pickMenuState.width, position:'fixed' }}
                onPointerDown={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className={`${tCss.pickMenuOption} ${!selectedId ? tCss.pickMenuOptionActive : ''}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    patchPickMember(activeEvent.id, selector.id, pickMenuState.idx, '', requiredCount);
                    setPickMenuState(null);
                  }}
                >
                  선택 해제
                </button>
                {options.map((opt) => {
                  const value = String(opt?.id || '');
                  const selectedElsewhere = rowIds.includes(value) && rowIds[pickMenuState.idx] !== value;
                  const active = String(selectedId) === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`${tCss.pickMenuOption} ${active ? tCss.pickMenuOptionActive : ''}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        if (selectedElsewhere) return;
                        patchPickMember(activeEvent.id, selector.id, pickMenuState.idx, value, requiredCount);
                        setPickMenuState(null);
                      }}
                      disabled={selectedElsewhere}
                      title={displayPickOption(opt)}
                    >
                      {displayPickOption(opt)}
                    </button>
                  );
                })}
              </div>
            </div>,
            portalNode
          );
        })()}

              {bonusPopup.open && (()=>{ 
                const evv = events.find(e=> e.id===bonusPopup.evId);
                const opts = (evv && evv.template==='range-convert-bonus' && Array.isArray(evv.params?.bonus)) ? evv.params.bonus : [];
                const onPick = (label)=>{
                  const isAccum2 = !!(evv && evv.inputMode==='accumulate');
                  patchBonus(bonusPopup.evId, bonusPopup.pid, bonusPopup.idx, label || '', isAccum2, bonusPopup.attempts);
                  closeBonusPopup();
                  setTimeout(()=>{
                    const sel = `[data-focus-evid="${bonusPopup.evId}"][data-focus-pid="${bonusPopup.pid}"][data-focus-idx="${bonusPopup.idx}"]`;
                    const el  = document.querySelector(sel);
                    if (el && typeof el.focus === 'function') el.focus();
                  },0);
                };
                return (
                  <div
                    className={tCss.bonusPopup}
                    style={{
                      position:'fixed', left:bonusPopup.x, top:bonusPopup.y, transform:'translate(-50%,0)',
                      zIndex:1000, background:'#fff', border:'1px solid #e5e7eb', borderRadius:8,
                      boxShadow:'0 8px 24px rgba(0,0,0,.12)', width: bonusPopup.w
                    }}
                    onClick={(e)=>e.stopPropagation()}
                  >
                    {opts.map((b,i)=>(
                      <button key={i}
                        onClick={()=>onPick(b.label)}
                        style={{display:'block', width:'100%', padding:'6px 10px', border:0, background:'transparent', textAlign:'left', whiteSpace:'nowrap'}}
                      >
                        {b.label}{b.score!=null?` (+${b.score})`:''}
                      </button>
                    ))}
                    <button
                      onClick={()=>onPick('')}
                      style={{display:'block', width:'100%', padding:'6px 10px', border:0, background:'transparent', textAlign:'left', color:'#6b7280', whiteSpace:'nowrap'}}
                    >
                      선택 해제
                    </button>
                  </div>
                );
              })()}

            </div>
          );
        })}

        <div className={baseCss.footerNav}>
          <button className={`${baseCss.navBtn} ${baseCss.navPrev}`} onClick={()=>nav(`/player/home/${eventId}/2`)}>← 이전</button>
          <button
            className={`${baseCss.navBtn}`}
            onClick={saveDraft}
            disabled={!dirty}
            aria-disabled={!dirty}
            style={!dirty
              ? { opacity: 0.5, pointerEvents: 'none' }
              : { boxShadow: '0 0 0 2px rgba(59,130,246,.35) inset', fontWeight: 600 }
            }
          >
            저장
          </button>
          <button
            className={`${baseCss.navBtn} ${baseCss.navNext}`}
            onClick={()=>{ if (!nextDisabled) nav(`/player/home/${eventId}/4`); }}
            disabled={nextDisabled}
            aria-disabled={nextDisabled}
            data-disabled={nextDisabled ? '1' : '0'}
            style={nextDisabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          >
            다음 →
          </button>
        </div>
      </div>
    </div>
  );
}
