// /src/screens/Step5.jsx

import React, { useState, useEffect, useContext, useRef } from 'react';
import { StepContext } from '../flows/StepFlow';
import { EventContext } from '../contexts/EventContext'; // ★ patch
import styles from './Step5.module.css';

if (process.env.NODE_ENV!=='production') console.log('[AGM] Step5 render');

export default function Step5() {
  const {
    participants,
    setParticipants,
    roomCount,
    roomNames,   // ★ 반드시 꺼내오기
    goPrev,
    goNext,

    updateParticipant,        // (id, patch)
    updateParticipantsBulk,   // (changes[])
  } = useContext(StepContext);

  // ★ Firestore 즉시 커밋 헬퍼 (기존 유지)
  const { eventId, updateEventImmediate } = useContext(EventContext) || {};
  const buildNextFromChanges = (baseList, changes) => {
    try {
      const map = new Map((baseList || []).map(p => [String(p.id), { ...p }]));
      (changes || []).forEach(({ id, fields }) => {
        const key = String(id);
        const cur = map.get(key) || {};
        map.set(key, { ...cur, ...(fields || {}) });
      });
      return Array.from(map.values());
    } catch (e) {
      console.warn('[Step5] buildNextFromChanges error:', e);
      return baseList || [];
    }
  };

  const [loadingId, setLoadingId] = useState(null);
  const [forceSelectingId, setForceSelectingId] = useState(null);

  // [ADD] 점수 입력 드래프트 상태(안드로이드 키보드 대응: -, . 중간상태 허용)
  const [scoreDraft, setScoreDraft] = useState({}); // { [id]: '입력중 문자열' }

  // [ADD] 다른 디바이스에서 초기화가 일어나면 여기 draft도 바로 정리
  useEffect(() => {
    if (!Array.isArray(participants)) return;
    const allNull =
      participants.length > 0 &&
      participants.every(p => p == null || p.score == null || String(p.score).trim() === '');
    if (allNull) {
      // 전체가 초기화된 상태라면 로컬 draft도 싹 비움
      setScoreDraft({});
      return;
    }
    // 일부만 변경된 경우: 서버값이 null로 내려온 사람의 draft는 제거
    setScoreDraft(prev => {
      let changed = false;
      const next = { ...prev };
      participants.forEach(p => {
        const key = p?.id;
        if (key == null) return;
        const hasDraft = Object.prototype.hasOwnProperty.call(prev, key);
        if ((p.score == null || String(p.score).trim() === '') && hasDraft) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [participants]);

  // 방 번호 1~roomCount 배열
  const rooms = Array.from({ length: roomCount }, (_, i) => i + 1);

  // ===== Firestore 동기화(있으면 사용, 없으면 no-op) =====
  const canBulk = typeof updateParticipantsBulk === 'function';
  const canOne  = typeof updateParticipant === 'function';
  const syncChanges = async (changes) => {
    try {
      if (canBulk) {
        await updateParticipantsBulk(changes);
      } else if (canOne) {
        for (const ch of changes) {
          await updateParticipant(ch.id, ch.fields);
        }
      }
    } catch (e) {
      console.warn('[Step5] syncChanges failed:', e);
    }
    // ★ 이벤트 문서 participants[]를 단일 소스로 즉시 커밋
    try {
      if (typeof updateEventImmediate === 'function' && eventId) {
        const base = participants || [];
        const next = buildNextFromChanges(base, changes);
        await updateEventImmediate({ participants: next });
      }
    } catch (e) {
      console.warn('[Step5] updateEventImmediate(participants) failed:', e);
    }
  };

  // ── 1) 점수 변경(텍스트 입력 + 중간 상태 허용) ──
  const isPartialNumber = (s) => /^-?\d*\.?\d*$/.test(s); // -, -., 3. 등 허용
  const onScoreInputChange = (id, raw) => {
    if (!isPartialNumber(raw)) return;           // 허용하지 않는 문자는 무시
    setScoreDraft(d => ({ ...d, [id]: raw }));   // 먼저 로컬 드래프트 반영
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
      // 중간상태는 아직 커밋하지 않음 → 깜빡임/튕김 방지
      return;
    }
    const v = Number(raw);
    if (!Number.isNaN(v)) {
      setParticipants(ps => ps.map(p => (p.id === id ? { ...p, score: v } : p)));
      syncChanges([{ id, fields: { score: v } }]);
    }
  };
  const onScoreBlur = (id) => {
    const raw = scoreDraft[id];
    if (raw === undefined) return;
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
      // 비어있는 상태로 종료 → 점수 null 처리
      setParticipants(ps => ps.map(p => (p.id === id ? { ...p, score: null } : p)));
      syncChanges([{ id, fields: { score: null } }]);
    }
    setScoreDraft(d => { const { [id]:_, ...rest } = d; return rest; });
  };

  // [ADD] 롱프레스(1초)로 '-' 삽입
  const holdRef = useRef({}); // { [id]: { timer, x, y } }
  const LONG_PRESS_MS = 1000;
  const MOVE_CANCEL_PX = 10;
  const ensureHold = (id) => {
    if (!holdRef.current[id]) holdRef.current[id] = { timer: null, x:0, y:0 };
    return holdRef.current[id];
  };
  const startHold = (id, e) => {
    const h = ensureHold(id);
    if (h.timer) clearTimeout(h.timer);
    h.x = (e && 'clientX' in e) ? e.clientX : 0;
    h.y = (e && 'clientY' in e) ? e.clientY : 0;
    h.timer = setTimeout(() => {
      setScoreDraft(d => {
        const cur = String(d?.[id] ?? '');
        if (cur.startsWith('-')) return d;
        const next = { ...d, [id]: cur ? `-${cur}` : '-' };
        return next;
      });
      try { if (navigator.vibrate) navigator.vibrate(10); } catch {}
    }, LONG_PRESS_MS);
  };
  const moveHold = (id, e) => {
    const h = ensureHold(id);
    if (!h.timer) return;
    const dx = Math.abs((e.clientX ?? 0) - h.x);
    const dy = Math.abs((e.clientY ?? 0) - h.y);
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
      clearTimeout(h.timer); h.timer = null;
    }
  };
  const endHold = (id) => {
    const h = ensureHold(id);
    if (h.timer) { clearTimeout(h.timer); h.timer = null; }
  };
  const preventContextMenu = (e) => { e.preventDefault(); };

  // ── 2) 수동 배정 ── (기존 유지)
  const onManualAssign = (id) => {
    setLoadingId(id);
    setTimeout(async () => {
      let chosen = null;
      let targetNickname = null;

      setParticipants(ps => {
        const target = ps.find(p => p.id === id);
        if (!target) return ps;
        targetNickname = target.nickname;

        const usedRooms = ps
          .filter(p => p.group === target.group && p.room != null)
          .map(p => p.room);

        const available = rooms.filter(r => !usedRooms.includes(r));
        chosen = available.length
          ? available[Math.floor(Math.random() * available.length)]
          : null;

        return ps.map(p => (p.id === id ? { ...p, room: chosen } : p));
      });

      setLoadingId(null);

      if (chosen != null) {
        const displayName = roomNames[chosen - 1]?.trim() || `${chosen}번 방`;
        alert(`${targetNickname}님은 ${displayName}에 배정되었습니다.`);
        await syncChanges([{ id, fields: { room: chosen } }]);
      } else {
        alert('남은 방이 없습니다.');
        await syncChanges([{ id, fields: { room: null } }]);
      }
    }, 600); // 기존 딜레이 유지
  };

  // ── 3) 강제 배정/취소 ── (기존 유지)
  const onForceAssign = async (id, room) => {
    let targetNickname = null;
    let prevRoom = null;
    const changes = [];

    setParticipants(ps => {
      const target = ps.find(p => p.id === id);
      if (!target) return ps;
      targetNickname = target.nickname;
      prevRoom = target.room ?? null;

      let next = ps.map(p => (p.id === id ? { ...p, room } : p));
      changes.push({ id, fields: { room } });

      if (room == null) {
        return next;
      }

      const occupant = ps.find(
        p => p.group === target.group && p.room === room && p.id !== id
      );
      if (occupant) {
        next = next.map(p =>
          p.id === occupant.id ? { ...p, room: prevRoom } : p
        );
        changes.push({ id: occupant.id, fields: { room: prevRoom } });
      }
      return next;
    });

    setForceSelectingId(null);

    if (room != null) {
      const displayName = roomNames[room - 1]?.trim() || `${room}번 방`;
      alert(`${targetNickname}님은 ${displayName}에 강제 배정되었습니다.`);
    } else {
      alert(`${targetNickname}님의 방 배정이 취소되었습니다.`);
    }

    await syncChanges(changes);
  };

  // ── 4) 자동 배정 ── (기존 유지)
  const onAutoAssign = async () => {
    let nextSnapshot = null;
    setParticipants(ps => {
      let updated = [...ps];
      const groups = Array.from(new Set(updated.map(p => p.group)));

      groups.forEach(group => {
        const assigned = updated
          .filter(p => p.group === group && p.room != null)
          .map(p => p.room);
        const unassigned = updated.filter(
          p => p.group === group && p.room == null
        );
        const slots = rooms.filter(r => !assigned.includes(r));
        const shuffled = [...slots].sort(() => Math.random() - 0.5);

        unassigned.forEach((p, idx) => {
          const r = shuffled[idx] ?? null;
          updated = updated.map(x => (x.id === p.id ? { ...x, room: r } : x));
        });
      });

      nextSnapshot = updated;
      return updated;
    });

    if (nextSnapshot) {
      const changes = [];
      nextSnapshot.forEach((p, i) => {
        const old = participants[i];
        if (!old || old.room !== p.room) {
          changes.push({ id: p.id, fields: { room: p.room ?? null } });
        }
      });
      await syncChanges(changes);
    }
  };

  // ── 5) 초기화 ── (기존 유지 + draft도 즉시 삭제)
  const onReset = async () => {
    setParticipants(ps =>
      ps.map(p => ({ ...p, room: null, score: null, selected: false }))
    );
    const changes = participants.map(p => ({
      id: p.id,
      fields: { room: null, score: null, selected: false },
    }));
    // [ADD] 로컬 드래프트도 즉시 비움 → 이 디바이스에서도 바로 리셋 표시
    setScoreDraft({});
    await syncChanges(changes);
  };

  useEffect(() => {
    console.log('[Step5] participants:', participants);
  }, [participants]);

  // ───────────────────────────────────────────────────────────────
  // [ADD2] participants 변경 감지 → 이벤트 문서에 "전체 배열" 즉시 커밋 (안전한 디바이스간 동기화)
  //  - 기존 syncChanges는 이 컴포넌트가 변경을 일으킬 때만 개별 patch를 보냄
  //  - 외부(다른 컴포넌트/디바이스)로 인해 participants가 갱신된 경우에도
  //    본 컴포넌트가 즉시 전체 participants를 커밋하여 일관성 강화
  //  - 과도한 쓰기를 막기 위해 deep-equal 대신 해시(JSON 문자열) 비교 + 디바운스 적용
  // ───────────────────────────────────────────────────────────────
  const lastCommittedHashRef = useRef('');
  const commitTimerRef = useRef(null);

  useEffect(() => {
    if (typeof updateEventImmediate !== 'function' || !eventId || !Array.isArray(participants)) return;

    const nextHash = (() => {
      try { return JSON.stringify(participants); } catch { return String(Date.now()); }
    })();

    if (nextHash === lastCommittedHashRef.current) return;

    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(async () => {
      try {
        await updateEventImmediate({ participants });
        lastCommittedHashRef.current = nextHash;
      } catch (e) {
        console.warn('[Step5][commit-on-change] failed:', e);
      }
    }, 250); // 디바운스(과도한 쓰기 방지)
  }, [participants, updateEventImmediate, eventId]);
  // ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.step}>
      {/* 컬럼 헤더 */}
      <div className={styles.participantRowHeader}>
        <div className={`${styles.cell} ${styles.group}`}>조</div>
        <div className={`${styles.cell} ${styles.nickname}`}>닉네임</div>
        <div className={`${styles.cell} ${styles.handicap}`}>G핸디</div>
        <div className={`${styles.cell} ${styles.score}`}>점수</div>
        <div className={`${styles.cell} ${styles.manual}`}>수동</div>
        <div className={`${styles.cell} ${styles.force}`}>강제</div>
      </div>

      {/* 참가자 리스트 */}
      <div className={styles.participantTable}>
        {participants.map(p => {
          const isDisabled = loadingId === p.id || p.room != null;
          const scoreValue = scoreDraft[p.id] ?? (p.score != null ? String(p.score) : '');
          return (
            <div key={p.id} className={styles.participantRow}>
              <div className={`${styles.cell} ${styles.group}`}>
                <input type="text" value={`${p.group}조`} disabled />
              </div>
              <div className={`${styles.cell} ${styles.nickname}`}>
                <input type="text" value={p.nickname} disabled />
              </div>
              <div className={`${styles.cell} ${styles.handicap}`}>
                <input type="text" value={p.handicap} disabled />
              </div>

              {/* [FIX] 숫자 입력: text + inputMode + draft */}
              <div className={`${styles.cell} ${styles.score}`}>
                <input
                  type="text"               // [FIX] number → text
                  inputMode="decimal"       // [ADD] 안드로이드 키보드에 소수점 표시
                  pattern="[0-9.\\-]*"      // [ADD] 허용 문자
                  autoComplete="off"
                  value={scoreValue}
                  onChange={e => onScoreInputChange(p.id, e.target.value)}
                  onBlur={() => onScoreBlur(p.id)}
                  // [ADD] 롱프레스 1초 → '-' 삽입
                  onPointerDown={(e) => startHold(p.id, e)}
                  onPointerUp={() => endHold(p.id)}
                  onPointerCancel={() => endHold(p.id)}
                  onPointerLeave={() => endHold(p.id)}
                  onPointerMove={(e) => moveHold(p.id, e)}
                  onContextMenu={preventContextMenu}
                />
              </div>

              {/* 수동 버튼 */}
              <div className={`${styles.cell} ${styles.manual}`}>
                <button
                  className={styles.smallBtn}
                  disabled={isDisabled}
                  onClick={() => onManualAssign(p.id)}
                >
                  {loadingId === p.id ? <span className={styles.spinner} /> : '수동'}
                </button>
              </div>

              {/* 강제 버튼 & 메뉴 */}
              <div className={`${styles.cell} ${styles.force}`} style={{ position: 'relative' }}>
                <button
                  className={styles.smallBtn}
                  onClick={() =>
                    setForceSelectingId(forceSelectingId === p.id ? null : p.id)
                  }
                >
                  강제
                </button>
                {forceSelectingId === p.id && (
                  <div className={styles.forceMenu}>
                    {rooms.map(r => {
                      const name = roomNames[r - 1]?.trim() || `${r}번 방`;
                      return (
                        <div
                          key={r}
                          className={styles.forceOption}
                          onClick={() => onForceAssign(p.id, r)}
                        >
                          {name}
                        </div>
                      );
                    })}
                    <div
                      className={styles.forceOption}
                      onClick={() => onForceAssign(p.id, null)}
                    >
                      취소
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단 내비게이션 */}
      <div className={styles.stepFooter}>
        <button onClick={goPrev}>← 이전</button>
        <button onClick={onAutoAssign} className={styles.textOnly}>자동배정</button>
        <button onClick={onReset} className={styles.textOnly}>초기화</button>
        <button onClick={goNext}>다음 →</button>
      </div>
    </div>
  );
}
