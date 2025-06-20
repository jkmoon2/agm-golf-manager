import React, { useState, useContext } from 'react';
import styles from './Step7.module.css';
import { StepContext } from '../flows/StepFlow';

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
    goNext
  } = useContext(StepContext);

  const half = participants.length / 2;
  const [loadingId, setLoadingId] = useState(null);

  // “파트너까지 붙어 있으면 완료” 판단
  const isCompleted = id => {
    const me = participants.find(p => p.id === id);
    return !!(me && me.room != null && me.partner != null);
  };

  // 수동 클릭: 1) 수동 로직 호출 → 2) 500ms 뒤 alert 두 번 → 3) 스피너 종료
  const handleManualClick = id => {
    if (isCompleted(id)) return;

    setLoadingId(id);
    const { roomNo, nickname, partnerNickname } = onManualAssign(id);

    setTimeout(() => {
      const label = roomNames[roomNo - 1]?.trim() || `${roomNo}번 방`;

      // ① 방배정 안내
      alert(
        `${nickname}님은 ${label}에 배정되었습니다.\n` +
        `팀원을 선택하려면 확인을 눌러주세요.`
      );

      // ② partner 있으면
      if (partnerNickname) {
        alert(`${nickname}님은 ${partnerNickname}님을 선택했습니다.`);
      }

      // ③ 스피너 끄고 “완료” 상태로
      setLoadingId(null);
    }, 500);
  };

  // 취소 클릭
  const handleCancelClick = id => {
    const me = participants.find(p => p.id === id);
    onCancel(id);
    if (me) alert(`${me.nickname}님과 팀원이 해제되었습니다.`);
  };

  // 자동 클릭
  const handleAutoClick = () => {
    onAutoAssign();
  };

  // 초기화 클릭
  const handleResetClick = () => {
    onReset();
  };

  return (
    <div className={styles.step}>

      {/* 헤더 (변경なし) */}
      <div className={styles.participantRowHeader}>
        <div className={`${styles.cell} ${styles.group}`}>조</div>
        <div className={`${styles.cell} ${styles.nickname}`}>닉네임</div>
        <div className={`${styles.cell} ${styles.handicap}`}>G핸디</div>
        <div className={`${styles.cell} ${styles.score}`}>점수</div>
        <div className={`${styles.cell} ${styles.manual}`}>수동</div>
        <div className={`${styles.cell} ${styles.force}`}>취소</div>
      </div>

      {/* 리스트 (변경なし) */}
      <div className={styles.participantTable}>
        {participants.map(p => {
          const isGroup1 = p.id < half;
          const done     = isGroup1 && isCompleted(p.id);

          return (
            <div key={p.id} className={styles.participantRow}>
              {/* 조 */}
              <div className={`${styles.cell} ${styles.group}`}>
                <input type="text" value={isGroup1 ? '1조' : '2조'} disabled />
              </div>
              {/* 닉네임 */}
              <div className={`${styles.cell} ${styles.nickname}`}>
                <input type="text" value={p.nickname} disabled />
              </div>
              {/* G핸디 */}
              <div className={`${styles.cell} ${styles.handicap}`}>
                <input type="text" value={p.handicap} disabled />
              </div>
              {/* 점수 */}
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
                      : done
                        ? '완료'
                        : '수동'}
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

      {/* 하단 네비게이션 (변경なし) */}
      <div className={styles.stepFooter}>
        <button onClick={goPrev}>← 이전</button>
        <button onClick={handleAutoClick} className={styles.textOnly}>
          자동배정
        </button>
        <button onClick={handleResetClick} className={styles.textOnly}>
          초기화
        </button>
        <button onClick={goNext}>다음 →</button>
      </div>
    </div>
  );
}
