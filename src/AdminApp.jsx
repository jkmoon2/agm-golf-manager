// src/AdminApp.jsx

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout  from './layouts/MainLayout';
import HomeScreen  from './screens/HomeScreen';  // 10버튼 홈
import Step0       from './screens/Step0';
import StepFlow    from './flows/StepFlow';
import Dashboard   from './screens/Dashboard';
import Settings    from './screens/Settings';

export default function AdminApp() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        {/* /admin/home → 홈(10버튼), 상단 타이틀 "AGM Golf Manager" */}
        <Route index element={<HomeScreen />} />

        {/* STEP0~8 화면으로 진입 */}
        <Route path="0"       element={<Step0 />} />
        <Route path=":step"   element={<StepFlow />} />

        {/* 기타 화면 */}
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="settings"  element={<Settings />} />

        {/* 기타 경로는 홈으로 */}
        <Route path="*" element={<Navigate to="" replace />} />
      </Route>
    </Routes>
  );
}