// /src/player/screens/PlayerHome.jsx

import React, { useContext, useMemo, useEffect, useState } from 'react';   // 🆕 useState 추가
import { useNavigate, useParams } from 'react-router-dom';
import styles from './PlayerHome.module.css';
import { EventContext } from '../../contexts/EventContext';

// 🆕 Firestore 폴백 구독용
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const menu = [
  { step: 1, title: '방 선택',    sub: '스트로크/포볼'       },
  { step: 2, title: '방배정표',    sub: '각 방/팀원 확인'     },
  { step: 3, title: '이벤트',      sub: '이벤트 결과 입력'    },
  { step: 4, title: '점수 입력',   sub: '개인/방 점수 입력'    },
  { step: 5, title: '결과 확인',   sub: '최종결과표/팀결과표'  },
  { step: 6, title: '이벤트 확인', sub: '방별 순위 확인'      },
  { step: 7, title: '#TEMP',       sub: '추가 아이템 생성'    },
  { step: 8, title: '#TEMP',       sub: '추가 아이템 생성'    },
];

// 🆕 playerGate 정규화(누락 키를 안전하게 보충)
function normalizeGate(g) {
  const steps = (g && g.steps) || {};
  const norm = { steps: {}, step1: { ...(g?.step1 || {}) } };
  for (let i = 1; i <= 8; i += 1) norm.steps[i] = steps[i] || 'enabled';
  if (typeof norm.step1.teamConfirmEnabled !== 'boolean') norm.step1.teamConfirmEnabled = true;
  return norm;
}

export default function PlayerHome() {
  const nav = useNavigate();
  const { eventId: ctxEventId, eventData, loadEvent } = useContext(EventContext);
  const { eventId: urlEventId } = useParams();

  // 🆕 폴백 구독 상태
  const [fallbackGate, setFallbackGate] = useState(null);

  // URL의 eventId를 EventContext에 주입(있다면)
  useEffect(() => {
    if (urlEventId && ctxEventId !== urlEventId && typeof loadEvent === 'function') {
      loadEvent(urlEventId);
    }
  }, [urlEventId, ctxEventId, loadEvent]);

  // 🆕 EventContext가 비어있는 경우를 대비하여 Firestore 직접 구독
  useEffect(() => {
    const id = urlEventId || ctxEventId;
    if (!id) return;
    if (eventData?.playerGate) { setFallbackGate(null); return; } // 컨텍스트가 제공되면 폴백 해제
    const ref = doc(db, 'events', id);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      if (d?.playerGate) setFallbackGate(normalizeGate(d.playerGate));
      else setFallbackGate(null);
    });
    return unsub;
  }, [urlEventId, ctxEventId, eventData?.playerGate]);

  // 게이트(컨텍스트 우선, 없으면 폴백)
  const gate = useMemo(
    () => (eventData?.playerGate ? normalizeGate(eventData.playerGate) : (fallbackGate || {})),
    [eventData?.playerGate, fallbackGate]
  );
  const getStatus = (n) => (gate?.steps?.[n] || 'enabled');

  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        {menu.map(item => {
          const status = getStatus(item.step);
          if (status === 'hidden') return null;
          const isDisabled = status !== 'enabled';

          return (
            <button
              key={item.step}
              className={styles.card}
              onClick={() => !isDisabled && nav(`${item.step}`)}
              disabled={isDisabled}
              aria-disabled={isDisabled}
              data-state={status}
              style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            >
              <div className={styles.step}>STEP {item.step}</div>
              <h2 className={styles.title}>{item.title}</h2>
              <p className={styles.desc}>{item.sub}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
