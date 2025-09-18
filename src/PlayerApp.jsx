// /src/PlayerApp.jsx

import React, { useEffect, useContext } from 'react';
import { Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom'; // 🆕 useNavigate
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
  const { eventId } = useParams();
  const navigate = useNavigate(); // 🆕
  const { eventId: ctxEventId, loadEvent, eventData } = useContext(EventContext); // 🆕 eventData 구독

  // 이벤트 로딩 (기존 유지)
  useEffect(() => {
    if (eventId && ctxEventId !== eventId && typeof loadEvent === 'function') {
      loadEvent(eventId);
    }
  }, [eventId, ctxEventId, loadEvent]);

  // 🆕 회원 전용 이벤트 가드
  // - 운영자가 events/{eventId}.membersOnly = true 로 설정하면
  //   ➜ /player/home/:eventId/* 진입 시 '로그인 탭'으로 유도
  //   ➜ 인증코드만으로는 입장 불가
  useEffect(() => {
    if (!eventId) return;

    const membersOnly = !!eventData?.membersOnly; // 운영자 스위치(불리언)
    if (!membersOnly) return;

    // 로그인 티켓이 있는지 확인 (via:'login' 으로 저장됨)
    let hasLoginTicket = false;
    try {
      const raw = localStorage.getItem(`ticket:${eventId}`);
      if (raw) {
        const t = JSON.parse(raw);
        hasLoginTicket = !!t?.via; // 로그인 통과 시 via:'login'
      }
    } catch {}

    if (!hasLoginTicket) {
      // 로그인 탭으로 보냄 (운영자 스타일의 로그인/회원가입 탭)
      navigate(`/player/home/${eventId}/login`, { replace: true });
    }
  }, [eventId, eventData?.membersOnly, navigate]);

  return (
    <ParticipantProvider>
      <Routes>
        <Route element={<ParticipantLayout />}>
          {/* index를 홈으로 */}
          <Route index element={<PlayerHome />} />

          {/* (레거시) 인증코드 화면 - 필요 시 유지, 회원 전용 ON일 때는 위 가드가 /login 으로 리다이렉트 */}
          <Route path="join" element={<PlayerLoginScreen />} />

          {/* 단계 라우트 */}
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
