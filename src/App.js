// src/App.js

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginScreen from './screens/LoginScreen';
import MainLayout  from './layouts/MainLayout';
import RequireAuth from './components/RequireAuth';
import HomeScreen  from './screens/HomeScreen';
import StepFlow    from './flows/StepFlow';      // 신규
import AdminMode   from './screens/AdminMode';
import ParticipantMode from './screens/ParticipantMode';
import Dashboard   from './screens/Dashboard';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />

        <Route element={<RequireAuth><MainLayout/></RequireAuth>}>
          <Route index element={<HomeScreen />} />

          {/* STEP 전체 흐름은 StepFlow에 일임 */}
          <Route path="step/*" element={<StepFlow />} />

          <Route path="admin"       element={<AdminMode />} />
          <Route path="participant" element={<ParticipantMode />} />
          <Route path="dashboard"   element={<Dashboard />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
