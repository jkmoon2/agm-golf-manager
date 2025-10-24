// /src/player/PlayerApp.jsx

import React, { useEffect, useContext } from 'react';
import {
  useNavigate,
  useParams,
  Routes,
  Route,
  Navigate
} from 'react-router-dom';
import { PlayerContext } from '../contexts/PlayerContext';

import PlayerHome        from './screens/PlayerHome';
import PlayerRoomSelect  from './screens/PlayerRoomSelect';
import PlayerRoomTable   from './screens/PlayerRoomTable';
import PlayerEventInput  from './screens/PlayerEventInput';
import PlayerScoreInput  from './screens/PlayerScoreInput';
import PlayerResults     from './screens/PlayerResults';
import PlayerEventConfirm from './screens/PlayerEventConfirm';
import { StepFlowProvider } from '../player/flows/StepFlow';

export default function PlayerApp() {
  const { eventId } = useParams();
  const navigate    = useNavigate();
  const { eventId: ctxEventId, participant } = useContext(PlayerContext);

  // ✅ 추가: eventId가 없거나 'undefined'로 들어오면 플레이어 로그인(코드)로 안내
  useEffect(() => {
    if (!eventId || eventId === 'undefined') {
      navigate('/player/login-or-code', { replace: true });
    }
  }, [eventId, navigate]);

  // 기존 가드(컨텍스트/참가자)
  useEffect(() => {
    if (ctxEventId !== eventId || !participant) {
      // ✅ 최소 수정: /login 세그먼트 제거
      navigate(`/player/home/${eventId}`, { replace: true });
    }
  }, [ctxEventId, eventId, participant, navigate]);

  // [ADD] 보조 가드: deep-link로 바로 STEP URL에 들어온 경우 대비
  useEffect(() => {
    const hasTicket = (() => {
      try {
        const raw = localStorage.getItem(`ticket:${eventId}`);
        if (!raw) return false;
        const t = JSON.parse(raw);
        return !!t?.via || !!t?.code;
      } catch {
        return false;
      }
    })();
    const hasPending = (() => {
      try { return !!sessionStorage.getItem('pending_code'); } catch { return false; }
    })();
    // 참가자 컨텍스트가 아직 준비 전이거나, 인증 티켓/코드가 전혀 없는 경우 로그인 페이지로
    if (!participant && !hasTicket && !hasPending) {
      // ✅ 최소 수정: /login 세그먼트 제거
      navigate(`/player/home/${eventId}`, { replace: true });
    }
  }, [eventId, participant, navigate]);

  return (
    // [ADD] STEP 공용 흐름 컨텍스트로 감싸기 (기존 라우트는 그대로)
    <StepFlowProvider>
      <Routes>
        <Route index element={<PlayerHome />} />
        <Route path="1" element={<PlayerRoomSelect />} />
        <Route path="2" element={<PlayerRoomTable />} />
        <Route path="3" element={<PlayerEventInput />} />
        <Route path="4" element={<PlayerScoreInput />} />
        <Route path="5" element={<PlayerResults />} />
        {/* [ADD] STEP6 라우트 추가 (기존 유지) */}
        <Route path="6" element={<PlayerEventConfirm />} />
        {/* 미정의 경로는 STEP1로 */}
        <Route path="*" element={<Navigate to="1" replace />} />
      </Routes>
    </StepFlowProvider>
  );
}
