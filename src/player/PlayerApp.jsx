//src/player/PlayerApp.jsx

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ParticipantProvider } from '../contexts/ParticipantContext';
import ParticipantLayout from './layouts/ParticipantLayout';
import Step1_CodeEntry from './screens/Step1_CodeEntry';
import PlayerHome from '../player/screens/PlayerHome';
// …나머지 스크린 import

export default function PlayerApp() {
  return (
    <ParticipantProvider>
      <ParticipantLayout>
        <Routes>
          <Route path="join/:eventId" element={<Step1_CodeEntry />} />
          <Route path="home"     element={<PlayerHome />} />
          {/* 추후 추가할 /home/2,3… 또는 /dashboard, /settings 등 */}
          <Route path="*"        element={<Navigate to="join/unknown" replace />} />
        </Routes>
      </ParticipantLayout>
    </ParticipantProvider>
  );
}
