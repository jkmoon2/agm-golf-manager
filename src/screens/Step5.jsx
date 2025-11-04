// src/screens/Step5.jsx

import React, { useState, useEffect, useContext, useRef } from 'react';
import { StepContext } from '../flows/StepFlow';
import { EventContext } from '../contexts/EventContext';
import styles from './Step5.module.css';
import { serverTimestamp } from 'firebase/firestore';

// ★ ADD: Admin 화면에서도 scores를 직접 구독하여 즉시 반영
import { collection, onSnapshot, getDocs, setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

if (process.env.NODE_ENV !== 'production') console.log('[AGM] Step5 render');

export default function Step5() {
  const {
    participants,
    setParticipants,
    roomCount,
    roomNames,
    goPrev,
    goNext,
    updateParticipant,
    updateParticipantsBulk,
  } = useContext(StepContext);

  // ★ ADD: upsertScores 가져오기 (있으면 사용, 없어도 무관)
  const { eventId, updateEventImmediate, upsertScores } = useContext(EventContext) || {};

  // ★★★ ADD: scores 구독 → Admin 화면 로컬 participants에 즉시 머지 (Player가 점수 입력 시 즉시 보이도록)
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
  const __FOOTER_H = 56;
  const __safeBottom = `calc(env(safe-area-inset-bottom, 0px) + ${__bottomGap}px)`;
  const __pageStyle = {
    minHeight: '100dvh',
    boxSizing: 'border-box',
    paddingBottom: `calc(${__FOOTER_H}px + ${__safeBottom})`,
  };

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

  const [scoreDraft, setScoreDraft] = useState({});
  const inputRefs = useRef({});
  const longTimerRef = useRef(null);

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

  const rooms = Array.from({ length: roomCount }, (_, i) => i + 1);

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
      console.warn('[Step5] syncChanges failed:', e);
    }

    // ★★★ ADD: Admin → Player 브리지 (scores 업서트: score/room 만 추려서)
    try {
      if (typeof upsertScores === 'function' && Array.isArray(changes) && changes.length) {
        const payload = [];
        changes.forEach(({ id, fields }) => {
          if (!fields) return;
          const item = { id };
          let push = false;
          if (Object.prototype.hasOwnProperty.call(fields, 'score')) { item.score = fields.score ?? null; push = true; }
          if (Object.prototype.hasOwnProperty.call(fields, 'room'))  { item.room  = fields.room  ?? null; push = true; }
          if (push) payload.push(item);
        });
        if (payload.length) await upsertScores(payload);
      }
    } catch (e) {
      console.warn('[Step5] upsertScores from syncChanges failed:', e);
    }

    // 기존 동작 유지: 이벤트 문서 participants도 병행 저장
    try {
      if (typeof updateEventImmediate === 'function' && eventId) {
        const base = participants || [];
        const next = buildNextFromChanges(base, changes);
        await updateEventImmediate({ participants: next, participantsUpdatedAt: serverTimestamp() });
      }
    } catch (e) {
      console.warn('[Step5] updateEventImmediate(participants) failed:', e);
    }
  };

  const isPartialNumber = (v) => /^-?\d*\.?\d*$/.test(v);
  const onScoreChange = (id, raw) => {
    if (!isPartialNumber(raw)) return;
    setScoreDraft(d => ({ ...d, [id]: raw }));
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

  const startMinusLongPress = (id) => {
    try { if (longTimerRef.current) clearTimeout(longTimerRef.current); } catch {}
    longTimerRef.current = setTimeout(() => {
      setScoreDraft(d => {
        const cur = d[id] ?? (() => {
          const p = (participants || []).find(x => x.id === id);
          return p && p.score != null ? String(p.score) : '';
        })();
        if (String(cur).startsWith('-')) return d;
        const nextVal = cur === '' ? '-' : `-${String(cur).replace(/^-/, '')}`;
        const next = { ...d, [id]: nextVal };
        const el = inputRefs.current[id];
        if (el) { try { el.focus(); el.setSelectionRange(nextVal.length, nextVal.length); } catch {} }
        return next;
      });
    }, 600);
  };
  const cancelMinusLongPress = () => {
    try { if (longTimerRef.current) clearTimeout(longTimerRef.current); } catch {}
  };

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
    }, 600);
  };

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
      // ★ FIX: index 기반 → id 기반으로 비교 (안정화)
      const oldById = new Map((participants || []).map(p => [String(p.id), p]));
      nextSnapshot.forEach((p) => {
        const old = oldById.get(String(p.id));
        if (!old || old.room !== p.room) {
          changes.push({ id: p.id, fields: { room: p.room ?? null } });
        }
      });
      await syncChanges(changes);

      // ★★★ FIX(즉시반영 보강): 전체 스냅샷을 한 번 더 즉시 커밋
      try {
        if (typeof updateEventImmediate === 'function' && eventId) {
          await updateEventImmediate({ participants: nextSnapshot, participantsUpdatedAt: serverTimestamp() }, false);
        }
      } catch (e) {
        console.warn('[Step5] extra immediate commit failed:', e);
      }
    }
  };

  const onReset = async () => {
    setParticipants(ps => ps.map(p => ({ ...p, room: null, score: null, selected: false })));
    const changes = participants.map(p => ({
      id: p.id,
      fields: { room: null, score: null, selected: false },
    }));
    setScoreDraft({});
    await syncChanges(changes);
  };

  /* ───────────────────────────────────────────────────────────
     ★★★ ADD: “업로드 직후” 잔여값(이전 대회 scores)을 절대 끌고 오지 않도록
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
    if (!eventId || !Array.isArray(participants) || participants.length === 0) return;
    const seed = seedOf(participants);
    const key  = `seedfp:${eventId}:stroke`;
    const prev = sessionStorage.getItem(key);

    if (prev !== seed) {
      // 새 파일 업로드로 판단 → scores 서브컬렉션 전체를 null로 초기화 + participants도 클린 커밋
      (async () => {
        try {
          // 1) scores 모두 null로
          const colRef = collection(db, 'events', eventId, 'scores');
          const snap   = await getDocs(colRef);
          await Promise.all(
            snap.docs.map(d =>
              setDoc(d.ref, { score: null, room: null, updatedAt: serverTimestamp() }, { merge: true })
            )
          );
        } catch (e) {
          console.warn('[Step5] clear scores on seed change failed:', e?.message || e);
        }

        try {
          // 2) participants도 한 번 보정(수동 버튼 활성화/점수 리셋)
          const cleared = (participants || []).map(p => ({ ...p, room: null, score: null, selected: false }));
          setParticipants(cleared);
          if (typeof updateEventImmediate === 'function') {
            await updateEventImmediate({ participants: cleared, participantsUpdatedAt: serverTimestamp() }, false);
          }
        } catch (e) {
          console.warn('[Step5] participants clear on seed change failed:', e?.message || e);
        }
      })();

      sessionStorage.setItem(key, seed);
    }
  }, [eventId, participants, setParticipants, updateEventImmediate]);
  /* ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    console.log('[Step5] participants:', participants);
  }, [participants]);

  useEffect(() => {
    if (forceSelectingId == null) return;
    const handler = (e) => {
      const mid = String(forceSelectingId);
      const t = e.target;
      if (!t) return;
      const inMenu  = t.closest && t.closest(`[data-force-menu-for="${mid}"]`);
      const isToggle = t.closest && t.closest(`[data-force-toggle-for="${mid}"]`);
      if (!inMenu && !isToggle) setForceSelectingId(null);
    };
    document.addEventListener('pointerdown', handler, true);
    document.addEventListener('click', handler, true);
    return () => {
      document.removeEventListener('pointerdown', handler, true);
      document.removeEventListener('click', handler, true);
    };
  }, [forceSelectingId]);

  return (
    <div className={styles.step} style={__pageStyle}>
      <div className={styles.participantRowHeader}>
        <div className={`${styles.cell} ${styles.group}`}>조</div>
        <div className={`${styles.cell} ${styles.nickname}`}>닉네임</div>
        <div className={`${styles.cell} ${styles.handicap}`}>G핸디</div>
        <div className={`${styles.cell} ${styles.score}`}>점수</div>
        <div className={`${styles.cell} ${styles.manual}`}>수동</div>
        <div className={`${styles.cell} ${styles.force}`}>강제</div>
      </div>

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

              <div className={`${styles.cell} ${styles.score}`}>
                <input
                  ref={el => (inputRefs.current[p.id] = el)}
                  type="text"
                  inputMode="decimal"
                  /* ★ FIX: 최신 브라우저 v-flag 호환 */
                  pattern="[-0-9.]*"
                  autoComplete="off"
                  value={scoreValue}
                  onChange={e => onScoreChange(p.id, e.target.value)}
                  onBlur={() => onScoreBlur(p.id)}
                  onPointerDown={() => startMinusLongPress(p.id)}
                  onPointerUp={cancelMinusLongPress}
                  onPointerLeave={cancelMinusLongPress}
                  onTouchStart={() => startMinusLongPress(p.id)}
                  onTouchEnd={cancelMinusLongPress}
                />
              </div>

              <div className={`${styles.cell} ${styles.manual}`}>
                <button
                  className={styles.smallBtn}
                  disabled={isDisabled}
                  onClick={() => onManualAssign(p.id)}
                >
                  {loadingId === p.id ? <span className={styles.spinner} /> : '수동'}
                </button>
              </div>

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
                    {Array.from({ length: roomCount }, (_, i) => i + 1).map(r => {
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
        <button onClick={onAutoAssign} className={styles.textOnly}>자동배정</button>
        <button onClick={onReset} className={styles.textOnly}>초기화</button>
        <button onClick={goNext}>다음 →</button>
      </div>
    </div>
  );
}
