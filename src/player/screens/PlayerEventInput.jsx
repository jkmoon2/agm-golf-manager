// /src/player/screens/PlayerEventInput.jsx
// 변경 요약 (첨부 파일 기준 최소 수정)
// - ★MOD: A안 반영 → '저장' 버튼으로만 커밋(현재 방만 반영, 기존 값이 있으면 유지 = 운영자/관리자 우선)
// - ★MOD: 입력 중에는 문자열(raw) 유지 → onBlur 시 숫자 정규화하여 draft에만 반영(즉시 DB 저장 X)
// - ★MOD: draft와 서버값 동기화: 서버값 갱신됐고 로컬 수정중이 아니면 draft 동기화
// - ★MOD: [DIRTY-GUARD] 서버 원본과 실제 값 비교해 dirty 판단(포커스만/선택만으론 활성화 금지)
// - ★MOD: [EMPHASIS] 저장 버튼 활성화 시 약하게 강조
// - 기존 UI/레이아웃/함수명/보너스 팝업/계산 로직/스타일 등은 그대로 유지

import React, { useMemo, useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import baseCss from './PlayerRoomTable.module.css';
import tCss   from './PlayerEventInput.module.css';
import { EventContext } from '../../contexts/EventContext';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

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
  const tryKeys = [
    `player.currentRoom:${eventId}`,
    'player.currentRoom',
    'player.home.room',
    'player.auth.room',
  ];
  for (const k of tryKeys) {
    try {
      const v = localStorage.getItem(k);
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1) return n;
    } catch {}
  }
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

