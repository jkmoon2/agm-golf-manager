// /src/player/flows/StepFlow.jsx
// (기존 코드 100% 유지 + "플레이어용"으로 필요한 부분만 보완)
// - ?login=1 또는 /login 세그먼트면 하이브리드 게이트(LoginOrCode) 강제 표출

import React, { createContext, useMemo, useCallback, useContext, useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { EventContext } from '../../contexts/EventContext';
import { PlayerContext } from '../../contexts/PlayerContext';
import { useApplyTheme } from '../../themes/useTheme';
import LoginOrCode from '../screens/LoginOrCode';

export const StepContext = createContext(null);

function getCurrentStepFromPath(pathname) {
  const seg = pathname.split('/').filter(Boolean);
  const last = seg[seg.length - 1];
  const n = Number(last);
  return Number.isFinite(n) && n >= 1 && n <= 6 ? n : 1;
}
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
  const isFour = (mode === 'fourball' || mode === 'agm');
  const nested = isFour ? playerGate?.fourball : playerGate?.stroke;
  const base = nested && typeof nested === 'object' ? nested : playerGate;
  return normalizeGate(base);
}

export default function StepFlowProvider({ children }) {
  useApplyTheme('player');
  const navigate = useNavigate();
  const location = useLocation();
  const { eventId } = useParams();

  const step = getCurrentStepFromPath(location.pathname);

  const { eventData } = useContext(EventContext) || {};
  const { mode: playerMode } = useContext(PlayerContext) || {};
  const mode = (playerMode || (eventData?.mode === 'fourball' ? 'fourball' : 'stroke'));
  const gate = useMemo(() => pickGateByMode(eventData?.playerGate || {}, mode), [eventData?.playerGate, mode]);

  // 티켓
  const hasTicket = useMemo(() => {
    try {
      if (!eventId) return false;
      const raw = localStorage.getItem(`ticket:${eventId}`);
      if (!raw) return false;
      const t = JSON.parse(raw);
      return !!(t?.code || t?.via);
    } catch { return false; }
  }, [eventId]);

  // 게이트 강제 표출: ?login=1 OR path endsWith '/login'
  const search = new URLSearchParams(location.search);
  const forceByQuery = search.get('login') === '1';
  const lastSeg = location.pathname.split('/').filter(Boolean).pop();
  const forceByPath = lastSeg === 'login';
  const forceGate = forceByQuery || forceByPath;

  const [entered, setEntered] = useState(!forceGate && hasTicket);
  useEffect(() => { setEntered(!forceGate && hasTicket); }, [forceGate, hasTicket]);

  const goTo = useCallback((n) => {
    if (!eventId) return;
    const target = Math.min(6, Math.max(1, Number(n) || 1));
    navigate(`/player/home/${eventId}/${target}`);
  }, [eventId, navigate]);

  const goPrev = useCallback(() => { goTo(step - 1); }, [goTo, step]);

  const nextAllowed = useMemo(() => {
    const next = step + 1;
    if (step === 1) return !!gate?.step1?.teamConfirmEnabled && (gate?.steps?.[2] === 'enabled');
    if (next >= 2 && next <= 6) return (gate?.steps?.[next] === 'enabled');
    return true;
  }, [step, gate]);

  const goNext = useCallback(() => { if (nextAllowed) goTo(step + 1); }, [goTo, step, nextAllowed]);

  const goHome = useCallback(() => { if (eventId) navigate(`/player/home/${eventId}`); }, [eventId, navigate]);

  const value = useMemo(() => ({ eventId, step, goTo, goPrev, goNext, goHome, nextAllowed, gate, mode }),
    [eventId, step, goTo, goPrev, goNext, goHome, nextAllowed, gate, mode]);

  // 게이트: 로그인/인증코드 탭
  if (forceGate || !entered) {
    return <LoginOrCode onEnter={() => setEntered(true)} />;
  }
  return <StepContext.Provider value={value}>{children}</StepContext.Provider>;
}
