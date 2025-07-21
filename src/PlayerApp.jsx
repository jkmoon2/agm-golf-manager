// src/PlayerApp.jsx

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout       from './layouts/MainLayout';
import PlayerHomeMenu   from './screens/PlayerHomeMenu';
import PlayerRoomSelect from './screens/PlayerRoomSelect';
import PlayerRoomTable  from './screens/PlayerRoomTable';
import PlayerEventInput from './screens/PlayerEventInput';
import PlayerScoreInput from './screens/PlayerScoreInput';
import PlayerResults    from './screens/PlayerResults';

export default function PlayerApp() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        {/* /player → /player/home */}
        <Route index element={<Navigate to="home" replace />} />
        {/* 홈 (참가자 전용 메뉴) */}
        <Route path="home" element={<PlayerHomeMenu />} />
        {/* 개별 기능 */}
        <Route path="room-select" element={<PlayerRoomSelect />} />
        <Route path="room-table"  element={<PlayerRoomTable />} />
        <Route path="event-input" element={<PlayerEventInput />} />
        <Route path="score-input" element={<PlayerScoreInput />} />
        <Route path="results"     element={<PlayerResults />} />
      </Route>
      {/* /player/* 이외 전부 → /player/home */}
      <Route path="*" element={<Navigate to="home" replace />} />
    </Routes>
  );
}
