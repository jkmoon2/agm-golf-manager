// /src/player/PlayerApp.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import PlayerHome        from './screens/PlayerHome';
import PlayerRoomSelect  from './screens/PlayerRoomSelect';
import PlayerRoomTable   from './screens/PlayerRoomTable';
import PlayerEventInput  from './screens/PlayerEventInput';
import PlayerScoreInput  from './screens/PlayerScoreInput';
import PlayerResults     from './screens/PlayerResults';
import PlayerEventConfirm from './screens/PlayerEventConfirm';

// ✅ 불필요한 useEffect 네비게이션(루프 원인) 제거. 홈 내부 라우팅만 정의.
export default function PlayerApp() {
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
