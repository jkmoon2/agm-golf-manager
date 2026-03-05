// src/screens/Step5.jsx

<<<<<<< Updated upstream
import React, { useState, useEffect, useContext } from 'react';
import { StepContext } from '../flows/StepFlow';
=======
import React, { useState, useEffect, useContext, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { StepContext } from '../flows/StepFlow';          // ✅ 경로 고정 (에러 방지)
import { EventContext } from '../contexts/EventContext';  // ✅ 경로 고정 (에러 방지)
import { serverTimestamp } from 'firebase/firestore';     // ✅ [ADD] participantsUpdatedAt 동기화용
>>>>>>> Stashed changes
import styles from './Step5.module.css';

export default function Step5() {
  const {
    participants,
    setParticipants,
    roomCount,
    roomNames,   // ★ 여기를 반드시 꺼내오셔야 합니다!
    goPrev,
    goNext
  } = useContext(StepContext);

<<<<<<< Updated upstream
=======
  // ✅ SSOT 통일: 점수는 /events/{eventId}/scores/{pid} 에만 저장(양방향 실시간)
  //    - Step5/7/Admin, Player 모두 동일한 scores를 읽고/쓰도록 정리
  //    - participants 배열에는 score를 영구 저장하지 않음(방배정/명단만 유지)
  const { eventId, updateEventImmediate, upsertScores, resetScores, scoresMap, scoresReady } = useContext(EventContext) || {};

  const rooms = useMemo(
    () => Array.from({ length: Number(roomCount || 0) }, (_, i) => i + 1),
    [roomCount]
  );

>>>>>>> Stashed changes
  const [loadingId, setLoadingId] = useState(null);
  const [forceSelectingId, setForceSelectingId] = useState(null);

  // 방 번호 1~roomCount 배열
  const rooms = Array.from({ length: roomCount }, (_, i) => i + 1);

  // ── 1) 점수 변경 ──
  const onScoreChange = (id, value) => {
    setParticipants(ps =>
      ps.map(p =>
        p.id === id
          ? { ...p, score: value === '' ? null : Number(value) }
          : p
      )
    );
  };

<<<<<<< Updated upstream
  // ── 2) 수동 배정 ──
  const onManualAssign = id => {
    setLoadingId(id);
    setTimeout(() => {
      const target = participants.find(p => p.id === id);
      if (!target) {
        setLoadingId(null);
=======
  const withRoomValue = (p, room) => {
    if (room === '' || room === undefined || room == null) {
      return { ...p, room: null, roomNumber: null };
    }
    const n = Number(room);
    const v = Number.isFinite(n) ? n : null;
    return { ...p, room: v, roomNumber: v };
  };


  useEffect(() => {
    latestParticipantsRef.current = participants;
  }, [participants]);
  // ✅ SSOT: 점수는 EventContext(scoresMap/scoresReady)가 events/{eventId}/scores 를 단일 구독합니다.
  //   - Step5는 별도 onSnapshot을 만들지 않고, scoresMap/scoresReady만 사용합니다.
  // ✅ (추가) Step5에서는 “중간영역만 스크롤” 되도록 body 스크롤 잠금 (타이틀 고정 문제 해결)
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // (A) 하단 버튼 위치를 Step4와 동일한 방식으로 맞추기 (bottomTabBar 높이 감지 + safe-area)
  // ─────────────────────────────────────────────────────────────────────────────
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
      } catch (e) {}
    };
    probe();
    window.addEventListener('resize', probe);
    return () => window.removeEventListener('resize', probe);
  }, []);

  const __FOOTER_H = 56;
  const __safeBottom = `calc(env(safe-area-inset-bottom, 0px) + ${__bottomGap}px)`;

  const pageStyle = {
    height: '100dvh',
    overflow: 'hidden',
    boxSizing: 'border-box',
    // footer가 fixed라서, 본문이 footer 밑으로 들어가지 않게 paddingBottom 확보
    paddingBottom: `calc(${__FOOTER_H}px + ${__safeBottom})`,
    display: 'flex',
    flexDirection: 'column',
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // (B) Firestore에 participants[] 커밋 (A안: onBlur 시점에만 1회 커밋)
  //  - updateEventImmediate({participants}, false) 로 “스킵” 방지
  // ─────────────────────────────────────────────────────────────────────────────
  const syncParticipantsToEvent = useCallback(
    async (nextList) => {
      if (!eventId || typeof updateEventImmediate !== 'function') return;

      // ✅ in-flight면 "마지막 요청"만 저장해두고 종료 (마지막이 승리)
      if (syncInFlightRef.current) {
        queuedSyncRef.current = nextList || [];
>>>>>>> Stashed changes
        return;
      }

      // 같은 조에서 이미 배정된 방
      const usedRooms = participants
        .filter(p => p.group === target.group && p.room != null)
        .map(p => p.room);

      // 남은 방 무작위 선택
      const available = rooms.filter(r => !usedRooms.includes(r));
      const choice = available.length
        ? available[Math.floor(Math.random() * available.length)]
        : null;

      // 상태 반영
      setParticipants(ps =>
        ps.map(p =>
          p.id === id ? { ...p, room: choice } : p
        )
      );
      setLoadingId(null);

      if (choice != null) {
        // 변경된 방이름 우선, 없으면 “N번 방”
        const displayName =
          roomNames[choice - 1]?.trim() || `${choice}번 방`;
        alert(`${target.nickname}님은 ${displayName}에 배정되었습니다.`);
      } else {
        alert('남은 방이 없습니다.');
      }
    }, 600);   // ← 이 숫자를 늘리면 딜레이 시간이 길어집니다.
  };

  // ── 3) 강제 배정 ──
  const onForceAssign = (id, room) => {
    const target = participants.find(p => p.id === id);
    const prevRoom = target?.room ?? null;

    // 해당 조에서 이미 그 방에 있는 참가자 인덱스
    const swapIdx = participants.findIndex(
      p => p.group === target.group && p.room === room
    );

    // 교환 로직: 본인→room, 기존 occupant→prevRoom
    setParticipants(ps =>
      ps.map(p => {
        if (p.id === id) {
          return { ...p, room };
        }
        if (swapIdx >= 0 && p.id === participants[swapIdx].id) {
          return { ...p, room: prevRoom };
        }
        return p;
      })
    );
    setForceSelectingId(null);

    if (room != null && target) {
      const displayName =
        roomNames[room - 1]?.trim() || `${room}번 방`;
      alert(`${target.nickname}님은 ${displayName}에 강제 배정되었습니다.`);
    }
  };

  // ── 4) 자동 배정 ──
  const onAutoAssign = () => {
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
        const shuffled = slots.sort(() => Math.random() - 0.5);

        unassigned.forEach((p, idx) => {
          const r = shuffled[idx] ?? null;
          updated = updated.map(x =>
            x.id === p.id ? { ...x, room: r } : x
          );
        });
      });

      return updated;
    });
  };

  // ── 5) 초기화 ──
  const onReset = () => {
    setParticipants(ps =>
      ps.map(p => ({ ...p, room: null, score: null, selected: false }))
    );
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

<<<<<<< Updated upstream
              {/* 수동 버튼 */}
              <div className={`${styles.cell} ${styles.manual}`}>
                <button
                  className={styles.smallBtn}
                  disabled={isDisabled}
                  onClick={() => onManualAssign(p.id)}
                >
                  {loadingId === p.id
                    ? <span className={styles.spinner} />
                    : '수동'}
                </button>
              </div>
=======
              // ✅ 실시간 반영 우선순위 (Step7과 동일)
              // - 편집 중(scoreRaw)은 로컬 입력값 유지
              // - 그 외에는 Firestore scores(SSOT)가 있으면 그 값을 우선 표시
              // - score가 null로 지워진 경우도 즉시 반영되도록 '문서 존재 여부(undef)'로 판단
              const pidStr = String(p.id);
              const map = scoresMap || {};
              const ready = !!scoresReady;
              const hasLiveKey = Object.prototype.hasOwnProperty.call(map, pidStr);
              const liveScore = hasLiveKey ? map[pidStr] : null;

              // ✅ 실시간 반영 우선순위 (Step7과 동일, SSOT 단일 구독)
              // - 편집 중(scoreRaw)은 로컬 입력값 유지
              // - scoresReady 이전에는 기존 participants.score를 유지(깜박임 방지)
              // - scoresReady 이후에는 scoresMap이 SSOT: 키가 없으면 ''(미입력)로 간주
              const displayScore =
                p.scoreRaw !== undefined
                  ? p.scoreRaw
                  : ready
                    ? (hasLiveKey ? (liveScore == null ? '' : liveScore) : '')
                    : (hasLiveKey
                        ? (liveScore == null ? '' : liveScore)
                        : (p.score != null ? p.score : ''));
>>>>>>> Stashed changes

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
