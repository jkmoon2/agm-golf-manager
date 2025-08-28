// /src/player/flows/StepFlow.jsx
//
// URL의 eventId와 현재 step(1~6)을 읽어서 goPrev/goNext/goHome 제공
// 기존 화면 로직은 그대로, 네비게이션만 재사용
//
import React, { createContext, useMemo, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

export const StepContext = createContext(null);

function getCurrentStepFromPath(pathname) {
  // 예: /player/home/agm1/4  →  4
  const seg = pathname.split('/').filter(Boolean);
  const last = seg[seg.length - 1];
  const n = Number(last);
  return Number.isFinite(n) && n >= 1 && n <= 6 ? n : 1;
}

export default function StepFlowProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { eventId } = useParams();

  const step = getCurrentStepFromPath(location.pathname);

  // ⬇⬇⬇ 함수 참조를 안정화 (ESLint 경고 해소)
  const goTo = useCallback(
    (n) => {
      if (!eventId) return;
      const target = Math.min(6, Math.max(1, Number(n) || 1));
      navigate(`/player/home/${eventId}/${target}`);
    },
    [eventId, navigate]
  );

  const goPrev = useCallback(() => { goTo(step - 1); }, [goTo, step]);
  const goNext = useCallback(() => { goTo(step + 1); }, [goTo, step]);

  const goHome = useCallback(() => {
    if (!eventId) return;
    navigate(`/player/home/${eventId}`);
  }, [eventId, navigate]);

  // ⬇⬇⬇ 이제 deps에 함수들을 안전하게 포함 가능
  const value = useMemo(
    () => ({ eventId, step, goTo, goPrev, goNext, goHome }),
    [eventId, step, goTo, goPrev, goNext, goHome]
  );

  return <StepContext.Provider value={value}>{children}</StepContext.Provider>;
}
