// /src/player/flows/StepFlow.jsx
//
// ★ patch 요약
// - EventContext/PlayerContext를 읽어 '대회 모드별 gate'를 계산
// - nextAllowed(다음 단계 이동 가능 여부) 추가
// - goNext가 gate를 검사하여 차단(중앙 가드)
// - 컨텍스트로 { step, goPrev, goNext, nextAllowed } 제공
//
import React, { createContext, useMemo, useCallback, useContext } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

// ★ patch: gate/모드 정보를 읽기 위해
import { EventContext } from '../../contexts/EventContext';
import { PlayerContext } from '../../contexts/PlayerContext';

import { useApplyTheme } from '../../themes/useTheme';

export const StepContext = createContext(null);

function getCurrentStepFromPath(pathname) {
  // 예: /player/home/agm1/4  →  4
  const seg = pathname.split('/').filter(Boolean);
  const last = seg[seg.length - 1];
  const n = Number(last);
  return Number.isFinite(n) && n >= 1 && n <= 6 ? n : 1;
}

// ★ patch: gate 정규화 (+ 모드별 선택)
function normalizeGate(raw) {
  if (!raw || typeof raw !== 'object') return { steps:{}, step1:{ teamConfirmEnabled:true } };
  const g = { ...raw };
  const steps = g.steps || {};
  const out = { steps:{}, step1:{ ...(g.step1 || {}) } };
  for (let i=1;i<=8;i+=1) out.steps[i] = steps[i] || 'enabled';
  if (typeof out.step1.teamConfirmEnabled !== 'boolean') out.step1.teamConfirmEnabled = true;
  return out;
}
function pickGateByMode(playerGate, mode) {
  // mode: 'stroke' | 'fourball' | 'agm'(=fourball)
  const isFour = (mode === 'fourball' || mode === 'agm');
  const nested = isFour ? playerGate?.fourball : playerGate?.stroke;
  const base = nested && typeof nested === 'object' ? nested : playerGate;
  return normalizeGate(base);
}

export default function StepFlowProvider({ children }) {
  // ★ theme: 플레이어 화면 테마 적용 (설정의 applyMode에 따라 자동)
  useApplyTheme('player');
  const navigate = useNavigate();
  const location = useLocation();
  const { eventId } = useParams();

  const step = getCurrentStepFromPath(location.pathname);

  // ★ patch: 컨텍스트에서 모드/게이트를 읽어 “다음단계 허용 여부” 계산
  const { eventData } = useContext(EventContext) || {};
  const { mode: playerMode } = useContext(PlayerContext) || {};
  const mode = (playerMode || (eventData?.mode === 'fourball' ? 'fourball' : 'stroke'));
  const gate = useMemo(() => pickGateByMode(eventData?.playerGate || {}, mode), [eventData?.playerGate, mode]);

  // ⬇⬇⬇ 함수 참조를 안정화
  const goTo = useCallback(
    (n) => {
      if (!eventId) return;
      const target = Math.min(6, Math.max(1, Number(n) || 1));
      navigate(`/player/home/${eventId}/${target}`);
    },
    [eventId, navigate]
  );

  const goPrev = useCallback(() => { goTo(step - 1); }, [goTo, step]);

  // ★ patch: 다음 단계 허용 여부
  const nextAllowed = useMemo(() => {
    const next = step + 1;
    if (step === 1) {
      // STEP1 → STEP2: step1.teamConfirmEnabled && step2 enabled
      return !!gate?.step1?.teamConfirmEnabled && (gate?.steps?.[2] === 'enabled');
    }
    if (next >= 2 && next <= 6) {
      return (gate?.steps?.[next] === 'enabled');
    }
    return true;
  }, [step, gate]);

  // ★ patch: 중앙 가드
  const goNext = useCallback(() => {
    if (!nextAllowed) return; // 막기
    goTo(step + 1);
  }, [goTo, step, nextAllowed]);

  const goHome = useCallback(() => {
    if (!eventId) return;
    navigate(`/player/home/${eventId}`);
  }, [eventId, navigate]);

  const value = useMemo(
    () => ({ eventId, step, goTo, goPrev, goNext, goHome, nextAllowed, gate, mode }),
    [eventId, step, goTo, goPrev, goNext, goHome, nextAllowed, gate, mode]
  );

  return <StepContext.Provider value={value}>{children}</StepContext.Provider>;
}
