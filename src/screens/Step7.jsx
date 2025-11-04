// src/screens/Step7.jsx

import React, { useState, useContext, useRef, useEffect } from 'react';
import styles from './Step7.module.css';
import { StepContext } from '../flows/StepFlow';
import { EventContext } from '../contexts/EventContext';
import { serverTimestamp } from 'firebase/firestore';

// ★ ADD: Admin 화면에서도 scores를 직접 구독하여 즉시 반영
import { collection, onSnapshot, getDocs, setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

if (process.env.NODE_ENV!=='production') console.log('[AGM] Step7 render');

export default function Step7() {
  const {
    participants,
    roomNames,
    onScoreChange,
    onManualAssign,
    onCancel,
    onAutoAssign,
    onReset,
    goPrev,
    goNext,
    setParticipants,
    updateParticipantsBulk,
    updateParticipant,
  } = useContext(StepContext);

  // ★ ADD: upsertScores 추가 (Admin→Player 브리지 완성)
  const { eventId, updateEventImmediate, eventData, upsertScores } = useContext(EventContext) || {};

  // ★★★ ADD: scores 구독 → Admin 화면 로컬 participants에 즉시 머지
  useEffect(() => {
    if (!eventId) return;
    const colRef = collection(db, 'events', eventId, 'scores');
    const unsub  = onSnapshot(colRef, snap => {
      const map = {};
      snap.forEach(d => {
        const s = d.data() || {};
        map[String(d.id)] = {
          score: (Object.prototype.hasOwnProperty.call(s, 'score') ? s.score : undefined),
          room:  (Object.prototype.hasOwnProperty.call(s, 'room')  ? s.room  : undefined),
        };
      });
      setParticipants(prev => {
        const next = (prev || []).map(p => {
          const s = map[String(p.id)];
          if (!s) return p;
          let out = p, changed = false;
          if (Object.prototype.hasOwnProperty.call(s, 'score') && (p.score ?? null) !== (s.score ?? null)) {
            out = { ...out, score: s.score ?? null }; changed = true;
          }
          if (Object.prototype.hasOwnProperty.call(s, 'room') && (p.room ?? null) !== (s.room ?? null)) {
            out = { ...out, room: s.room ?? null }; changed = true;
          }
          return changed ? out : p;
        });
        return next;
      });
    });
    return () => unsub();
  }, [eventId, setParticipants]);

  const [loadingId, setLoadingId] = useState(null);
  const [scoreDraft, setScoreDraft] = useState({});
  const pressTimers = useRef({});

  const TIMINGS = { preAlert: 1200, partnerPick: 1400 };
  const MAX_ROOM_CAPACITY = 4;

  /* ★ NEW: 하단 고정/여백 계산 — STEP5 동일 */
  const [__bottomGap, __setBottomGap] = useState(64);
  useEffect(() => {
    const probe = () => {
      try {
        const el =
          document.querySelector('[data-bottom-nav]') ||
          document.querySelector('#bottomTabBar') ||
          document.querySelector('.bottomTabBar') ||
          document.querySelector('.BottomTabBar');
        __setBottomGap(el && el.offsetHeight ? el.offsetHeight : 64);
      } catch {}
    };
    probe();
    window.addEventListener('resize', probe);
    return () => window.removeEventListener('resize', probe);
  }, []);
  const __FOOTER_H   = 56;
  const __safeBottom = `calc(env(safe-area-inset-bottom, 0px) + ${__bottomGap}px)`;
  const __pageStyle  = {
    minHeight: '100dvh',
    boxSizing: 'border-box',
    paddingBottom: `calc(${__FOOTER_H}px + ${__safeBottom})`,
    WebkitOverflowScrolling: 'touch',
    touchAction: 'pan-y',
  };
  /* ─────────────────────────────────────────────────────────── */

  // ─ helpers ─
  const isGroup1 = (p) => Number.isFinite(Number(p?.group))
    ? (Number(p.group) % 2 === 1)
    : (p.id % 2 === 1);

  const countInRoom = (list, roomNo) =>
    (list || []).filter(p => Number(p?.room) === Number(roomNo)).length;

  const lastNonEmptyRef = useRef([]);
  useEffect(() => {
    if (Array.isArray(participants) && participants.length > 0) {
      lastNonEmptyRef.current = participants;
    }
  }, [participants]);

  const getList = () =>
    (Array.isArray(participants) && participants.length > 0)
      ? participants
      : (lastNonEmptyRef.current || []);

  const getCustomRoomNumbers = () => {
    const names = Array.isArray(roomNames) ? roomNames : [];
    const nums = names.map(n => {
      if (typeof n !== 'string') return NaN;
      const m = n.match(/(\d+)/);
      return m ? Number(m[1]) : NaN;
    }).filter(v => Number.isFinite(v));
    const unique = new Set(nums);
    return (nums.length === names.length && unique.size === nums.length) ? nums : null;
  };

  const getRoomPriority = () => {
    const n = Array.isArray(roomNames) ? roomNames.length : 0;
    const fromEvent =
      eventData && Array.isArray(eventData.roomPriority) ? eventData.roomPriority : null;

    if (fromEvent && fromEvent.length) {
      return fromEvent.map(Number).filter(r => r >= 1 && r <= n);
    }
    const custom = getCustomRoomNumbers();
    if (custom) return Array.from({ length: n }, (_, i) => i + 1);
    return Array.from({ length: n }, (_, i) => n - i);
  };

  const resolveTargetRoom = (raw) => {
    const num = Number(raw);
    const total = Array.isArray(roomNames) ? roomNames.length : 0;
    if (!Number.isFinite(num) || total === 0) return null;
    const custom = getCustomRoomNumbers();
    if (custom) {
      const idx = custom.indexOf(num);
      if (idx !== -1) return idx + 1;
    }
    if (num >= 1 && num <= total) return num;
    return null;
  };

  const findAvailableRoom = (preferred, list, limit = MAX_ROOM_CAPACITY) => {
    const priority = getRoomPriority();
    const candidates = priority.filter(r => countInRoom(list, r) < limit);
    if (preferred && candidates.includes(preferred)) return preferred;
    return candidates[0] || null;
  };

  const getPairForGroup1 = (id, list) => {
    const a = (list || []).find(p => String(p.id) === String(id));
    if (!a) return [];
    const b = a?.partner ? (list || []).find(p => String(p.id) === String(a.partner)) : null;
    return b ? [a, b] : [a];
  };

  const getRoomMembers = (list, roomNo) =>
    (list || []).filter(p => Number(p?.room) === Number(roomNo));
  const getGroup1InRoom = (list, roomNo) =>
    getRoomMembers(list, roomNo).filter(p => isGroup1(p));
  const getGroup2InRoom = (list, roomNo) =>
    getRoomMembers(list, roomNo).filter(p => !isGroup1(p));

  const getTeamsInRoom = (list, roomNo) => {
    const g1s = getGroup1InRoom(list, roomNo);
    return g1s.map(g1 => {
      const g2 = (list || []).find(p => String(p.id) === String(g1.partner));
      return g2 ? { g1, g2 } : null;
    }).filter(Boolean);
  };

  /* ★ NEW: STEP5와 동일한 숫자 입력 정책 */
  const isPartialNumber = (s) => /^-?\d*\.?\d*$/.test(s);

  // === 여기부터 실시간 커밋을 위한 보조 유틸(STEP5 동일) ===
  const buildNextFromChanges = (baseList, changes) => {
    try {
      const map = new Map((baseList || []).map(p => [String(p.id), { ...p }]));
      (changes || []).forEach(({ id, fields }) => {
        const k = String(id);
        const cur = map.get(k) || {};
        map.set(k, { ...cur, ...(fields || {}) });
      });
      return Array.from(map.values());
    } catch (e) {
      console.warn('[Step7] buildNextFromChanges error:', e);
      return baseList || [];
    }
  };

  const canBulk = typeof updateParticipantsBulk === 'function';
  const canOne  = typeof updateParticipant === 'function';
  const syncChanges = async (changes) => {
    try {
      if (canBulk) {
        await updateParticipantsBulk(changes);
      } else if (canOne) {
        for (const ch of changes) await updateParticipant(ch.id, ch.fields);
      }
    } catch (e) {
      console.warn('[Step7] syncChanges failed:', e);
    }
    try {
      if (typeof updateEventImmediate === 'function' && eventId) {
        const base = participants || [];
        const next = buildNextFromChanges(base, changes);
        await updateEventImmediate({ participants: next, participantsUpdatedAt: serverTimestamp() });
      }
    } catch (e) {
      console.warn('[Step7] updateEventImmediate(participants) failed:', e);
    }

    // ★★★ ADD: Admin → Player 브리지 (scores 업서트: score/room 반영)
    try {
      if (typeof upsertScores === 'function' && Array.isArray(changes) && changes.length) {
        const payload = [];
        for (const { id, fields } of changes) {
          if (!fields) continue;
          const item = { id };
          let push = false;
          if (Object.prototype.hasOwnProperty.call(fields, 'score')) { item.score = fields.score ?? null; push = true; }
          if (Object.prototype.hasOwnProperty.call(fields, 'room'))  { item.room  = fields.room  ?? null; push = true; }
          if (push) payload.push(item);
        }
        if (payload.length) await upsertScores(payload);
      }
    } catch (e) {
      console.warn('[Step7] upsertScores(syncChanges) failed:', e);
    }
  };
  // ============================================================

  const handleScoreInputChange = (id, raw) => {
    if (!isPartialNumber(raw)) return;
    setScoreDraft(d => ({ ...d, [id]: raw }));
  };

  const handleScoreBlur = async (id) => {
    const raw = scoreDraft[id];
    if (raw === undefined) return;
    let v = null;
    if (!(raw === '' || raw === '-' || raw === '.' || raw === '-.')) {
      const num = Number(raw);
      v = Number.isNaN(num) ? null : num;
    }

    if (typeof onScoreChange === 'function') {
      onScoreChange(id, v);
    } else if (typeof setParticipants === 'function') {
      setParticipants(ps => ps.map(p => p.id === id ? { ...p, score: v } : p));
    }

    await syncChanges([{ id, fields: { score: v } }]);

    setScoreDraft(d => { const { [id]:_, ...rest } = d; return rest; });
  };

  const startLongPress = (id) => {
    try { if (pressTimers.current[id]) clearTimeout(pressTimers.current[id]); } catch {}
    pressTimers.current[id] = setTimeout(() => {
      setScoreDraft(d => {
        const cur = d[id] ?? (() => {
          const p = (getList() || []).find(x => x.id === id);
          return p && p.score != null ? String(p.score) : '';
        })();
        if (String(cur).startsWith('-')) return d;
        return { ...d, [id]: (cur === '' ? '-' : `-${String(cur).replace(/^-/, '')}`) };
      });
    }, 600);
  };
  const cancelLongPress = (id) => {
    try { if (pressTimers.current[id]) clearTimeout(pressTimers.current[id]); } catch {}
    pressTimers.current[id] = null;
  };

  const isCompleted = id => {
    const me = getList().find(p => p.id === id);
    return !!(me && me.room != null && me.partner != null);
  };

  const compatParticipant = (p) => ({
    ...p,
    roomNumber: p.room ?? null,
    teammateId: p.partner ?? null,
    teammate:   p.partner ?? null,
  });
  const buildRoomTable = (list=[]) => {
    const table = {};
    list.forEach(p => {
      const r = p.room ?? null;
      if (r == null) return;
      if (!table[r]) table[r] = [];
      table[r].push(p.id);
    });
    return table;
  };

  const commitParticipantsNow = async (list) => {
    try {
      if (!Array.isArray(list) || list.length === 0) return;

      // ★ ADD: 기존과 동일한 participants 저장
      if (updateEventImmediate && eventId) {
        const compat = (list || []).map(compatParticipant);
        const roomTable = buildRoomTable(compat);
        await updateEventImmediate(roomTable ? { participants: compat, roomTable, participantsUpdatedAt: serverTimestamp() } : { participants: compat, participantsUpdatedAt: serverTimestamp() });
      } else if (typeof updateParticipantsBulk === 'function') {
        const changes = (list || []).map(p => ({
          id: p.id,
          fields: {
            room: p.room ?? null,
            partner: p.partner ?? null,
            score: p.score ?? null,
            roomNumber: p.room ?? null,
            teammateId: p.partner ?? null,
            teammate:   p.partner ?? null,
          }
        }));
        if (changes.length > 0) await updateParticipantsBulk(changes);
      } else if (typeof updateParticipant === 'function') {
        for (const p of (list || [])) {
          await updateParticipant(p.id, {
            room: p.room ?? null,
            partner: p.partner ?? null,
            score: p.score ?? null,
            roomNumber: p.room ?? null,
            teammateId: p.partner ?? null,
            teammate:   p.partner ?? null,
          });
        }
      }

      // ★★★ ADD: scores 업서트(변경된 사람만)
      try {
        if (typeof upsertScores === 'function') {
          const oldById = new Map((participants || []).map(x => [String(x.id), x]));
          const payload = [];
          (list || []).forEach(p => {
            const old = oldById.get(String(p.id)) || {};
            const changedScore = (old.score ?? null) !== (p.score ?? null);
            const changedRoom  = (old.room  ?? null) !== (p.room  ?? null);
            if (changedScore || changedRoom) {
              payload.push({ id: p.id, score: p.score ?? null, room: p.room ?? null });
            }
          });
          if (payload.length) await upsertScores(payload);
        }
      } catch (e) {
        console.warn('[Step7] upsertScores(commit) failed:', e);
      }
    } catch (e) {
      console.warn('[Step7] commitParticipantsNow failed:', e);
    }
  };

  const lastCommittedHashRef = useRef('');
  const commitTimerRef = useRef(null);
  useEffect(() => {
    if (!Array.isArray(participants) || participants.length === 0) return;
    const nextHash = (() => { try { return JSON.stringify(participants); } catch { return String(Date.now()); } })();
    if (nextHash === lastCommittedHashRef.current) return;
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(async () => {
      try {
        await commitParticipantsNow(participants);
        lastCommittedHashRef.current = nextHash;
      } catch (e) {
        console.warn('[Step7] updateEventImmediate failed:', e);
      }
    }, 250);
  }, [participants]);

  // 이하 이동/트레이드 로직(원본 유지) …

  const forceMovePairToRoom = async (id, targetRoom) => {
    const list = [...getList()];
    const pair = getPairForGroup1(id, list);
    if (pair.length === 0) return;

    const srcRoom = Number(pair[0]?.room);
    const occ = countInRoom(list, targetRoom);

    if (occ <= MAX_ROOM_CAPACITY - pair.length) {
      const ids = new Set(pair.map(x => String(x.id)));
      const next = list.map(p => ids.has(String(p.id)) ? { ...p, room: targetRoom } : p);
      await commitParticipantsNow(next);
      alert(`강제 이동 완료: ${pair[0]?.nickname ?? ''}${pair[1] ? ' 팀 포함' : ''} → ${targetRoom}번 방`);
      return;
    }

    if (occ >= MAX_ROOM_CAPACITY && pair.length === 2) {
      const teams = getTeamsInRoom(list, targetRoom);
      if (teams.length === 0) { alert('해당 방의 팀 구성을 파악할 수 없습니다.'); return; }

      let pick = teams[0];
      if (teams.length > 1) {
        const names = teams.map((t,i)=> `${i+1}. ${t.g1.nickname} / ${t.g2.nickname}`).join('\n');
        const sel = window.prompt(`교체할 팀을 선택하세요:\n${names}`, '1');
        const idx = Number(sel);
        if (!Number.isFinite(idx) || idx < 1 || idx > teams.length) return;
        pick = teams[idx-1];
      }

      const next = list.map(p => {
        if (p.id === pair[0].id || p.id === pair[1].id) return { ...p, room: targetRoom };
        if (p.id === pick.g1.id || p.id === pick.g2.id) return { ...p, room: srcRoom };
        return p;
      });
      await commitParticipantsNow(next);
      alert(`트레이드 완료: (${pair[0].nickname}, ${pair[1].nickname}) ↔ (${pick.g1.nickname}, ${pick.g2.nickname})`);
      return;
    }

    alert('선택하신 방은 정원 초과입니다. (정원 4명)');
  };

  const moveOrTradeGroup2 = async (idGroup2, targetRoom) => {
    const list = [...getList()];
    const me2 = list.find(p => String(p.id) === String(idGroup2));
    if (!me2) return alert('대상을 찾을 수 없습니다.');
    if (isGroup1(me2)) return alert('해당 동작은 1조만 가능합니다.');
    const me1 = me2?.partner ? list.find(p => String(p.id) === String(me2.partner)) : null;

    const dstG2s = getGroup2InRoom(list, targetRoom);
    const dstG1s = getGroup1InRoom(list, targetRoom);
    const dst1   = dstG1s[0] || null;

    if (dstG2s.length === 0) {
      if (countInRoom(list, targetRoom) >= MAX_ROOM_CAPACITY) { alert('정원 초과로 이동할 수 없습니다.'); return; }
      const next = list.map(p => {
        if (p.id === me2.id) return { ...p, room: targetRoom, partner: dst1?.id ?? null };
        if (p.id === (dst1?.id ?? -1)) return { ...p, partner: me2.id };
        if (p.id === (me1?.id ?? -2)) return { ...p, partner: null };
        return p;
      });
      await commitParticipantsNow(next);
      alert(`${me2.nickname}님을 ${targetRoom}번 방으로 이동했습니다.`);
      return;
    }

    let pick = dstG2s[0];
    if (dstG2s.length > 1) {
      const names = dstG2s.map((c,i)=> `${i+1}. ${c.nickname}`).join('\n');
      const sel = window.prompt(`트레이드할 2조를 선택하세요:\n${names}`, '1');
      const idx = Number(sel);
      if (!Number.isFinite(idx) || idx < 1 || idx > dstG2s.length) return;
      pick = dstG2s[idx-1];
    }
    const pick1 = pick?.partner ? list.find(p => String(p.id) === String(pick.partner)) : null;

    const srcRoom = Number(me2.room);
    const dstRoom = Number(targetRoom);

    const next = list.map(p => {
      if (p.id === me2.id)    return { ...p, room: dstRoom, partner: pick1?.id ?? null };
      if (p.id === pick.id)   return { ...p, room: srcRoom, partner: me1?.id ?? null };
      if (p.id === (me1?.id ?? -1))   return { ...p, partner: pick.id };
      if (p.id === (pick1?.id ?? -2)) return { ...p, partner: me2.id };
      return p;
    });
    await commitParticipantsNow(next);
    alert(`트레이드 완료: ${me2.nickname} ↔ ${pick.nickname} ( ${srcRoom} ↔ ${dstRoom} )`);
  };

  const moveOrTradeGroup1 = async (idGroup1, targetRoom) => {
    const list = [...getList()];
    const me1 = list.find(p => String(p.id) === String(idGroup1));
    if (!me1) return alert('대상을 찾을 수 없습니다.');
    if (!isGroup1(me1)) return alert('해당 동작은 1조만 가능합니다.');
    const me2 = me1?.partner ? list.find(p => String(p.id) === String(me1.partner)) : null;

    const dstG1s = getGroup1InRoom(list, targetRoom);
    const dstG2s = getGroup2InRoom(list, targetRoom);
    const dst2   = dstG2s[0] || null;

    if (dstG1s.length === 0) {
      if (countInRoom(list, targetRoom) >= MAX_ROOM_CAPACITY) { alert('정원 초과로 이동할 수 없습니다.'); return; }
      const next = list.map(p => {
        if (p.id === me1.id) return { ...p, room: targetRoom, partner: dst2?.id ?? null };
        if (p.id === (dst2?.id ?? -1)) return { ...p, partner: me1.id };
        if (p.id === (me2?.id ?? -2)) return { ...p, partner: null };
        return p;
      });
      await commitParticipantsNow(next);
      alert(`${me1.nickname}님을 ${targetRoom}번 방으로 이동했습니다.`);
      return;
    }

    let pick = dstG1s[0];
    if (dstG1s.length > 1) {
      const names = dstG1s.map((c,i)=> `${i+1}. ${c.nickname}`).join('\n');
      const sel = window.prompt(`트레이드할 1조를 선택하세요:\n${names}`, '1');
      const idx = Number(sel);
      if (!Number.isFinite(idx) || idx < 1 || idx > dstG1s.length) return;
      pick = dstG1s[idx-1];
    }
    const pick2 = pick?.partner ? list.find(p => String(p.id) === String(pick.partner)) : null;

    const srcRoom = Number(me1.room);
    const dstRoom = Number(targetRoom);

    const next = list.map(p => {
      if (p.id === me1.id)    return { ...p, room: dstRoom, partner: pick2?.id ?? null };
      if (p.id === pick.id)   return { ...p, room: srcRoom, partner: me2?.id ?? null };
      if (p.id === (me2?.id ?? -1))   return { ...p, partner: pick.id };
      if (p.id === (pick2?.id ?? -2)) return { ...p, partner: me1.id };
      return p;
    });
    await commitParticipantsNow(next);
    alert(`트레이드 완료: ${me1.nickname} ↔ ${pick.nickname} ( ${srcRoom} ↔ ${dstRoom} )`);
  };

  const handleAltOnNickname = async (p, evt) => {
    const alt = !!evt?.altKey;
    if (!alt) return;

    const list = getList();
    const priority = getRoomPriority();
    const freeList = priority.filter(r => countInRoom(list, r) < MAX_ROOM_CAPACITY);
    const recommend = freeList.slice(0, 5).join(', ') || '없음';

    const input = window.prompt(
      isGroup1(p)
        ? `1조 개인 이동/트레이드: 방 번호를 입력하세요 (권장: ${recommend})`
        : `2조 개인 이동/트레이드: 방 번호를 입력하세요 (권장: ${recommend})`,
      ''
    );
    const resolved = resolveTargetRoom(input);
    if (!resolved) return;
    if (isGroup1(p)) await moveOrTradeGroup1(p.id, resolved);
    else await moveOrTradeGroup2(p.id, resolved);
  };

  const handleManualClick = async (id, evt) => {
    if (evt?.altKey) {
      const list = getList();
      const pair = getPairForGroup1(id, list);
      const need = pair.length;

      const priority = getRoomPriority();
      const freeList = priority.filter(r => countInRoom(list, r) <= (MAX_ROOM_CAPACITY - need));
      const recommend = freeList.slice(0, 5).join(', ') || '없음';

      const input = window.prompt(
        `강제 이동(페어 ${need}명): 방 번호를 입력하세요 (권장: ${recommend})`,
        ''
      );
      const resolved = resolveTargetRoom(input);
      if (!resolved) return;
      await forceMovePairToRoom(id, resolved);
      return;
    }

    if (isCompleted(id)) return;

    setLoadingId(id);

    const res = await onManualAssign(id);
    const { roomNo, roomNumber, nickname, partnerNickname } = res || {};
    const finalRoom = roomNo ?? roomNumber ?? null;

    try {
      const list = getList();
      if (Number.isFinite(Number(finalRoom))) {
        const occ = countInRoom(list, finalRoom);
        if (occ > MAX_ROOM_CAPACITY) {
          const target = findAvailableRoom(finalRoom, list);
          if (target && target !== finalRoom) {
            const pair = getPairForGroup1(id, list);
            const ids = new Set(pair.map(x => String(x.id)));
            const next = list.map(p => ids.has(String(p.id)) ? { ...p, room: target } : p);
            await commitParticipantsNow(next);
          }
        }
      }
    } catch (e) {
      console.warn('[Step7] post-assign capacity fix failed:', e);
    }

    setTimeout(async () => {
      const label = roomNames[(finalRoom ?? 0) - 1]?.trim() || (finalRoom ? `${finalRoom}번 방` : '');
      if (finalRoom && nickname) {
        if (partnerNickname) {
          alert(`${nickname}님은 ${label}에 배정되었습니다.\n팀원을 선택하려면 확인을 눌러주세요.`);
          setTimeout(() => {
            alert(`${nickname}님은 ${partnerNickname}님을 선택했습니다.`);
            setLoadingId(null);
          }, TIMINGS.partnerPick);
        } else {
          alert(`${nickname}님은 ${label}에 배정되었습니다.`);
          setLoadingId(null);
        }
      } else {
        setLoadingId(null);
      }
    }, TIMINGS.preAlert);
  };

  const handleCancelClick = (id) => {
    const me = getList().find(p => p.id === id);
    onCancel(id);
    if (me) alert(`${me.nickname}님과 팀원이 해제되었습니다.`);
  };

  const handleAutoClick = () => { onAutoAssign(); };
  const handleResetClick = () => { setScoreDraft({}); onReset(); };

  const manualContext = (pId) => (e) => {
    e.preventDefault();
    handleManualClick(pId, { altKey: true });
  };
  const nameContext = (p) => (e) => {
    e.preventDefault();
    handleAltOnNickname(p, { altKey: true });
  };

  useEffect(() => {
    console.log('[Step7] participants:', participants);
  }, [participants]);

  const renderList = getList();

  /* ───────────────────────────────────────────────────────────
     ★★★ ADD: 포볼도 “업로드 직후” 잔여값을 절대 끌고 오지 않도록
     참가자 시드 지문(fingerprint) 변경 시 한 번만 강제 초기화
  ─────────────────────────────────────────────────────────── */
  const seedOf = (list=[]) => {
    try {
      const base = (list || []).map(p => [String(p.id ?? ''), String(p.nickname ?? ''), Number(p.group ?? 0)]);
      base.sort((a,b)=> (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      return JSON.stringify(base);
    } catch { return ''; }
  };
  useEffect(() => {
    if (!eventId || !Array.isArray(renderList) || renderList.length === 0) return;
    const seed = seedOf(renderList);
    const key  = `seedfp:${eventId}:fourball`;
    const prev = sessionStorage.getItem(key);

    if (prev !== seed) {
      (async () => {
        try {
          // 1) scores 전체 null
          const colRef = collection(db, 'events', eventId, 'scores');
          const snap   = await getDocs(colRef);
          await Promise.all(
            snap.docs.map(d =>
              setDoc(d.ref, { score: null, room: null, updatedAt: serverTimestamp() }, { merge: true })
            )
          );
        } catch (e) {
          console.warn('[Step7] clear scores on seed change failed:', e?.message || e);
        }
        try {
          // 2) participants도 한 번 클린 커밋(방/점수/파트너 제거)
          const cleared = (renderList || []).map(p => ({ ...p, room: null, score: null, partner: null }));
          setParticipants(cleared);
          if (typeof updateEventImmediate === 'function') {
            const compat = cleared.map(cp => ({
              ...cp,
              roomNumber: cp.room ?? null,
              teammateId: cp.partner ?? null,
              teammate:   cp.partner ?? null,
            }));
            await updateEventImmediate({ participants: compat, roomTable: {}, participantsUpdatedAt: serverTimestamp() }, false);
          }
        } catch (e) {
          console.warn('[Step7] participants clear on seed change failed:', e?.message || e);
        }
      })();
      sessionStorage.setItem(key, seed);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, renderList, setParticipants, updateEventImmediate]);
  /* ─────────────────────────────────────────────────────────── */

  return (
    <div className={styles.step} style={__pageStyle}>
      <div className={styles.participantRowHeader}>
        <div className={`${styles.cell} ${styles.group}`}>조</div>
        <div className={`${styles.cell} ${styles.nickname}`}>닉네임</div>
        <div className={`${styles.cell} ${styles.handicap}`}>G핸디</div>
        <div className={`${styles.cell} ${styles.score}`}>점수</div>
        <div className={`${styles.cell} ${styles.manual}`}>수동</div>
        <div className={`${styles.cell} ${styles.force}`}>취소</div>
      </div>

      <div className={styles.participantTable}>
        {renderList.map(p => {
          const done       = isGroup1(p) && isCompleted(p.id);
          const scoreValue = scoreDraft[p.id] ?? (p.score ?? '');

          return (
            <div key={p.id} className={styles.participantRow}>
              <div className={`${styles.cell} ${styles.group}`}>
                <input type="text" value={`${p.group}조`} disabled />
              </div>

              <div
                className={`${styles.cell} ${styles.nickname}`}
                onClick={(e)=>handleAltOnNickname(p, e)}
                onContextMenu={nameContext(p)}
                title="Alt/롱프레스: 개인 이동/트레이드 (1조↔1조, 2조↔2조)"
              >
                <input type="text" value={p.nickname} readOnly />
              </div>

              <div className={`${styles.cell} ${styles.handicap}`}>
                <input type="text" value={p.handicap} disabled />
              </div>

              <div className={`${styles.cell} ${styles.score}`}>
                <input
                  type="text"
                  inputMode="decimal"
                  /* ★ FIX: 최신 브라우저 v-flag 호환 */
                  pattern="[-0-9.]*"
                  autoComplete="off"
                  value={scoreValue}
                  onChange={e => handleScoreInputChange(p.id, e.target.value)}
                  onBlur={() => handleScoreBlur(p.id)}
                  onPointerDown={() => startLongPress(p.id)}
                  onPointerUp={() => cancelLongPress(p.id)}
                  onPointerLeave={() => cancelLongPress(p.id)}
                  onTouchEnd={() => cancelLongPress(p.id)}
                />
              </div>

              <div className={`${styles.cell} ${styles.manual}`}>
                {isGroup1(p) ? (
                  <button
                    className={styles.smallBtn}
                    onClick={(e) => {
                      if (done && !e.altKey) return;
                      handleManualClick(p.id, e);
                    }}
                    onContextMenu={manualContext(p.id)}
                    aria-disabled={done || (loadingId === p.id)}
                    style={{
                      opacity: (done || loadingId === p.id) ? 0.5 : 1,
                      cursor: (done && !loadingId) ? 'not-allowed' : 'pointer'
                    }}
                    title="Alt/롱프레스: 페어(2명) 강제 이동/트레이드"
                  >
                    {loadingId === p.id
                      ? <span className={styles.spinner}/>
                      : done ? '완료' : '수동'}
                  </button>
                ) : (
                  <div style={{ width: 28, height: 28 }} />
                )}
              </div>

              <div className={`${styles.cell} ${styles.force}`}>
                {isGroup1(p) ? (
                  <button className={styles.smallBtn} onClick={() => handleCancelClick(p.id)}>
                    취소
                  </button>
                ) : (
                  <div style={{ width: 28, height: 28 }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={styles.stepFooter}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: __safeBottom,
          zIndex: 20,
          boxSizing: 'border-box',
          padding: '12px 16px',
          background: '#fff',
          borderTop: '1px solid #e5e5e5',
        }}
      >
        <button onClick={goPrev}>← 이전</button>
        <button onClick={handleAutoClick} className={styles.textOnly}>자동배정</button>
        <button onClick={handleResetClick} className={styles.textOnly}>초기화</button>
        <button onClick={goNext}>다음 →</button>
      </div>
    </div>
  );
}
