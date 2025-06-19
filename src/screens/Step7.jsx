import React, { useState, useContext } from 'react';
import styles from './Step7.module.css';
import { StepContext } from '../flows/StepFlow';

export default function Step7() {
  const {
    participants,
    onScoreChange,
    handleAgmManualAssign: onManualAssign,
    handleAgmCancel:       onCancel,
    handleAgmAutoAssign:   onAutoAssign,
    handleAgmReset:        onReset,
    goPrev:                onPrev,
    goNext:                onNext
  } = useContext(StepContext);

  const half = (participants || []).length / 2;
  const [loadingId, setLoadingId] = useState(null);

  // 이미 파트너가 있으면 disable
  const isCompleted = id => {
    const me = participants.find(p => p.id === id);
    return !me || me.room == null
      ? false
      : participants.some(p => p.room === me.room && p.id !== id);
  };

  // 수동 클릭: spinner + delay, alert는 StepFlow에서 한 번만
  const handleManualClick = id => {
    if (isCompleted(id)) return;
    setLoadingId(id);
    onManualAssign(id);
    setTimeout(() => {
      setLoadingId(null);
    }, 600);
  };

  // 취소 클릭: alert은 StepFlow.handleAgmCancel에서 한 번만
  const handleCancelClick = id => {
    onCancel(id);
  };

  // 자동 클릭: alert 제거
  const handleAutoClick = () => {
    onAutoAssign();
  };

  // 초기화 클릭
  const handleResetClick = () => {
    onReset();
  };

  return (
    <div className={styles.step}>

      {/* 헤더 */}
      <div className={styles.participantRowHeader}>
        <div className={`${styles.cell} ${styles.group}`}>조</div>
        <div className={`${styles.cell} ${styles.nickname}`}>닉네임</div>
        <div className={`${styles.cell} ${styles.handicap}`}>G핸디</div>
        <div className={`${styles.cell} ${styles.score}`}>점수</div>
        <div className={`${styles.cell} ${styles.manual}`}>수동</div>
        <div className={`${styles.cell} ${styles.force}`}>취소</div>
      </div>

      {/* 리스트 */}
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

              {/* 수동 버튼 */}
              <div className={`${styles.cell} ${styles.manual}`}>
                {isGroup1 ? (
                  <button
                    className={styles.smallBtn}
                    onClick={() => handleManualClick(p.id)}
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

              {/* 취소 버튼 */}
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

      {/* 하단 네비 */}
      <div className={styles.stepFooter}>
        <button onClick={onPrev}>← 이전</button>
        <button onClick={handleAutoClick} className={styles.textOnly}>자동배정</button>
        <button onClick={handleResetClick} className={styles.textOnly}>초기화</button>
        <button onClick={onNext}>다음 →</button>
      </div>
    </div>
  );
}
