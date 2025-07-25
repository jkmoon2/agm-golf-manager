// src/PlayerApp.jsx

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
// 참가자 전용 컨텍스트
import { ParticipantProvider } from './contexts/ParticipantContext';
// 참가자 전용 레이아웃(하단 탭바)
import ParticipantLayout      from './player/layouts/ParticipantLayout';
// 참가자 모드 screens
import PlayerLoginScreen      from './player/screens/PlayerLoginScreen';
import PlayerHome             from './player/screens/PlayerHome';
import PlayerRoomSelect       from './player/screens/PlayerRoomSelect';
import PlayerRoomTable        from './player/screens/PlayerRoomTable';
import PlayerEventInput       from './player/screens/PlayerEventInput';
import PlayerScoreInput       from './player/screens/PlayerScoreInput';
import PlayerResults          from './player/screens/PlayerResults';

export default function PlayerApp() {
  return (
    <ParticipantProvider>
      <Routes>
        <Route element={<ParticipantLayout />}>
          {/* /player → 인증 코드 입력 화면으로 */}
          <Route index element={<Navigate to="join" replace />} />

          {/* 1) 인증 코드 입력 */}
          <Route path="join" element={<PlayerLoginScreen />} />

          {/* 2) 참가자 홈(8버튼) */}
          <Route path="home" element={<PlayerHome />} />

          {/* 3) 단계별 기능 (home 경로 아래로 매핑) */}
          <Route path="home/1" element={<PlayerRoomSelect />} />
          <Route path="home/2" element={<PlayerRoomTable />} />
          <Route path="home/3" element={<PlayerEventInput />} />
          <Route path="home/4" element={<PlayerScoreInput />} />
          <Route path="home/5" element={<PlayerResults />} />

          {/* 4) 그 외 → 인증 코드 입력으로 리다이렉트 */}
          <Route path="*" element={<Navigate to="join" replace />} />
        </Route>
      </Routes>
    </ParticipantProvider>
  );
}
