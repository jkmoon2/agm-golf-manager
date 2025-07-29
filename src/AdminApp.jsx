// src/AdminApp.jsx

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomeScreen  from './screens/HomeScreen';  // 10버튼 홈 (헤더는 MainLayout에서만)
import Step0       from './screens/Step0';
import StepFlow    from './flows/StepFlow';
import Dashboard   from './screens/Dashboard';
import Settings    from './screens/Settings';

export default function AdminApp() {
  return (
    <Routes>
      {/* /admin/home → HomeScreen (헤더는 MainLayout에서만) */}
      <Route index element={<HomeScreen />} />

      {/* STEP0~8 */}
      <Route path="0"     element={<Step0 />} />
      <Route path=":step" element={<StepFlow />} />

      {/* 대시보드 / 설정 */}
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="settings"  element={<Settings />} />

      {/* 기타 → 홈 */}
      <Route path="*" element={<Navigate to="" replace />} />
    </Routes>
  );
}
