// src/player/PlayerApp.jsx

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
// [ADD] STEP6 화면 임포트
import PlayerEventConfirm from './screens/PlayerEventConfirm';
// [ADD] STEP 흐름 컨텍스트 (이전/다음/홈 네비게이션 공통 제공)
import StepFlowProvider   from './flows/StepFlow';

export default function PlayerApp() {
  const { eventId } = useParams();
  const navigate    = useNavigate();
  const { eventId: ctxEventId, participant } = useContext(PlayerContext);

  // Guard: context.eventId과 URL이 같고, participant가 있어야 STEP 메뉴 접근
  useEffect(() => {
    if (ctxEventId !== eventId || !participant) {
      navigate(`/player/home/${eventId}/login`, { replace: true });
    }
  }, [ctxEventId, eventId, participant, navigate]);

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
