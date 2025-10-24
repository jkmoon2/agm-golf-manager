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

// 🔧 최소 수정: 잘못된 임포트 제거
// import { StepFlowProvider } from '../player/flows/StepFlow';

export default function PlayerApp() {
  const { eventId } = useParams();
  const navigate    = useNavigate();
  const { eventId: ctxEventId, participant } = useContext(PlayerContext);

  // eventId가 없거나 'undefined'로 들어오면 플레이어 로그인(코드)로 안내
  useEffect(() => {
    if (!eventId || eventId === 'undefined') {
      navigate('/player/login-or-code', { replace: true });
    }
  }, [eventId, navigate]);

  // 컨텍스트/참가자 가드
  useEffect(() => {
    if (ctxEventId !== eventId || !participant) {
      // 🔧 최소 수정: /login 세그먼트 제거
      navigate(`/player/home/${eventId}`, { replace: true });
    }
  }, [ctxEventId, eventId, participant, navigate]);

  // 딥링크 보조 가드
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
    if (!participant && !hasTicket && !hasPending) {
      // 🔧 최소 수정: /login 세그먼트 제거
      navigate(`/player/home/${eventId}`, { replace: true });
    }
  }, [eventId, participant, navigate]);

  // 🔧 최소 수정: StepFlowProvider 래퍼 제거 → 그대로 Routes 렌더
  return (
    <Routes>
      <Route index element={<PlayerHome />} />
      <Route path="1" element={<PlayerRoomSelect />} />
      <Route path="2" element={<PlayerRoomTable />} />
      <Route path="3" element={<PlayerEventInput />} />
      <Route path="4" element={<PlayerScoreInput />} />
      <Route path="5" element={<PlayerResults />} />
      <Route path="6" element={<PlayerEventConfirm />} />
      <Route path="*" element={<Navigate to="1" replace />} />
    </Routes>
  );
}