export default function PlayerEventInput(){
  const nav = useNavigate();
  const { eventId } = useParams();
  const { eventId: ctxId, loadEvent, eventData, updateEventImmediate } = useContext(EventContext) || {};

  // 실시간 게이트 구독
  const [fallbackGate, setFallbackGate] = useState(null);
  const [fallbackAt, setFallbackAt] = useState(0);
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

  // URL ↔ 컨텍스트 동기화
  useEffect(()=>{ if(eventId && eventId!==ctxId && typeof loadEvent==='function'){ loadEvent(eventId); } },[eventId,ctxId,loadEvent]);

  const participants = useMemo(
    () => Array.isArray(eventData?.participants) ? eventData.participants : [],
    [eventData]
  );
  const events = useMemo(
    () => Array.isArray(eventData?.events) ? eventData.events.filter(e => e?.enabled !== false) : [],
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
      try { localStorage.setItem(`player.currentRoom:${eventId}`, String(roomIdx)); } catch {}
    }
  }, [roomIdx, eventId]);

  const roomMembers = useMemo(() => {
    const inRoom = participants.filter(p => Number(p?.room) === roomIdx);
    return orderSlotsByPairs(inRoom, participants);
  }, [participants, roomIdx]);

  const inputsByEventServer = eventData?.eventInputs || {};

  // ★MOD: A안 드래프트 상태 추가(입력 중에는 로컬만 갱신, 저장 버튼으로 커밋)
  const [draft, setDraft] = useState(() => inputsByEventServer ? JSON.parse(JSON.stringify(inputsByEventServer)) : {});
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(inputsByEventServer ? JSON.parse(JSON.stringify(inputsByEventServer)) : {});
  }, [inputsByEventServer, dirty]);
  const inputsByEvent = draft || {};

  // ===== [DIRTY-GUARD] 서버 원본 비교 유틸 =====
  const getServerSingle = (evId, pid) => {
    const v = inputsByEventServer?.[evId]?.person?.[pid];
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const getServerAccum = (evId, pid, attempts) => {
    const arr = inputsByEventServer?.[evId]?.person?.[pid]?.values;
    const base = Array.isArray(arr) ? [...arr] : [];
    // 길이 맞추기
    while (base.length < attempts) base.push('');
    return base.map((x) => {
      if (x === '' || x == null) return '';
      const n = Number(x);
      return Number.isFinite(n) ? String(n) : '';
    });
  };

  // ── 수정 1: 입력 중에는 문자열 그대로 draft에 저장 (DB 즉시 저장 X)
  const patchValue = (evId, pid, value) => {
    const all  = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    const prev = String(person[pid] ?? '');
    const next = String(value ?? '');
    if (prev === next) { // [DIRTY-GUARD] 동일 문자열이면 무시
      return;
    }
    person[pid] = next;
    slot.person = person; all[evId] = slot;
    setDraft(all);
    // [DIRTY-GUARD] 서버 원본과 달라졌을 때만 dirty
    const server = getServerSingle(evId, pid);
    const nextNum = (next.trim()==='' ? null : (Number(next)));
    setDirty(prevDirty => prevDirty || ((server ?? null) !== (Number.isFinite(nextNum) ? nextNum : null)));
  };

  // ── 수정 2: 누적 입력도 문자열 그대로 draft에 저장
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
    if (prev === next) { // [DIRTY-GUARD]
      return;
    }
    obj.values[idx] = next;
    person[pid]=obj; slot.person=person; all[evId]=slot;
    setDraft(all);
    // [DIRTY-GUARD] 서버 배열과 비교
    const baseArr = getServerAccum(evId, pid, atts); // 문자열 배열
    const curArr  = [...obj.values].map(x => {
      if (x === '' || x == null) return '';
      const n = Number(x);
      return Number.isFinite(n) ? String(n) : '';
    });
    const changed = curArr.length!==baseArr.length || curArr.some((v,i)=>v!==baseArr[i]);
    setDirty(prevDirty => prevDirty || changed);
  };

  // ── 추가: onBlur 시 숫자로 정규화하여 draft에만 반영(빈 값은 삭제)
  const finalizeValue = (evId, pid, raw) => {
    const v = String(raw ?? '').trim();
    const num = v === '' ? NaN : Number(v);

    const all  = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };

    const before = person[pid];
    if (!v || Number.isNaN(num)) delete person[pid];
    else person[pid] = num;

    // [DIRTY-GUARD] 서버 원본과 비교해서 실제 변화 없으면 dirty 유지
    const server = getServerSingle(evId, pid); // number|null
    const afterNum = (!v || Number.isNaN(num)) ? null : num;
    const same = (server ?? null) === (afterNum ?? null);

    // draft 반영
    if (before === person[pid]) {
      // draft 변화 없음
    }
    slot.person = person; all[evId] = slot;
    setDraft(all);
    if (!same) setDirty(true);
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

    // [DIRTY-GUARD] 서버 원본과 비교
    const baseArr = getServerAccum(evId, pid, atts);
    const curArr  = (person[pid]?.values || []).map(x => {
      if (x === '' || x == null) return '';
      const n = Number(x);
      return Number.isFinite(n) ? String(n) : '';
    });
    const changed = curArr.length!==baseArr.length || curArr.some((vv,i)=>vv!==baseArr[i]);

    slot.person = person; all[evId] = slot;
    setDraft(all);
    if (changed) setDirty(true);
  };

  // 보너스 저장 (원본 유지, draft만 반영)
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
      if (prev === next) { // [DIRTY-GUARD]
        setDraft(prevAll => prevAll); // 변화 없음
        return;
      }
      arr[idxOrVal] = next;
      obj.bonus = arr;
    } else {
      const prev = String(obj.bonus ?? '');
      const next = String(value ?? '');
      if (prev === next) { // [DIRTY-GUARD]
        setDraft(prevAll => prevAll);
        return;
      }
      obj.bonus = next;
    }
    person[pid] = obj; slot.person = person; all[evId] = slot;
    setDraft(all);
    setDirty(true); // 보너스는 입력 변경으로 간주
  };

  // ===== 팝업 폭 계산 (원본 유지) =====
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

  // ★MOD: 저장(관리자 우선, 현재 방만 반영)
  const isEmpty = (v) => {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim()==='';
    if (typeof v === 'object'){
      if (Array.isArray(v.values)) return !v.values.some(s=>String(s).trim()!=='');
      return Object.keys(v).length===0;
    }
    return false;
  };

  const saveDraft = async () => {
    try{
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
          if (!roomPids.has(String(pid))) return; // 현재 방만
          const cur = mPerson[pid];
          // 관리자(기존 값) 우선: 기존 값이 비어 있지 않으면 유지
          if (!isEmpty(cur)) return;

          if (isEmpty(val)) delete mPerson[pid];
          else mPerson[pid] = val;
        });

        mSlot.person = mPerson;
        merged[evId] = mSlot;
      });

      if (typeof updateEventImmediate === 'function') {
        await updateEventImmediate({ eventInputs: merged }, false);
      } else {
        await setDoc(doc(db, 'events', eventId || ctxId), { eventInputs: merged }, { merge: true });
      }
      setDirty(false);
      alert('저장되었습니다.');
    }catch(e){
      console.error('saveDraft error', e);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className={baseCss.page}>
      <div className={baseCss.content}>

        {events.map(ev => {
          const isAccum  = ev.inputMode === 'accumulate';
          const attempts = Math.max(2, Math.min(Number(ev.attempts || 4), 20));
          const NICK_PCT = 35;
          const ONE_PCT  = 65 / 4;
          const tableWidthPct = isAccum ? (NICK_PCT + attempts * ONE_PCT) : 100;
          const bonusOpts = (ev.template === 'range-convert-bonus' && Array.isArray(ev.params?.bonus)) ? ev.params.bonus : [];

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
                  </colgroup>

                  <thead>
                    <tr>
                      <th>닉네임</th>
                      {isAccum
                        ? Array.from({length: attempts}, (_,i)=>(<th key={i}>입력{i+1}</th>))
                        : <th>입력값</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {orderSlotsByPairs(
                      participants.filter(p => Number(p?.room)=== (Number.isFinite(roomIdx)?roomIdx:NaN)),
                      participants
                    ).map((p, rIdx)=>(
                      <tr key={rIdx}>
                        <td>{p ? p.nickname : ''}</td>

                        {isAccum ? (
                          Array.from({length: attempts}, (_,i)=>(
                            <td
                              key={i}
                              className={tCss.cellEditable}
                              onClick={(e)=>{ if (bonusOpts.length) openBonusPopup(ev.id, p?.id, i, attempts, e); }}
                            >
                              <input
                                type="text"
                                inputMode="decimal"
                                pattern="[0-9.]*"   // 양의 정수/소수만
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                className={tCss.cellInput}
                                value={p ? (inputsByEvent?.[ev.id]?.person?.[p.id]?.values?.[i] ?? '') : ''}
                                onChange={e=> p && patchAccum(ev.id, p.id, i, e.target.value, attempts)}
                                onBlur={e=> p && finalizeAccum(ev.id, p.id, i, e.target.value, attempts)}
                                data-focus-evid={ev.id}
                                data-focus-pid={p ? p.id : ''}
                                data-focus-idx={i}
                              />
                            </td>
                          ))
                        ) : (
                          <td
                            className={tCss.cellEditable}
                            onClick={(e)=>{ if (bonusOpts.length) openBonusPopup(ev.id, p?.id, 0, 1, e); }}
                          >
                            <input
                              type="text"
                              inputMode="decimal"
                              pattern="[0-9.]*"   // 양의 정수/소수만
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

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {/* 보너스 선택 팝업 (원본 유지) */}
        {bonusPopup.open && (()=>{ 
          const ev = events.find(e=> e.id===bonusPopup.evId);
          const opts = (ev && ev.template==='range-convert-bonus' && Array.isArray(ev.params?.bonus)) ? ev.params.bonus : [];
          const onPick = (label)=>{
            const isAccum = !!(ev && ev.inputMode==='accumulate');
            patchBonus(bonusPopup.evId, bonusPopup.pid, bonusPopup.idx, label || '', isAccum, bonusPopup.attempts);
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

        {/* ★MOD: 하단 네비게이션 + 저장 버튼(A안) */}
        <div className={baseCss.footerNav}>
          <button className={`${baseCss.navBtn} ${baseCss.navPrev}`} onClick={()=>nav(`/player/home/${eventId}/2`)}>← 이전</button>
          <button
            className={`${baseCss.navBtn}`}
            onClick={saveDraft}
            disabled={!dirty}
            aria-disabled={!dirty}
            // [EMPHASIS] 활성 시만 살짝 강조
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
