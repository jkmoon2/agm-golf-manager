// src/player/PlayerApp.jsx

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import PlayerLoginScreen from './screens/PlayerLoginScreen';
import PlayerHome        from './screens/PlayerHome';
import PlayerRoomSelect  from './screens/PlayerRoomSelect';
import PlayerRoomTable   from './screens/PlayerRoomTable';
import PlayerEventInput  from './screens/PlayerEventInput';
import PlayerScoreInput  from './screens/PlayerScoreInput';
import PlayerResults     from './screens/PlayerResults';

export default function PlayerApp() {
  return (
    <Routes>
      {/* /player → 인증 코드 입력 */}
      <Route index element={<Navigate to="login" replace />} />
      <Route path="login" element={<PlayerLoginScreen />} />

      {/* 인증 후 홈 → 8버튼 메뉴 */}
      <Route path="home" element={<PlayerHome />} />

      {/* 실제 단계별 화면 */}
      <Route path="home/1" element={<PlayerRoomSelect />} />
      <Route path="home/2" element={<PlayerRoomTable />} />
      <Route path="home/3" element={<PlayerEventInput />} />
      <Route path="home/4" element={<PlayerScoreInput />} />
      <Route path="home/5" element={<PlayerResults />} />

      {/* 그 외 전부 다시 로그인 */}
      <Route path="*" element={<Navigate to="login" replace />} />
    </Routes>
  );
}
