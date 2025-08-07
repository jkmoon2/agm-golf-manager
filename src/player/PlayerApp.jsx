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
    <Routes>
      <Route index element={<PlayerHome />} />
      <Route path="1" element={<PlayerRoomSelect />} />
      <Route path="2" element={<PlayerRoomTable />} />
      <Route path="3" element={<PlayerEventInput />} />
      <Route path="4" element={<PlayerScoreInput />} />
      <Route path="5" element={<PlayerResults />} />
      <Route path="*" element={<Navigate to="1" replace />} />
    </Routes>
  );
}
