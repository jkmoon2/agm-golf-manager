// src/screens/Step5.jsx
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

    // 🔧 (옵션) 컨텍스트에 이미 존재한다면 실시간 저장에 사용
    updateParticipant,        // (id, patch) => Promise<void> | void
    updateParticipantsBulk,   // (changes: Array<{id, fields}>) => Promise<void> | void
  } = useContext(StepContext);

  

// ★ patch: Firestore(events/{eventId})에 participants[] 즉시 커밋을 위한 컨텍스트 + 헬퍼
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
          // ch: { id, fields }
          await updateParticipant(ch.id, ch.fields);
        }
      }
      // else: 컨텍스트에 동기화 함수가 없으면 조용히 패스(기존 코드 유지)
    } catch (e) {
      console.warn('[Step5] syncChanges failed:', e);
    }
    // ★ patch: 이벤트 문서 participants[]를 단일 소스로 즉시 커밋
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

  // ── 1) 점수 변경 ──
  const onScoreChange = (id, value) => {
    const v = value === '' ? null : Number(value);
    setParticipants(ps =>
      ps.map(p => (p.id === id ? { ...p, score: v } : p))
    );
    // 점수도 실시간 저장(있다면)
    syncChanges([{ id, fields: { score: v } }]);
  };

  // ── 2) 수동 배정 ──
  const onManualAssign = (id) => {
    setLoadingId(id);
    setTimeout(async () => {
      let chosen = null;
      let targetNickname = null;

      setParticipants(ps => {
        const target = ps.find(p => p.id === id);
        if (!target) return ps;
        targetNickname = target.nickname;

        // 같은 조에서 이미 배정된 방(최신 상태 기준)
        const usedRooms = ps
          .filter(p => p.group === target.group && p.room != null)
          .map(p => p.room);

        // 남은 방 무작위 선택
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
        // 실시간 저장(있다면)
        await syncChanges([{ id, fields: { room: chosen } }]);
      } else {
        alert('남은 방이 없습니다.');
        await syncChanges([{ id, fields: { room: null } }]);
      }
    }, 600); // 기존 딜레이 유지
  };

  // ── 3) 강제 배정/취소 ──
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

      // ✅ room이 null(취소)일 때는 절대 스왑하지 않음
      if (room == null) {
        return next;
      }

      // room이 숫자인 경우에만, 같은 조의 기존 occupant를 prevRoom으로 이동
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

    // 실시간 저장(있다면)
    await syncChanges(changes);
  };

  // ── 4) 자동 배정 ──
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

    // 변경분만 동기화(있다면)
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

  // ── 5) 초기화 ──
  const onReset = async () => {
    setParticipants(ps =>
      ps.map(p => ({ ...p, room: null, score: null, selected: false }))
    );
    // 실시간 저장(있다면)
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
          return (
            <div key={p.id} className={styles.participantRow}>
              {/* 그룹, 닉네임, 핸디캡, 점수 */}
              <div className={`${styles.cell} ${styles.group}`}>
                <input type="text" value={`${p.group}조`} disabled />
              </div>
              <div className={`${styles.cell} ${styles.nickname}`}>
                <input type="text" value={p.nickname} disabled />
              </div>
              <div className={`${styles.cell} ${styles.handicap}`}>
                <input type="text" value={p.handicap} disabled />
              </div>
              <div className={`${styles.cell} ${styles.score}`}>
                <input
                  type="number"
                  value={p.score != null ? p.score : ''}
                  onChange={e => onScoreChange(p.id, e.target.value)}
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