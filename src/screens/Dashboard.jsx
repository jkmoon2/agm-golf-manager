// /src/screens/Dashboard.jsx
// 기존 Dashboard 메뉴/라우트는 유지하고, 실제 렌더만 DashboardV2로 연결하는 wrapper 파일입니다.

import React from 'react';
import DashboardV2 from './DashboardV2';

export default function Dashboard() {
  return <DashboardV2 />;
}
