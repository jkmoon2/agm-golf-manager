// /src/player/screens/PlayerEventInput.jsx
// 변경 요약
// 1) 갱신 모드(입력칸 1칸)에서 마지막 한자리까지 정상 삭제되도록 '로컬 draft'를 추가
//    - refresh input은 화면 값이 eventData 저장 타이밍에 영향받지 않도록 draft로 제어
//    - onChange에서 draft와 스토어를 같이 갱신, value는 draft 우선 표시
// 2) 누적 모드(accumulate)는 기존 동작 유지

import React, { useMemo, useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import baseCss from './PlayerRoomTable.module.css';
import tCss   from './PlayerEventInput.module.css';
import { EventContext } from '../../contexts/EventContext';

/* 로컬에서 room 여러 키를 폭넓게 읽기 */
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

/* 포볼: 1조+2조 페어 슬롯(4명) – 기존 로직 유지 */
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

/* ★ 참가자 안에서 '나'를 찾아 방을 역추적 */
function inferRoomFromSelf(participants = [], eventData = {}) {
  const ids = [
    eventData?.auth?.uid, eventData?.player?.uid, eventData?.me?.uid,
    eventData?.auth?.id,  eventData?.player?.id,  eventData?.me?.id,
  ].filter(Boolean);

  // 1) id/uid로 매칭
  for (const p of participants) {
    if (ids.includes(p?.uid) || ids.includes(p?.id)) {
      const r = Number(p?.room);
      if (Number.isFinite(r) && r >= 1) return r;
    }
  }

  // 2) nickname(대소문자/공백 무시)로 매칭
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

  // URL ↔ 컨텍스트 동기화(기존 유지)
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

  /* 컨텍스트 후보 */
  const roomFromCtx = useMemo(() => {
    const cands = [ eventData?.myRoom, eventData?.player?.room, eventData?.auth?.room, eventData?.currentRoom ];
    return cands.map(Number).find(n => Number.isFinite(n) && n >= 1);
  }, [eventData]);

  /* ★ '나'의 방을 참가자 목록에서 역추적 */
  const roomFromSelf = useMemo(
    () => inferRoomFromSelf(participants, eventData),
    [participants, eventData]
  );

  /* 최종 방 선택: 컨텍스트 → 로컬 → 자기추론 → 첫 방 */
  const roomIdx = useMemo(() => {
    const ls  = readRoomFromLocal(eventId);
    const pick = [roomFromCtx, ls, roomFromSelf].find(
      n => Number.isFinite(n) && allRoomNos.includes(n)
    );
    return pick || allRoomNos[0] || 1;
  }, [roomFromCtx, roomFromSelf, eventId, allRoomNos]);

  /* ★ 결정된 방을 즉시 LS에 기록(이벤트별 키) – 이후 방문에서도 안정적 */
  useEffect(() => {
    if (Number.isFinite(roomIdx) && roomIdx >= 1) {
      try { localStorage.setItem(`player.currentRoom:${eventId}`, String(roomIdx)); } catch {}
    }
  }, [roomIdx, eventId]);

  /* 같은 방 4명 + 페어 슬롯 */
  const roomMembers = useMemo(() => {
    const inRoom = participants.filter(p => Number(p?.room) === roomIdx);
    return orderSlotsByPairs(inRoom, participants);
  }, [participants, roomIdx]);

  /* 입력 저장(갱신/누적) – 기존 유지 */
  const inputsByEvent = eventData?.eventInputs || {};
  const patchValue = (evId, pid, value) => {
    const all = { ...(eventData?.eventInputs || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    if (value === '' || value == null) delete person[pid];
    else person[pid] = Number(value);
    slot.person = person; all[evId] = slot;
    updateEventImmediate({ eventInputs: all }, false);
  };
  const patchAccum = (evId, pid, idx, value) => {
    const all = { ...(eventData?.eventInputs || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    const obj = person[pid] && typeof person[pid]==='object' && Array.isArray(person[pid].values)
      ? { values:[...person[pid].values] } : { values:[] };
    obj.values[idx] = (value===''||value==null) ? '' : Number(value);
    person[pid]=obj; slot.person=person; all[evId]=slot;
    updateEventImmediate({ eventInputs: all }, false);
  };

  // ★★★ 갱신 모드용 로컬 draft (evId 별로 p.id 문자열 값을 임시 저장)
  const [draft, setDraft] = useState({}); // { [evId]: { [pid]: string } }

  return (
    <div className={baseCss.page}>
      <div className={baseCss.content}>

        {events.map(ev => {
          const isAccum  = ev.inputMode === 'accumulate';
          const attempts = Math.max(2, Math.min(Number(ev.attempts || 4), 8));
          const nicknameWidth = '35%';
          const inputWidths   = isAccum
            ? Array.from({ length: attempts }, () => `calc(65% / ${attempts})`)
            : ['65%'];

          return (
            <div key={ev.id} className={`${baseCss.card} ${tCss.eventCard}`}>
              <div className={baseCss.cardHeader}>
                <div className={`${baseCss.cardTitle} ${tCss.eventTitle}`}>
                  {ev.title}
                </div>
              </div>

              <div className={`${baseCss.tableWrap} ${tCss.noOverflow}`}>
                <table className={tCss.table}>
                  <colgroup>
                    <col style={{ width: nicknameWidth }} />
                    {inputWidths.map((w,i)=>(<col key={i} style={{ width: w }} />))}
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
                    {roomMembers.map((p, rIdx)=>(
                      <tr key={rIdx}>
                        <td>{p ? p.nickname : ''}</td>
                        {isAccum
                          ? Array.from({length: attempts}, (_,i)=>(
                              <td key={i} className={tCss.cellEditable}>
                                <input
                                  type="number"
                                  value={p ? (inputsByEvent?.[ev.id]?.person?.[p.id]?.values?.[i] ?? '') : ''}
                                  onChange={e=> p && patchAccum(ev.id, p.id, i, e.target.value)}
                                  className={tCss.cellInput}
                                />
                              </td>
                            ))
                          : (
                            <td className={tCss.cellEditable}>
                              <input
                                type="number"
                                // ✅ refresh 모드: draft 우선 → 마지막 한자리까지 깔끔히 지움
                                value={p ? ((draft?.[ev.id]?.[p.id] !== undefined)
                                            ? draft[ev.id][p.id]
                                            : (inputsByEvent?.[ev.id]?.person?.[p.id] ?? '')) : ''}
                                onChange={(e)=>{
                                  if (!p) return;
                                  const v = e.target.value;
                                  setDraft(d => ({ ...d, [ev.id]: { ...(d[ev.id]||{}), [p.id]: v } }));
                                  patchValue(ev.id, p.id, v);
                                }}
                                className={tCss.cellInput}
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

        <div className={baseCss.footerNav}>
          <button className={`${baseCss.navBtn} ${baseCss.navPrev}`} onClick={()=>nav(`/player/home/${eventId}/2`)}>← 이전</button>
          <button className={`${baseCss.navBtn} ${baseCss.navNext}`} onClick={()=>nav(`/player/home/${eventId}/4`)}>다음 →</button>
        </div>
      </div>
    </div>
  );
}
