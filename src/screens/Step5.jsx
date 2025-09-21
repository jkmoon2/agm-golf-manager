// /src/screens/Step5.jsx

import React, { useState, useEffect, useContext } from 'react';
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

  // ── 5) 초기화 ── (기존 유지)
  const onReset = async () => {
    setParticipants(ps =>
      ps.map(p => ({ ...p, room: null, score: null, selected: false }))
    );
    const changes = participants.map(p => ({
      id: p.id,
      fields: { room: null, score: null, selected: false },
    }));
    await syncChanges(changes);
  };

  useEffect(() => {
    console.log('[Step5] participants:', participants);
  }, [participants]);

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
                  pattern="[0-9.\-]*"       // [ADD] 허용 문자
                  autoComplete="off"
                  value={scoreValue}
                  onChange={e => onScoreInputChange(p.id, e.target.value)}
                  onBlur={() => onScoreBlur(p.id)}
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
