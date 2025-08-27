// /src/player/flows/StepFlow.jsx
//
// 새로 추가되는 공용 흐름 컨텍스트입니다.
// - URL의 eventId와 현재 step(1~6)을 읽어서 goPrev/goNext/goHome 제공
// - 기존 화면 로직은 그대로 두고, 하단 버튼 등에서 네비게이션만 재사용할 수 있게 설계
//
import React, { createContext, useMemo } from 'react';
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

  const goTo = (n) => {
    if (!eventId) return;
    const target = Math.min(6, Math.max(1, Number(n) || 1));
    navigate(`/player/home/${eventId}/${target}`);
  };

  const goPrev = () => goTo(step - 1);
  const goNext = () => goTo(step + 1);
  const goHome = () => {
    // 참가자 8버튼 홈으로 이동 (대회 리스트가 아닌, 해당 대회의 참가자 홈)
    if (!eventId) return;
    navigate(`/player/home/${eventId}`);
  };

  const value = useMemo(
    () => ({
      eventId,
      step,
      goTo,
      goPrev,
      goNext,
      goHome,
    }),
    [eventId, step]
  );

  return <StepContext.Provider value={value}>{children}</StepContext.Provider>;
}
