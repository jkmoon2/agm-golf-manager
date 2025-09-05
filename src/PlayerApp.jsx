// src/PlayerApp.jsx

import React, { useEffect, useContext } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom'; // 🆕 useParams
import { ParticipantProvider } from './contexts/ParticipantContext';
import ParticipantLayout      from './player/layouts/ParticipantLayout';
import PlayerLoginScreen      from './player/screens/PlayerLoginScreen';
import PlayerHome             from './player/screens/PlayerHome';
import PlayerRoomSelect       from './player/screens/PlayerRoomSelect';
import PlayerRoomTable        from './player/screens/PlayerRoomTable';
import PlayerEventInput       from './player/screens/PlayerEventInput';
import PlayerScoreInput       from './player/screens/PlayerScoreInput';
import PlayerResults          from './player/screens/PlayerResults';

// 🆕 운영자 설정/게이트 수신을 위한 이벤트 컨텍스트
import { EventContext } from './contexts/EventContext';

export default function PlayerApp() {
  // 🆕 상위 경로 /player/home/:eventId 의 :eventId 를 EventContext에 로드
  const { eventId } = useParams();                       // 🆕
  const { eventId: ctxEventId, loadEvent } = useContext(EventContext); // 🆕

  useEffect(() => {
    if (eventId && ctxEventId !== eventId && typeof loadEvent === 'function') {
      loadEvent(eventId);                                // 🆕 게이트/참가자 화면에 실시간 반영
    }
  }, [eventId, ctxEventId, loadEvent]);

  return (
    <ParticipantProvider>
      <Routes>
        <Route element={<ParticipantLayout />}>
          {/* 🆕 index를 홈으로. 이전의 Navigate→join 제거 */}
          <Route index element={<PlayerHome />} />

          {/* (옵션) 인증 코드 화면 */}
          <Route path="join" element={<PlayerLoginScreen />} />

          {/* 🆕 “home/1” → “1” 형태로 단순화(상대 네비게이션 일치) */}
          <Route path="1" element={<PlayerRoomSelect />} />
          <Route path="2" element={<PlayerRoomTable />} />
          <Route path="3" element={<PlayerEventInput />} />
          <Route path="4" element={<PlayerScoreInput />} />
          <Route path="5" element={<PlayerResults />} />

          <Route path="*" element={<Navigate to="." replace />} />
        </Route>
      </Routes>
    </ParticipantProvider>
  );
}
