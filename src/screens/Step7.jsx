// /src/screens/Step7.jsx

import React, { useState, useContext, useRef } from 'react';
import styles from './Step7.module.css';
import { StepContext } from '../flows/StepFlow';

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

  // [ADD] 입력 드래프트 + 롱프레스
  const [scoreDraft, setScoreDraft] = useState({});
  const pressTimers = useRef({});
  const isPartialNumber = (s) => /^-?\d*\.?\d*$/.test(s);

  const handleScoreInputChange = (id, raw) => {
    if (!isPartialNumber(raw)) return;
    setScoreDraft(d => ({ ...d, [id]: raw }));
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    const v = Number(raw);
    if (!Number.isNaN(v)) onScoreChange(id, v);
  };
  const handleScoreBlur = (id) => {
    const raw = scoreDraft[id];
    if (raw === undefined) return;
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.')
      onScoreChange(id, null);
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

  const handleManualClick = async (id) => {
    if (isCompleted(id)) return;
    setLoadingId(id);
    const res = await onManualAssign(id);
    const { roomNo, nickname, partnerNickname } = res || {};
    setTimeout(() => {
      const label = roomNames[(roomNo ?? 0) - 1]?.trim() || (roomNo ? `${roomNo}번 방` : '');
      if (roomNo && nickname) {
        alert(`${nickname}님은 ${label}에 배정되었습니다.`);
        if (partnerNickname) alert(`${nickname}님은 ${partnerNickname}님을 선택했습니다.`);
      }
      setLoadingId(null);
    }, 300);
  };

  const handleCancelClick = (id) => {
    const me = participants.find(p => p.id === id);
    onCancel(id);
    if (me) alert(`${me.nickname}님과 팀원이 해제되었습니다.`);
  };

  const handleAutoClick = () => { onAutoAssign(); };
  const handleResetClick = () => { onReset(); };

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
                  pattern="[0-9.\-]*"
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
