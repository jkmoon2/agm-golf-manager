// src/player/PlayerApp.jsx

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';  // ← useParams·eventId 제거

import PlayerHome        from './screens/PlayerHome';
import PlayerRoomSelect  from './screens/PlayerRoomSelect';
import PlayerRoomTable   from './screens/PlayerRoomTable';
import PlayerEventInput  from './screens/PlayerEventInput';
import PlayerScoreInput  from './screens/PlayerScoreInput';
import PlayerResults     from './screens/PlayerResults';

export default function PlayerApp() {
  return (
    <Routes>
      {/* STEP 메뉴 진입 */}
      <Route index element={<PlayerHome />} />                  {/* ← 8버튼 메뉴 */}
      <Route path="1" element={<PlayerRoomSelect />} />         {/* ← STEP1 */}
      <Route path="2" element={<PlayerRoomTable />} />
      <Route path="3" element={<PlayerEventInput />} />
      <Route path="4" element={<PlayerScoreInput />} />
      <Route path="5" element={<PlayerResults />} />
      {/* 나머지 → STEP1로 */}
      <Route path="*" element={<Navigate to="1" replace />} />
    </Routes>
  );
}
