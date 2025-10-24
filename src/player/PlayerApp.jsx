// /src/player/PlayerApp.jsx

import React, { useEffect, useContext } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';

import PlayerHome        from './screens/PlayerHome';
import PlayerRoomSelect  from './screens/PlayerRoomSelect';
import PlayerRoomTable   from './screens/PlayerRoomTable';
import PlayerEventInput  from './screens/PlayerEventInput';
import PlayerScoreInput  from './screens/PlayerScoreInput';
import PlayerResults     from './screens/PlayerResults';
import PlayerEventConfirm from './screens/PlayerEventConfirm';

import { EventContext }   from '../contexts/EventContext';
import { PlayerContext }  from '../contexts/PlayerContext';
import { getAuth, signInAnonymously } from 'firebase/auth'; // ✅ 변경: 안전망

export default function PlayerApp() {
  const { eventId } = useParams();
  const { loadEvent } = useContext(EventContext) || {};
  const { setEventId, setAuthCode, setParticipant } = useContext(PlayerContext) || {};

  useEffect(() => {
    if (!eventId) return;

    // ✅ 안전망: 항상 인증 보장(없는 경우만 익명 로그인)
    try {
      const auth = getAuth();
      if (!auth.currentUser) {
        signInAnonymously(auth).catch(()=>{});
      }
    } catch {}

    // 컨텍스트 동기화
    try {
      setEventId?.(eventId);
      const code = sessionStorage.getItem(`authcode_${eventId}`) || '';
      if (code) setAuthCode?.(code);
      const partRaw = sessionStorage.getItem(`participant_${eventId}`);
      if (partRaw) { try { setParticipant?.(JSON.parse(partRaw)); } catch {} }
    } catch {}

    // 이벤트 데이터 로딩
    try { if (typeof loadEvent === 'function') loadEvent(eventId); } catch {}
  }, [eventId, loadEvent, setEventId, setAuthCode, setParticipant]);

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
