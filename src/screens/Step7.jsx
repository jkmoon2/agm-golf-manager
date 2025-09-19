// /src/screens/Step7.jsx

import React, { useState, useContext } from 'react';
import styles from './Step7.module.css';
import { StepContext } from '../flows/StepFlow';
// [ADD] 라이브 이벤트 보조(참고용: 렌더에 직접 사용하지 않아 기존 흐름 100% 유지)
import { EventContext } from '../contexts/EventContext';
import { useEventLiveQuery } from '../live/useEventLiveQuery';

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
    goNext
  } = useContext(StepContext);
  const [loadingId, setLoadingId] = useState(null);

  // [ADD] 이벤트 아이디만 받아서 백그라운드 구독(로깅/확인용)
  const { eventId } = useContext(EventContext) || {};
  useEventLiveQuery(eventId); // ← 기존 동작은 그대로, 실시간 소스는 컨텍스트 쪽이 담당

  const isCompleted = id => {
    const me = participants.find(p => p.id === id);
    return !!(me && me.room != null && me.partner != null);
  };

  // ★ 변경: async + await onManualAssign(id)
  const handleManualClick = async (id) => {
    if (isCompleted(id)) return;
    setLoadingId(id);

    // 수동 배정 결과를 확실히 받아온다.
    const { roomNo, nickname, partnerNickname } = await onManualAssign(id); // ★

    setTimeout(() => {
      const label = roomNames[roomNo - 1]?.trim() || `${roomNo}번 방`;
      alert(
        `${nickname}님은 ${label}에 배정되었습니다.\n` +
        `팀원을 선택하려면 확인을 눌러주세요.`
      );

      setLoadingId(id);

      setTimeout(() => {
        if (partnerNickname) {
          alert(`${nickname}님은 ${partnerNickname}님을 선택했습니다.`);
        }
        setLoadingId(null);
      }, 900);

    }, 900);
  };

  const handleCancelClick = id => {
    const me = participants.find(p => p.id === id);
    onCancel(id);
    if (me) {
      alert(`${me.nickname}님과 팀원이 해제되었습니다.`);
    }
  };

  const handleAutoClick = () => {
    onAutoAssign();
  };

  const handleResetClick = () => {
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

          return (
            <div key={p.id} className={styles.participantRow}>
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
