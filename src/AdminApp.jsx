// src/AdminApp.jsx

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout  from './layouts/MainLayout';
import HomeScreen  from './screens/HomeScreen';
import Step0       from './screens/Step0';
import StepFlow    from './flows/StepFlow';
import Dashboard   from './screens/Dashboard';
import Settings    from './screens/Settings';

export default function AdminApp() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        {/* 홈(10버튼) */}
        <Route index element={<HomeScreen />} />

        {/* STEP0~ */}
        <Route path="0"     element={<Step0 />} />
        <Route path=":step" element={<StepFlow />} />

        {/* 대시보드 / 설정 */}
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="settings"  element={<Settings />} />

        {/* 그 외 → 홈 */}
        <Route path="*" element={<Navigate to="" replace />} />
      </Route>
    </Routes>
  );
}
