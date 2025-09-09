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

// ★ patch: 문자열(YYYY-MM-DD)을 해당 날짜의 00:00/23:59:59로 변환
function dateStrToMillis(s, kind /* 'start'|'end' */) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = kind === 'start' ? '00:00:00' : '23:59:59';
  const d = new Date(`${s}T${t}`);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

export default function PlayerHome() {
  const nav = useNavigate();
  const { eventId: ctxEventId, eventData, loadEvent } = useContext(EventContext);
  const { eventId: urlEventId } = useParams();

  // 🆕 폴백 구독 상태
  const [fallbackGate, setFallbackGate] = useState(null);
  // ★ patch: 폴백 스냅샷의 gateUpdatedAt(최신판 식별용)
  const [fallbackGateUpdatedAt, setFallbackGateUpdatedAt] = useState(0);
  // ★ patch: 접근 허용 정책 폴백(컨텍스트 부재 시 사용)
  const [fallbackAccess, setFallbackAccess] = useState({
    allowDuringPeriodOnly: false,
    accessStartAt: null,
    accessEndAt: null,
    dateStart: '',
    dateEnd: ''
  });

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
      setFallbackAccess({
        allowDuringPeriodOnly: false,
        accessStartAt: null,
        accessEndAt: null,
        dateStart: '',
        dateEnd: ''
      });
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
      // ★ patch: 접근 허용 관련 필드도 폴백 저장
      setFallbackAccess({
        allowDuringPeriodOnly: !!d?.allowDuringPeriodOnly,
        accessStartAt: (typeof d?.accessStartAt === 'number') ? d.accessStartAt : tsToMillis(d?.accessStartAt) || null,
        accessEndAt:   (typeof d?.accessEndAt   === 'number') ? d.accessEndAt   : tsToMillis(d?.accessEndAt)   || null,
        dateStart: d?.dateStart || '',
        dateEnd:   d?.dateEnd   || ''
      });
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

  // ★ patch: 대회 기간 기반 접근 차단 계산
  const isAccessDenied = useMemo(() => {
    const allowDuring =
      (typeof eventData?.allowDuringPeriodOnly === 'boolean')
        ? eventData.allowDuringPeriodOnly
        : !!fallbackAccess.allowDuringPeriodOnly;

    if (!allowDuring) return false;

    const startAt =
      (eventData?.accessStartAt ?? fallbackAccess.accessStartAt) ??
      dateStrToMillis(eventData?.dateStart || fallbackAccess.dateStart, 'start');

    const endAt =
      (eventData?.accessEndAt ?? fallbackAccess.accessEndAt) ??
      dateStrToMillis(eventData?.dateEnd || fallbackAccess.dateEnd, 'end');

    const now = Date.now();
    if (startAt && now < startAt) return true;
    if (endAt && now > endAt) return true;
    return false;
  }, [
    eventData?.allowDuringPeriodOnly,
    eventData?.accessStartAt,
    eventData?.accessEndAt,
    eventData?.dateStart,
    eventData?.dateEnd,
    fallbackAccess.allowDuringPeriodOnly,
    fallbackAccess.accessStartAt,
    fallbackAccess.accessEndAt,
    fallbackAccess.dateStart,
    fallbackAccess.dateEnd
  ]);

  if (isAccessDenied) {
    // 차단 메시지(간단한 안내). 필요 시 네비게이션 처리도 가능.
    return (
      <div className={styles.container} style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh' }}>
        <div style={{ textAlign:'center', lineHeight:1.6 }}>
          <h2 style={{ margin:'0 0 8px 0' }}>대회 기간이 아닙니다</h2>
          <p style={{ color:'#4b5563', margin:0 }}>
            현재 대회는 참가자 접속이 제한되어 있습니다.<br/>
            대회 기간 중에만 접속 가능합니다.
          </p>
        </div>
      </div>
    );
  }

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
