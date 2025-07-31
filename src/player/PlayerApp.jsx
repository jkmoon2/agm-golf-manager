// src/player/PlayerApp.jsx

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import EventSelectScreen  from './screens/EventSelectScreen';
import PlayerLoginScreen  from './screens/PlayerLoginScreen';
import PlayerHome         from './screens/PlayerHome';
import PlayerRoomSelect   from './screens/PlayerRoomSelect';
import PlayerRoomTable    from './screens/PlayerRoomTable';
import PlayerEventInput   from './screens/PlayerEventInput';
import PlayerScoreInput   from './screens/PlayerScoreInput';
import PlayerResults      from './screens/PlayerResults';

export default function PlayerApp() {
  return (
    <Routes>
      {/* 1) /player/home → 대회 리스트 (EventSelectScreen) */}
      <Route index element={<EventSelectScreen />} />

      {/* 2) /player/home/:eventId/login → 인증 코드 입력 */}
      <Route path=":eventId/login" element={<PlayerLoginScreen />} />

      {/* 3) /player/home/:eventId → 8버튼 메뉴 */}
      <Route path=":eventId" element={<PlayerHome />} />

      {/* 4) /player/home/:eventId/1~5 → 단계별 화면 */}
      <Route path=":eventId/1" element={<PlayerRoomSelect />} />
      <Route path=":eventId/2" element={<PlayerRoomTable />} />
      <Route path=":eventId/3" element={<PlayerEventInput />} />
      <Route path=":eventId/4" element={<PlayerScoreInput />} />
      <Route path=":eventId/5" element={<PlayerResults />} />

      {/* 5) 그 외는 다시 대회 리스트로 */}
      <Route path="*" element={<Navigate to="" replace />} />
    </Routes>
  );
}
