// src/screens/Step7.jsx

import React, { useState, useContext } from 'react';
import styles from './Step7.module.css';
import { StepContext } from '../flows/StepFlow';
<<<<<<< Updated upstream
=======
import { EventContext } from '../contexts/EventContext';
import { serverTimestamp } from 'firebase/firestore';

const LONG_PRESS_MS = 600;
const MAX_ROOM_CAPACITY = 4;

// 점수 입력 시 부분 숫자(-, 빈문자 등) 허용하는 헬퍼 (기존 그대로)
function isPartialNumber(str) {
  if (str === '') return true;
  if (str === '-' || str === '.' || str === '-.') return true;
  return /^-?\d+(\.\d*)?$/.test(str);
}
>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
  const half = participants.length / 2;
  const [loadingId, setLoadingId] = useState(null);

  // “파트너까지 붙어 있으면 완료” 판단
  const isCompleted = id => {
    const me = participants.find(p => p.id === id);
=======
  const {
    eventId,
    updateEventImmediate,
    upsertScores,
    persistRoomsFromParticipants,
    scoresMap,
  } = useContext(EventContext) || {};

  // ✅ 자동 브리지(useEffect) ON/OFF 플래그 (기본 OFF)
  // - StepFlow(save)가 이미 participants를 저장하므로, Step7에서 추가로 events/rooms/scores를 때리면
  //   스냅샷 루프/쓰기 폭주가 발생할 수 있어 기본 OFF로 둡니다.
  const AUTO_BRIDGE_USEEFFECT = false;

  // 로딩 상태(수동 버튼용)
  const [loadingId, setLoadingId] = useState(null);

  // 점수 입력용 draft 상태(id → 문자열)
  const [scoreDraft, setScoreDraft] = useState({});

  const getDisplayScore = (pid, fallbackScore) => {
    if (Object.prototype.hasOwnProperty.call(scoreDraft || {}, pid)) {
      const v = scoreDraft?.[pid];
      return v == null ? '' : String(v);
    }
    const ss = scoresMap?.[pid];
    if (ss !== undefined) return ss == null ? '' : String(ss);
    return fallbackScore == null ? '' : String(fallbackScore);
  };
  const pressTimersRef = useRef({}); // 점수 입력 롱프레스용

  // ✅ “완료 버튼” 롱프레스용 타이머 & 플래그
  const manualPressTimersRef = useRef({});
  const manualLongPressFlagRef = useRef(false);

  // 하단 탭바/네비 영역 높이 계산 (모바일에서 버튼 가리지 않도록)
  const [bottomGap, setBottomGap] = useState(64);
  useEffect(() => {
    const measure = () => {
      try {
        const el =
          document.querySelector('[data-bottom-nav]') ||
          document.querySelector('#bottomTabBar') ||
          document.querySelector('.bottomTabBar') ||
          document.querySelector('.BottomTabBar');
        setBottomGap(el && el.offsetHeight ? el.offsetHeight : 64);
      } catch {
        // ignore
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const FOOTER_H = 56;
  const safeBottom = `calc(env(safe-area-inset-bottom, 0px) + ${bottomGap}px)`;
  const pageStyle = {
    minHeight: '100dvh',
    boxSizing: 'border-box',
    paddingBottom: `calc(${FOOTER_H}px + ${safeBottom})`,
    WebkitOverflowScrolling: 'touch',
    touchAction: 'pan-y',
  };

  // 1조/2조 판별 (group 필드 우선, 없으면 id로 fallback)
  const isGroup1 = (p) =>
    Number.isFinite(Number(p?.group))
      ? Number(p.group) % 2 === 1
      : p.id % 2 === 1;

  // 완료 여부: 방 + 파트너 둘 다 할당되어 있으면 완료로 간주
  const isCompleted = (id) => {
    const me = participants.find((p) => p.id === id);
>>>>>>> Stashed changes
    return !!(me && me.room != null && me.partner != null);
  };

  // 수동 클릭: ① onManualAssign → ② 500ms 뒤 첫 alert → ③ 스피너 재가동 → ④ 500ms 뒤 두 번째 alert → ⑤ 스피너 종료
  const handleManualClick = id => {
    if (isCompleted(id)) return;

    // ① spinner on & 로직 호출
    setLoadingId(id);
    const { roomNo, nickname, partnerNickname } = onManualAssign(id);

    // ② 500ms 뒤 첫 alert
    setTimeout(() => {
      const label = roomNames[roomNo - 1]?.trim() || `${roomNo}번 방`;
      alert(
        `${nickname}님은 ${label}에 배정되었습니다.\n` +
        `팀원을 선택하려면 확인을 눌러주세요.`
      );

      // ③ spinner 재가동
      setLoadingId(id);

      // ④ 500ms 뒤 두 번째 alert (파트너 있으면)
      setTimeout(() => {
        if (partnerNickname) {
          alert(`${nickname}님은 ${partnerNickname}님을 선택했습니다.`);
        }
        // ⑤ spinner off
        setLoadingId(null);
      }, 900);

    }, 900);
  };

  // 취소 클릭
  const handleCancelClick = id => {
    const me = participants.find(p => p.id === id);
    onCancel(id);
    if (me) {
      alert(`${me.nickname}님과 팀원이 해제되었습니다.`);
    }
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
