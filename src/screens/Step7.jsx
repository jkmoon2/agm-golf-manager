import React, { useState, useContext } from 'react';
import styles from './Step7.module.css';
import { StepContext } from '../flows/StepFlow';

export default function Step7() {
  const {
    participants,
    onScoreChange,
    handleAgmManualAssign: onManualAssign,
    handleAgmCancel: onCancel,
    handleAgmAutoAssign: onAutoAssign,
    handleAgmReset: onReset,
    goPrev: onPrev,
    goNext: onNext
  } = useContext(StepContext);

  const half = (participants || []).length / 2;
  const [loadingId, setLoadingId] = useState(null);

  // 이미 파트너가 있으면 disable
  const isCompleted = id => {
    const me = participants.find(p => p.id === id);
    if (!me || me.room == null) return false;
    return participants.some(p => p.room === me.room && p.id !== id);
  };

  // 수동 클릭: onManualAssign 한 번만 호출, 스피너 + 딜레이
  const handleManualClick = id => {
    if (isCompleted(id)) return;
    setLoadingId(id);
    onManualAssign(id);

    setTimeout(() => {
      const me = participants.find(p => p.id === id);
      const partner = participants.find(p => p.room === me.room && p.id !== id);
      const roomLabel = `${me.room}번 방`;

      alert(
        `${me.nickname}님은 ${roomLabel}에 배정되었습니다.` +
        (partner
          ? `\n팀원으로 ${partner.nickname}님을 선택했습니다.`
          : `\n팀원을 선택하려면 확인을 눌러주세요.`)
      );
      setLoadingId(null);
    }, 600);
  };

  // 취소 클릭: partner 있을 때만 활성화, 한 번만 알림
  const handleCancelClick = id => {
    const me = participants.find(p => p.id === id);
    onCancel(id);
    // alert은 onCancel 안에서 한 번만 실행되도록 이미 구현됨
  };

  // 자동 클릭: 알림 없이 onAutoAssign
  const handleAutoClick = () => {
    onAutoAssign();
  };

  // 초기화 클릭
  const handleResetClick = () => {
    onReset();
  };

  return (
    <div className={styles.step}>

      {/* 헤더 (원본 그대로) */}
      <div className={styles.participantRowHeader}>
        <div className={`${styles.cell} ${styles.group}`}>조</div>
        <div className={`${styles.cell} ${styles.nickname}`}>닉네임</div>
        <div className={`${styles.cell} ${styles.handicap}`}>G핸디</div>
        <div className={`${styles.cell} ${styles.score}`}>점수</div>
        <div className={`${styles.cell} ${styles.manual}`}>수동</div>
        <div className={`${styles.cell} ${styles.force}`}>취소</div>
      </div>

      {/* 참가자 리스트 (원본 그대로) */}
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

              {/* 수동 버튼: handleManualClick 한 번만 호출 */}
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

              {/* 취소 버튼: partner 있을 때만 활성화 */}
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

      {/* 하단 네비게이션 (원본 그대로) */}
      <div className={styles.stepFooter}>
        <button onClick={onPrev}>← 이전</button>
        <button onClick={handleAutoClick} className={styles.textOnly}>자동배정</button>
        <button onClick={handleResetClick} className={styles.textOnly}>초기화</button>
        <button onClick={onNext}>다음 →</button>
      </div>
    </div>
  );
}
