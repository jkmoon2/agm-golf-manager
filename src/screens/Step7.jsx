import React, { useState, useContext } from 'react';
import styles from './Step7.module.css';
import { StepContext } from '../flows/StepFlow';

export default function Step7() {
  const {
    participants,
    roomNames,
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

  // partner까지 있으면 완료
  const isCompleted = id => {
    const me = participants.find(p => p.id === id);
    return !!me && me.room != null && me.partner != null;
  };

  // 수동 클릭
  const handleManualClick = id => {
    if (isCompleted(id)) return;

    setLoadingId(id);

    // 바로 배정 로직 호출해서 결과 얻기
    const { roomNo, nickname, partnerNickname } = onManualAssign(id);

    // 0.5초 뒤 알림 띄우고 스피너 끄기
    setTimeout(() => {
      const label = roomNames[roomNo - 1]?.trim() || `${roomNo}번 방`;

      if (partnerNickname) {
        // 방+파트너 한 번에
        alert(
          `${nickname}님은 ${label}에 배정되었습니다.\n` +
          `팀원으로 ${partnerNickname}님을 선택했습니다.`
        );
      } else {
        // 방만
        alert(
          `${nickname}님은 ${label}에 배정되었습니다.\n` +
          `팀원을 선택하려면 확인을 눌러주세요.`
        );
      }

      setLoadingId(null);
    }, 500);
  };

  // 취소 클릭
  const handleCancelClick = id => {
    const me = participants.find(p => p.id === id);
    onCancel(id);
    if (me) {
      alert(`${me.nickname}님과 팀원이 해제되었습니다.`);
    }
  };

  // 자동 클릭 (alert 없음)
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

      {/* 하단 네비게이션 */}
      <div className={styles.stepFooter}>
        <button onClick={onPrev}>← 이전</button>
        <button onClick={handleAutoClick} className={styles.textOnly}>
          자동배정
        </button>
        <button onClick={handleResetClick} className={styles.textOnly}>
          초기화
        </button>
        <button onClick={onNext}>다음 →</button>
      </div>
    </div>
  );
}
