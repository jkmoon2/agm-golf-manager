// /src/App.js

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import LoginScreen       from './screens/LoginScreen';
import MainLayout        from './layouts/MainLayout';
import RequireAuth       from './components/RequireAuth';
import RequireAdmin      from './components/RequireAdmin';

import HomeScreen        from './screens/HomeScreen';
import StepFlow          from './flows/StepFlow';
import AdminMode         from './screens/AdminMode';
import ParticipantMode   from './screens/ParticipantMode';
import Dashboard         from './screens/Dashboard';
import Settings          from './screens/Settings';

// (삭제) import PreMembersList    from './admin/screens/PreMembersList';
// ▼ 새 preMembers 페이지(팝업 + ‘신규만 가져오기’)
import PreMembers        from './admin/screens/PreMembers';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 로그인 */}
        <Route path="/login" element={<LoginScreen />} />

        {/* 인증 후 메인 레이아웃 */}
        <Route element={<RequireAuth><MainLayout/></RequireAuth>}>
          {/* 홈(index) & 흐름 */}
          <Route index element={<HomeScreen />} />
          <Route path="step/*" element={<StepFlow />} />

          {/* 기존 경로들 유지 */}
          <Route path="admin"       element={<AdminMode />} />
          <Route path="participant" element={<ParticipantMode />} />
          <Route path="dashboard"   element={<Dashboard />} />

          {/* 설정 화면: 일반/어드민 경로 모두 허용(기존 유지) */}
          <Route path="settings"        element={<Settings />} />
          <Route path="admin/settings"  element={<Settings />} />

          {/* ✅ pre-members: 운영자 전용 (일반/관리자 경로 모두 등록) */}
          <Route
            path="settings/pre-members"
            element={
              <RequireAdmin>
                <PreMembers />
              </RequireAdmin>
            }
          />
          <Route
            path="admin/settings/pre-members"
            element={
              <RequireAdmin>
                <PreMembers />
              </RequireAdmin>
            }
          />
        </Route>

        {/* 나머지는 홈으로 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
