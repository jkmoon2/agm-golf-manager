// /src/screens/Step7.jsx

import React, { useState, useContext, useRef, useEffect } from 'react';
import styles from './Step7.module.css';
import { StepContext } from '../flows/StepFlow';
// [ADD] Player STEP1과 동일한 즉시 커밋용 컨텍스트(존재하면 사용, 없으면 무시)
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

    // [ADD2] 커밋 경로 이중화용(없으면 무시)
    setParticipants,
    updateParticipantsBulk,
    updateParticipant,
  } = useContext(StepContext);

  // [ADD] EventContext에서 즉시 커밋 함수 사용(있을 때만)
  const { eventId, updateEventImmediate } = useContext(EventContext) || {};

  const [loadingId, setLoadingId] = useState(null);

  // [ADD] 입력 드래프트 + 롱프레스 (기존 유지: 중간상태 허용)
  const [scoreDraft, setScoreDraft] = useState({});
  const pressTimers = useRef({});

  // [ADD] Player STEP1의 타이밍과 일치
  const TIMINGS = {
    preAlert: 1200,   // 첫 알림 전 간단한 대기
    partnerPick: 1400 // 파트너 선택 연출 시간(옵션)
  };

  const isPartialNumber = (s) => /^-?\d*\.?\d*$/.test(s);

  const handleScoreInputChange = (id, raw) => {
    if (!isPartialNumber(raw)) return;
    setScoreDraft(d => ({ ...d, [id]: raw }));
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    const v = Number(raw);
    if (!Number.isNaN(v)) {
      if (typeof onScoreChange === 'function') {
        onScoreChange(id, v);
      } else {
        // [ADD2] onScoreChange가 없거나 반영이 느릴 때 로컬 보정
        if (typeof setParticipants === 'function') {
          setParticipants(ps => ps.map(p => p.id === id ? { ...p, score: v } : p));
        }
      }
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

  // 롱프레스 1초 → '-' 삽입
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
    const me = participants.find(p => p.id === id);
    return !!(me && me.room != null && me.partner != null);
  };

  // [COMPAT] Player/STEP8이 읽는 스키마로 동시 저장(dual write)
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

  // [ADD2] 커밋 헬퍼: EventContext 즉시커밋 → 없으면 StepContext fallback
  const commitParticipantsNow = async (list) => {
    try {
      if (updateEventImmediate && eventId) {
        // [COMPAT] 호환형 + roomTable 병행 저장
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
            // [COMPAT] bulk에도 호환 키 같이 써주기(읽지 않으면 무시됨)
            roomNumber: p.room ?? null,
            teammateId: p.partner ?? null,
            teammate:   p.partner ?? null,
          }
        }));
        await updateParticipantsBulk(changes);
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

  // [ADD2] participants 변경시 이벤트 문서에 "안전하게" 즉시 커밋(해시 비교 + 디바운스)
  const lastCommittedHashRef = useRef('');
  const commitTimerRef = useRef(null);
  useEffect(() => {
    if (!Array.isArray(participants)) return;

    const nextHash = (() => {
      try { return JSON.stringify(participants); } catch { return String(Date.now()); }
    })();
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

  const handleManualClick = async (id) => {
    if (isCompleted(id)) return;
    setLoadingId(id);

    // 기존 onManualAssign 로직은 그대로 사용 (배정/파트너 선택까지 수행)
    const res = await onManualAssign(id);
    const { roomNo, roomNumber, nickname, partnerNickname } = res || {};
    const finalRoom = roomNo ?? roomNumber ?? null;

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
    const me = participants.find(p => p.id === id);
    onCancel(id);
    if (me) alert(`${me.nickname}님과 팀원이 해제되었습니다.`);
  };

  const handleAutoClick = () => { onAutoAssign(); };
  const handleResetClick = () => { 
    // [FIX-SCORE-RESET] 로컬 드래프트도 함께 초기화(모든 입력칸 즉시 공백 반영)
    setScoreDraft({});
    onReset(); 
  };

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
        {participants.map(p => {
          const isGroup1 = Number.isFinite(Number(p?.group)) ? (Number(p.group) % 2 === 1) : (p.id % 2 === 1);
          const done     = isGroup1 && isCompleted(p.id);
          const scoreValue = scoreDraft[p.id] ?? (p.score ?? '');

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
                {isGroup1 ? (
                  <button
                    className={styles.smallBtn}
                    onClick={() => handleManualClick(p.id)}
                    disabled={done || loadingId === p.id}
                  >
                    {loadingId === p.id
                      ? <span className={styles.spinner}/>
                      : done
                        ? '완료'
                        : '수동'}
                  </button>
                ) : (
                  <div style={{ width: 28, height: 28 }} />
                )}
              </div>

              <div className={`${styles.cell} ${styles.force}`}>
                {isGroup1 ? (
                  <button
                    className={styles.smallBtn}
                    onClick={() => handleCancelClick(p.id)}
                  >
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
