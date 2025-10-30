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
    updateParticipant,        // (id, patch) => Promise<void> | void
    updateParticipantsBulk,   // (changes: Array<{id, fields}>) => Promise<void> | void
  } = useContext(StepContext);

  const { eventId, updateEventImmediate } = useContext(EventContext) || {};

  // ── helper: 변경분을 기존 리스트에 반영해 이벤트 문서로 커밋할 payload 구성 ──
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
      console.warn('[Step5] buildNextFromChanges error:', e);
      return baseList || [];
    }
  };

  const [loadingId, setLoadingId] = useState(null);
  const [forceSelectingId, setForceSelectingId] = useState(null);

  // ── 모바일 숫자 입력 안정화를 위한 draft 상태 ──
  const [scoreDraft, setScoreDraft] = useState({}); // { [id]: '입력중 문자열' }

  // participants 외부 갱신 시 draft 정리
  useEffect(() => {
    if (!Array.isArray(participants)) return;
    setScoreDraft(prev => {
      const next = { ...prev };
      let changed = false;
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
    // 이벤트 문서 participants[]에도 반영(단, 우리가 만든 변경 시점에만 호출)
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

  // ── 1) 점수 변경(드래프트 유지 + blur/Enter 시 커밋) ──
  const isPartialNumber = (v) => /^-?\d*\.?\d*$/.test(v);
  const onScoreChange = (id, raw) => {
    if (!isPartialNumber(raw)) return;            // 허용치 외 무시
    setScoreDraft(d => ({ ...d, [id]: raw }));    // 입력 중엔 draft에만 유지
  };
  const onScoreBlur = (id) => {
    const raw = scoreDraft[id];
    if (raw === undefined) return;
    let v = null;
    if (!(raw === '' || raw === '-' || raw === '.' || raw === '-.')) {
      const num = Number(raw);
      v = Number.isNaN(num) ? null : num;
    }
    setParticipants(ps => ps.map(p => (p.id === id ? { ...p, score: v } : p)));
    syncChanges([{ id, fields: { score: v } }]);
    setScoreDraft(d => { const { [id]:_, ...rest } = d; return rest; });
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

        // 동일 조에서 이미 배정된 방 번호
        const usedRooms = ps
          .filter(p => p.group === target.group && p.room != null)
          .map(p => p.room);

        // 남은 방 (무작위)
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
    }, 600); // 기존 딜레이 존중
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

      // 같은 조에서 이미 room을 쓰고 있으면 서로 스왑
      if (room != null) {
        const occupant = ps.find(p => p.group === target.group && p.room === room && p.id !== id);
        if (occupant) {
          next = next.map(p => (p.id === occupant.id ? { ...p, room: prevRoom } : p));
          changes.push({ id: occupant.id, fields: { room: prevRoom } });
        }
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
        const unassigned = updated.filter(p => p.group === group && p.room == null);
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

  // ── 5) 초기화 ──
  const onReset = async () => {
    setParticipants(ps => ps.map(p => ({ ...p, room: null, score: null, selected: false })));
    const changes = participants.map(p => ({
      id: p.id,
      fields: { room: null, score: null, selected: false },
    }));
    setScoreDraft({}); // draft도 즉시 비움
    await syncChanges(changes);
  };

  useEffect(() => {
    console.log('[Step5] participants:', participants);
  }, [participants]);

  // ★ NEW: 강제 메뉴 바깥 클릭 시 닫힘
  useEffect(() => {
    if (forceSelectingId == null) return;
    const handler = (e) => {
      const mid = String(forceSelectingId);
      const t = e.target;
      if (!t) return;
      const inMenu  = t.closest && t.closest(`[data-force-menu-for="${mid}"]`);
      const isToggle = t.closest && t.closest(`[data-force-toggle-for="${mid}"]`);
      if (!inMenu && !isToggle) {
        setForceSelectingId(null);
      }
    };
    document.addEventListener('pointerdown', handler, true);
    document.addEventListener('click', handler, true);
    return () => {
      document.removeEventListener('pointerdown', handler, true);
      document.removeEventListener('click', handler, true);
    };
  }, [forceSelectingId]);

  // iOS 하단 고정용 스페이서 높이 (bottom tab + footer + gap)
  const APP_BOTTOM_BAR = 64;      // 전역에서 --app-bottom-bar-height로 재정의 가능
  const STEP5_FOOTER_H = 56;      // 버튼 영역 추정 높이
  const FOOTER_GAP     = 8;       // ★ NEW: 아이콘 탭과의 간격
  const FOOTER_SPACE   = APP_BOTTOM_BAR + STEP5_FOOTER_H + FOOTER_GAP + 12;

  return (
    // ★ NEW: 컬럼 레이아웃 + 100dvh
    <div className={styles.step} style={{ display:'flex', flexDirection:'column', minHeight:'100dvh' }}>
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
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.\\-]*"
                  autoComplete="off"
                  value={scoreValue}
                  onChange={e => onScoreChange(p.id, e.target.value)}
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
                  data-force-toggle-for={p.id}
                  onClick={() => setForceSelectingId(forceSelectingId === p.id ? null : p.id)}
                >
                  강제
                </button>
                {forceSelectingId === p.id && (
                  <div className={styles.forceMenu} data-force-menu-for={p.id}>
                    {rooms.map(r => {
                      const name = roomNames[r - 1]?.trim() || `${r}번 방`;
                      return (
                        <div key={r} className={styles.forceOption} onClick={() => onForceAssign(p.id, r)}>
                          {name}
                        </div>
                      );
                    })}
                    <div className={styles.forceOption} onClick={() => onForceAssign(p.id, null)}>
                      취소
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ★ NEW: 푸터가 본문을 가리지 않도록 스페이서 */}
      <div aria-hidden="true" style={{ height: FOOTER_SPACE }} />

      {/* 하단 내비게이션 */}
      <div
        className={styles.stepFooter}
        style={{
          position: 'fixed',
          // ★ MARGIN FIX: 좌/우 여백(전역 변수 지원)
          left: 'var(--page-side-gutter, 12px)',
          right: 'var(--page-side-gutter, 12px)',
          // ★ MARGIN FIX: 아이콘 탭과의 간격(전역 변수 지원)
          bottom: 'calc(var(--app-bottom-bar-height, 64px) + env(safe-area-inset-bottom) + var(--footer-gap, 8px))',
          background: '#fff',
          borderTop: '1px solid #e5e5e5',
          zIndex: 20,
        }}
      >
        <button onClick={goPrev}>← 이전</button>
        <button onClick={onAutoAssign} className={styles.textOnly}>자동배정</button>
        <button onClick={onReset} className={styles.textOnly}>초기화</button>
        <button onClick={goNext}>다음 →</button>
      </div>
    </div>
  );
}
