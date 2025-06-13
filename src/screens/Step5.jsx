// src/screens/Step5.jsx

import React, { useState, useEffect, useContext } from 'react';
import { StepContext } from '../flows/StepFlow';
import styles from './Step5.module.css';

export default function Step5() {
  const {
    participants,
    setParticipants,
    roomCount,
    goPrev,
    goNext
  } = useContext(StepContext);

  const [loadingId, setLoadingId] = useState(null);
  const [forceSelectingId, setForceSelectingId] = useState(null);

  // 방 번호 배열 (1번부터 roomCount번 방)
  const rooms = Array.from({ length: roomCount }, (_, i) => i + 1);

  // 1) 점수 변경
  const onScoreChange = (id, value) => {
    setParticipants(ps =>
      ps.map(p =>
        p.id === id
          ? { ...p, score: value === '' ? null : Number(value) }
          : p
      )
    );
  };

  // 2) 수동 배정 (기존 안정화 로직)
  const onManualAssign = id => {
    setLoadingId(id);
    setTimeout(() => {
      const target = participants.find(p => p.id === id);
      if (!target) {
        setLoadingId(null);
        return;
      }
      const usedRooms = participants
        .filter(p => p.group === target.group && p.room != null)
        .map(p => p.room);
      const available = rooms.filter(r => !usedRooms.includes(r));
      const choice = available.length
        ? available[Math.floor(Math.random() * available.length)]
        : null;
      setParticipants(ps =>
        ps.map(p =>
          p.id === id ? { ...p, room: choice } : p
        )
      );
      setLoadingId(null);
      if (choice != null) {
        alert(`${target.nickname}님은 ${choice}번 방에 배정되었습니다.`);
      } else {
        alert('남은 방이 없습니다.');
      }
    }, 500);
  };

  // 3) 강제 배정
  const onForceAssign = (id, room) => {
    setParticipants(ps =>
      ps.map(p => (p.id === id ? { ...p, room } : p))
    );
    setForceSelectingId(null);
  };

  // 4) 자동 배정 (수동 배정 고정 + 나머지 무작위 방 슬롯 배정)
  const onAutoAssign = () => {
    setParticipants(ps => {
      // 1) 결과 복사
      let updated = [...ps];
      // 2) 모든 그룹 식별
      const groups = Array.from(new Set(updated.map(p => p.group)));
      groups.forEach(group => {
        // a) 해당 그룹의 수동 배정된 방
        const assignedRooms = updated
          .filter(p => p.group === group && p.room != null)
          .map(p => p.room);
        // b) 해당 그룹의 미배정 참가자
        const unassigned = updated.filter(
          p => p.group === group && p.room == null
        );
        // c) 그룹 별 전체 방 슬롯 (1~roomCount)
        const slots = rooms
          .filter(r => /* 각 방에 한 슬롯만 */ true)
          .filter(r => !assignedRooms.includes(r));
        // d) 슬롯 무작위 섞기
        const shuffled = slots.sort(() => Math.random() - 0.5);
        // e) 미배정 참가자에게 순서대로 할당
        unassigned.forEach((p, idx) => {
          const room = shuffled[idx] ?? null;
          updated = updated.map(x =>
            x.id === p.id ? { ...x, room } : x
          );
        });
      });
      return updated;
    });
  };

  // 5) 초기화
  const onReset = () => {
    setParticipants(ps =>
      ps.map(p => ({ ...p, room: null, score: null, selected: false }))
    );
  };

  // 디버그 로그
  useEffect(() => {
    console.log('[Step5] participants:', participants);
  }, [participants]);

  return (
    <div className={styles.step}>
      {/* ─── 컬럼 타이틀 ─── */}
      <div className={styles.participantRowHeader}>
        <div className={`${styles.cell} ${styles.group}`}>조</div>
        <div className={`${styles.cell} ${styles.nickname}`}>닉네임</div>
        <div className={`${styles.cell} ${styles.handicap}`}>G핸디</div>
        <div className={`${styles.cell} ${styles.score}`}>점수</div>
        <div className={`${styles.cell} ${styles.manual}`}>수동</div>
        <div className={`${styles.cell} ${styles.force}`}>강제</div>
      </div>

      {/* ─── 참가자 리스트 ─── */}
      <div className={styles.participantTable}>
        {(participants || []).map(p => {
          const isDisabled = loadingId === p.id || p.room != null;
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
                  type="number"
                  value={p.score != null ? p.score : ''}
                  onChange={e => onScoreChange(p.id, e.target.value)}
                />
              </div>
              <div className={`${styles.cell} ${styles.manual}`}>
                <button
                  className={styles.smallBtn}
                  disabled={isDisabled}
                  onClick={() => onManualAssign(p.id)}
                >
                  {loadingId === p.id
                    ? <span className={styles.spinner} />
                    : '수동'
                  }
                </button>
              </div>
              <div
                className={`${styles.cell} ${styles.force}`}
                style={{ position: 'relative' }}
              >
                <button
                  className={styles.smallBtn}
                  onClick={() =>
                    setForceSelectingId(
                      forceSelectingId === p.id ? null : p.id
                    )
                  }
                >
                  강제
                </button>
                {forceSelectingId === p.id && (
                  <div className={styles.forceMenu}>
                    {rooms.map(r => (
                      <div
                        key={r}
                        className={styles.forceOption}
                        onClick={() => onForceAssign(p.id, r)}
                      >
                        {r}번 방
                      </div>
                    ))}
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

      {/* ─── 하단 버튼 ─── */}
      <div className={styles.stepFooter}>
        <button onClick={goPrev}>← 이전</button>
        <button onClick={onAutoAssign} className={styles.textOnly}>
          자동배정
        </button>
        <button onClick={onReset} className={styles.textOnly}>
          초기화
        </button>
        <button onClick={goNext}>다음 →</button>
      </div>
    </div>
  );
}
