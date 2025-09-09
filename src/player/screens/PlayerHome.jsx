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

// ★ patch: Firestore Timestamp → millis 안전 변환(plain object도 지원)
function tsToMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1e6;
  return Number(ts) || 0;
}

export default function PlayerHome() {
  const nav = useNavigate();
  const { eventId: ctxEventId, eventData, loadEvent } = useContext(EventContext);
  const { eventId: urlEventId } = useParams();

  // 🆕 폴백 구독 상태
  const [fallbackGate, setFallbackGate] = useState(null);
  // ★ patch: 폴백 스냅샷의 gateUpdatedAt(최신판 식별용)
  const [fallbackGateUpdatedAt, setFallbackGateUpdatedAt] = useState(0);

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
    if (eventData?.playerGate) { 
      setFallbackGate(null); 
      setFallbackGateUpdatedAt(0);
      return; 
    } // 컨텍스트가 제공되면 폴백 해제
    const ref = doc(db, 'events', id);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      if (d?.playerGate) {
        setFallbackGate(normalizeGate(d.playerGate));
        // ★ patch: 서버에 기록된 최신 타임스탬프도 함께 보관
        setFallbackGateUpdatedAt(tsToMillis(d.gateUpdatedAt));
      } else {
        setFallbackGate(null);
        setFallbackGateUpdatedAt(0);
      }
    });
    return unsub;
  }, [urlEventId, ctxEventId, eventData?.playerGate]);

  // ★ patch: 컨텍스트 vs 폴백 중 "gateUpdatedAt"이 더 최신인 쪽을 우선 적용
  const gate = useMemo(() => {
    const ctxGate = eventData?.playerGate ? normalizeGate(eventData.playerGate) : null;
    const ctxAt   = tsToMillis(eventData?.gateUpdatedAt);
    const fbGate  = fallbackGate;
    const fbAt    = fallbackGateUpdatedAt || 0;

    if (ctxGate && fbGate) return (ctxAt >= fbAt ? ctxGate : fbGate);
    return ctxGate || fbGate || {};
  }, [eventData?.playerGate, eventData?.gateUpdatedAt, fallbackGate, fallbackGateUpdatedAt]);

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
