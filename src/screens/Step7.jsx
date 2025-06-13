// src/screens/Step7.jsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Step7.module.css';

export default function Step7({
  participants,    // [{ id, group, nickname, handicap, score, room, partner }, …]
  rooms,           // [1,2,…N]
  roomNames,       // [“첫번째방이름”, “두번째방이름”, …]
  onScoreChange,   // (id, value) => void
  onManualAssign,  // (id) => void       (App.js 의 handleAgmManualAssign)
  onCancel,        // (id) => void       (App.js 의 handleAgmCancel)
  onAutoAssign,    // () => void         (App.js 의 handleAgmAutoAssign)
  onReset,         // () => void         (App.js 의 handleAgmReset)
  onPrev,          // () => void (이전)
  onNext           // () => void (다음)
}) {
  const navigate = useNavigate();
  const half = (participants || []).length / 2;  // 보호 추가
  const [loadingId, setLoadingId] = useState(null);

  // “이미 partner가 있는 1조인지 확인” (partner 짝이 이미 있는 상태라면 disable)
  const isCompleted = id => {
    const p1 = (participants || []).find(p => p.id === id);
    if (!p1 || p1.room == null) return false;
    return (participants || []).some(
      p => p.id >= half && p.room === p1.room
    );
  };

  function handleAgmAssign(id) {
    if (isCompleted(id)) return;
    setLoadingId(id);
    setTimeout(() => {
      onManualAssign(id);
      setLoadingId(null);
    }, 500);
  }

  return (
    <div className={styles.step}>

      {/* 테이블 헤더 */}
      <div className={styles.participantRowHeader}>
        <div className={`${styles.cell} ${styles.group}`}>조</div>
        <div className={`${styles.cell} ${styles.nickname}`}>닉네임</div>
        <div className={`${styles.cell} ${styles.handicap}`}>G핸디</div>
        <div className={`${styles.cell} ${styles.score}`}>점수</div>
        <div className={`${styles.cell} ${styles.manual}`}>수동</div>
        <div className={`${styles.cell} ${styles.force}`}>취소</div>
      </div>

      {/* 참가자 리스트 */}
      <div className={styles.participantTable}>
        {(participants || []).map(p => {
          const isGroup1 = p.id < half;
          const done     = isGroup1 && isCompleted(p.id);

          return (
            <div className={styles.participantRow} key={p.id}>
              <div className={`${styles.cell} ${styles.group}`}>  
                <input type="text" value={isGroup1 ? '1조' : '2조'} disabled />
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
                  value={p.score ?? ''}
                  onChange={e => onScoreChange(p.id, e.target.value)}
                />
              </div>

              <div className={`${styles.cell} ${styles.manual}`}>  
                {isGroup1 ? (
                  <button
                    className={styles.smallBtn}
                    onClick={() => handleAgmAssign(p.id)}
                    disabled={done || loadingId === p.id}
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
                {isGroup1 ? (
                  <button
                    className={styles.smallBtn}
                    onClick={() => { if (!p.room) return; onCancel(p.id); }}
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

      {/* 하단 버튼 */}
      <div className={styles.stepFooter}>
        <button onClick={() => navigate('/step/6')}>← 이전</button>
        <button onClick={onAutoAssign} className={styles.textOnly}>자동배정</button>
        <button onClick={onReset}     className={styles.textOnly}>초기화</button>
        <button onClick={() => navigate('/step/8')}>다음 →</button>
      </div>
    </div>
  );
}