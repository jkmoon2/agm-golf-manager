// src/player/PlayerApp.jsx

import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';

import PlayerHome        from './screens/PlayerHome';
import PlayerRoomSelect  from './screens/PlayerRoomSelect';
import PlayerRoomTable   from './screens/PlayerRoomTable';
import PlayerEventInput  from './screens/PlayerEventInput';
import PlayerScoreInput  from './screens/PlayerScoreInput';
import PlayerResults     from './screens/PlayerResults';

export default function PlayerApp() {
  const { eventId } = useParams();

  return (
    <Routes>
      {/* STEP 메뉴 최초 진입 → 8버튼 메뉴(PlayerHome) */}
      <Route index element={<PlayerHome />} />

      {/* STEP1: 방 선택 */}
      <Route path="1" element={<PlayerRoomSelect />} />

      {/* STEP2~STEP5 */}
      <Route path="2" element={<PlayerRoomTable />} />
      <Route path="3" element={<PlayerEventInput />} />
      <Route path="4" element={<PlayerScoreInput />} />
      <Route path="5" element={<PlayerResults />} />

      {/* 기타 STEP → STEP1으로 리다이렉트 */}
      <Route path="*" element={<Navigate to="1" replace />} />
    </Routes>
  );
}
