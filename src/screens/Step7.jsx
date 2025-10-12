// /src/screens/Step7.jsx

import React, { useState, useContext, useRef, useEffect } from 'react';
import styles from './Step7.module.css';
import { StepContext } from '../flows/StepFlow';
import { EventContext } from '../contexts/EventContext';

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

  // ★ patch: 방 우선순위/이벤트 데이터
  const { eventId, updateEventImmediate, eventData } = useContext(EventContext) || {};

  const [loadingId, setLoadingId] = useState(null);
  const [scoreDraft, setScoreDraft] = useState({});
  const pressTimers = useRef({});

  const TIMINGS = { preAlert: 1200, partnerPick: 1400 };
  const MAX_ROOM_CAPACITY = 4; // 포볼 정원

  // ─ helpers ─
  const isGroup1 = (p) => Number.isFinite(Number(p?.group))
    ? (Number(p.group) % 2 === 1)
    : (p.id % 2 === 1);

  const countInRoom = (list, roomNo) =>
    (list || []).filter(p => Number(p?.room) === Number(roomNo)).length;

  // ★ patch: 최근 비어있지 않았던 participants 캐시(초기화 직후 공백 방지)
  const lastNonEmptyRef = useRef([]);
  useEffect(() => {
    if (Array.isArray(participants) && participants.length > 0) {
      lastNonEmptyRef.current = participants;
    }
  }, [participants]);

  // ★ patch: 항상 “현재 유효한 목록”을 가져오기
  const getList = () =>
    (Array.isArray(participants) && participants.length > 0)
      ? participants
      : (lastNonEmptyRef.current || []);

  // ★ patch: 운영자 정의 방번호(예: '10번방' → 10) 목록 추출
  const getCustomRoomNumbers = () => {
    const names = Array.isArray(roomNames) ? roomNames : [];
    const nums = names.map(n => {
      if (typeof n !== 'string') return NaN;
      const m = n.match(/(\d+)/);
      return m ? Number(m[1]) : NaN;
    }).filter(v => Number.isFinite(v));
    // 유효성: 길이가 roomNames와 같고, 중복 없음
    const unique = new Set(nums);
    return (nums.length === names.length && unique.size === nums.length) ? nums : null;
  };

  // ★ patch: "신규 방 우선" 우선순위 목록
  const getRoomPriority = () => {
    const n = Array.isArray(roomNames) ? roomNames.length : 0;
    const fromEvent =
      eventData && Array.isArray(eventData.roomPriority) ? eventData.roomPriority : null;

    if (fromEvent && fromEvent.length) {
      return fromEvent.map(Number).filter(r => r >= 1 && r <= n);
    }

    // 운영자 정의 방번호가 있다면 그 순서를 우선 사용(인덱스 1..N의 순서는 동일하지만 추천/탐색 기준으로 사용)
    const custom = getCustomRoomNumbers();
    if (custom) {
      // custom 순서 그대로 인덱스 1..N로 매핑
      return Array.from({ length: n }, (_, i) => i + 1);
    }

    // 기본: 큰 번호(최근 생성 가정)부터
    return Array.from({ length: n }, (_, i) => n - i); // n..1
  };

  // ★ patch: 방 입력값을 “운영자 정의 번호 → 해당 인덱스”로 우선 해석
  //   1) 운영자 정의 번호 목록에서 일치 번호 찾으면 → 해당 방 인덱스(1-base)
  //   2) 없으면 1..N 인덱스로 해석
  const resolveTargetRoom = (raw) => {
    const num = Number(raw);
    const total = Array.isArray(roomNames) ? roomNames.length : 0;
    if (!Number.isFinite(num) || total === 0) return null;

    const custom = getCustomRoomNumbers();
    if (custom) {
      const idx = custom.indexOf(num);
      if (idx !== -1) return idx + 1; // 이름(파란박스) 기준
    }
    // 운영자 정의가 없을 때: 1..N(빨간박스) 기준
    if (num >= 1 && num <= total) return num;
    return null;
  };

  // ★ patch: 선호 방이 가득 찼을 때 "신규 방 우선"으로 대체 방 선택
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

  // ★ patch: 방 안의 "팀(페어)" 리스트( [ {g1,g2} , ... ] )
  const getTeamsInRoom = (list, roomNo) => {
    const g1s = getGroup1InRoom(list, roomNo);
    return g1s.map(g1 => {
      const g2 = (list || []).find(p => String(p.id) === String(g1.partner));
      return g2 ? { g1, g2 } : null;
    }).filter(Boolean);
  };

  const isPartialNumber = (s) => /^-?\d*\.?\d*$/.test(s);

  const handleScoreInputChange = (id, raw) => {
    if (!isPartialNumber(raw)) return;
    setScoreDraft(d => ({ ...d, [id]: raw }));
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    const v = Number(raw);
    if (!Number.isNaN(v)) {
      if (typeof onScoreChange === 'function') onScoreChange(id, v);
      else if (typeof setParticipants === 'function')
        setParticipants(ps => ps.map(p => p.id === id ? { ...p, score: v } : p));
    }
  };
  const handleScoreBlur = (id) => {
    const raw = scoreDraft[id];
    if (raw === undefined) return;
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.')
      if (typeof onScoreChange === 'function') onScoreChange(id, null);
      else if (typeof setParticipants === 'function')
        setParticipants(ps => ps.map(p => p.id === id ? { ...p, score: null } : p));
    setScoreDraft(d => { const { [id]:_, ...rest } = d; return rest; });
  };

  const startLongPress = (id, current) => {
    try { if (pressTimers.current[id]) clearTimeout(pressTimers.current[id]); } catch {}
    pressTimers.current[id] = setTimeout(() => {
      const cur = String(current ?? '');
      const next = cur.startsWith('-') ? cur : (cur ? '-' + cur : '-');
      handleScoreInputChange(id, next);
    }, 1000);
  };
  const cancelLongPress = (id) => {
    try { if (pressTimers.current[id]) clearTimeout(pressTimers.current[id]); } catch {}
    pressTimers.current[id] = null;
  };

  const isCompleted = id => {
    const me = getList().find(p => p.id === id);
    return !!(me && me.room != null && me.partner != null);
  };

  // 저장(이벤트 문서 동시 호환)
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

  // ★ patch: participants 길이가 0이면 커밋 금지(초기화 직후 공백 반영 방지)
  const commitParticipantsNow = async (list) => {
    try {
      if (!Array.isArray(list) || list.length === 0) return;
      if (updateEventImmediate && eventId) {
        const compat = (list || []).map(compatParticipant);
        const roomTable = buildRoomTable(compat);
        await updateEventImmediate(roomTable ? { participants: compat, roomTable } : { participants: compat });
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
    } catch (e) {
      console.warn('[Step7] commitParticipantsNow failed:', e);
    }
  };

  // participants 변경 시 안전 저장(비어있으면 skip)
  const lastCommittedHashRef = useRef('');
  const commitTimerRef = useRef(null);
  useEffect(() => {
    if (!Array.isArray(participants) || participants.length === 0) return; // ★ patch
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

  // ★ patch: 페어(2명) 강제 이동 + 가득 찬 방이면 트레이드
  const forceMovePairToRoom = async (id, targetRoom) => {
    const list = [...getList()];
    const pair = getPairForGroup1(id, list);
    if (pair.length === 0) return;

    const srcRoom = Number(pair[0]?.room);
    const occ = countInRoom(list, targetRoom);

    // 자리 여유 → 그냥 이동
    if (occ <= MAX_ROOM_CAPACITY - pair.length) {
      const ids = new Set(pair.map(x => String(x.id)));
      const next = list.map(p => ids.has(String(p.id)) ? { ...p, room: targetRoom } : p);
      await commitParticipantsNow(next);
      alert(`강제 이동 완료: ${pair[0]?.nickname ?? ''}${pair[1] ? ' 팀 포함' : ''} → ${targetRoom}번 방`);
      return;
    }

    // 가득(4명) → 두 팀 중 선택하여 페어-페어 트레이드
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

  // ─ 개인 이동/트레이드 (현 로직 유지, getList 적용) ─
  const moveOrTradeGroup2 = async (idGroup2, targetRoom) => {
    const list = [...getList()];
    const me2 = list.find(p => String(p.id) === String(idGroup2));
    if (!me2) return alert('대상을 찾을 수 없습니다.');
    if (isGroup1(me2)) return alert('해당 동작은 2조만 가능합니다.');
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

  // ★ patch: 닉네임 Alt/우클릭/롱프레스 → 개인 이동/교체
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

  // ★ patch: 수동 Alt/우클릭/롱프레스 → 페어 이동/트레이드
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

    // 완료 상태면 일반 클릭은 막고(비활성화), Alt/롱프레스만 허용
    if (isCompleted(id)) return;

    setLoadingId(id);

    // 기존 수동 배정 로직
    const res = await onManualAssign(id);
    const { roomNo, roomNumber, nickname, partnerNickname } = res || {};
    const finalRoom = roomNo ?? roomNumber ?? null;

    // 배정 직후 정원 초과 교정(신규 방 우선)
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

  // ★ patch: 모바일 Alt 대체 — 컨텍스트 메뉴(롱프레스/우클릭) 사용
  const manualContext = (pId) => (e) => {
    e.preventDefault();
    handleManualClick(pId, { altKey: true });
  };
  const nameContext = (p) => (e) => {
    e.preventDefault();
    handleAltOnNickname(p, { altKey: true });
  };

  const renderList = getList(); // ★ patch: 화면은 항상 유효 목록으로

  return (
    <div className={styles.step}>
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
          const done     = isGroup1(p) && isCompleted(p.id);
          const scoreValue = scoreDraft[p.id] ?? (p.score ?? '');

          return (
            <div key={p.id} className={styles.participantRow}>
              <div className={`${styles.cell} ${styles.group}`}>
                <input type="text" value={`${p.group}조`} disabled />
              </div>

              {/* 닉네임: Alt 클릭 + 우클릭/롱프레스 지원 (readOnly로 이벤트 수신) */}
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
                  pattern="[0-9.\\-]*"
                  autoComplete="off"
                  value={scoreValue}
                  onChange={e => handleScoreInputChange(p.id, e.target.value)}
                  onBlur={() => handleScoreBlur(p.id)}
                  onMouseDown={() => startLongPress(p.id, scoreValue)}
                  onTouchStart={() => startLongPress(p.id, scoreValue)}
                  onMouseUp={() => cancelLongPress(p.id)}
                  onMouseLeave={() => cancelLongPress(p.id)}
                  onTouchEnd={() => cancelLongPress(p.id)}
                />
              </div>

              <div className={`${styles.cell} ${styles.manual}`}>
                {isGroup1(p) ? (
                  <button
                    className={styles.smallBtn}
                    onClick={(e) => {
                      // 완료면 일반 클릭 무시(비활성화), Alt/롱프레스만 허용
                      if (done && !e.altKey) return;
                      handleManualClick(p.id, e);
                    }}
                    onContextMenu={manualContext(p.id)} // 모바일 롱프레스
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

      <div className={styles.stepFooter}>
        <button onClick={goPrev}>← 이전</button>
        <button onClick={handleAutoClick} className={styles.textOnly}>자동배정</button>
        <button onClick={handleResetClick} className={styles.textOnly}>초기화</button>
        <button onClick={goNext}>다음 →</button>
      </div>
    </div>
  );
}
