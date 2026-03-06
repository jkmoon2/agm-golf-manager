// src/routes/StepRoutes.jsx

import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import StepPage from '../components/StepPage';
import Step1 from '../screens/Step1';
import Step2 from '../screens/Step2';
import Step3 from '../screens/Step3';
import Step4 from '../screens/Step4';
import Step5 from '../screens/Step5';
import Step6 from '../screens/Step6';
import Step7 from '../screens/Step7';
import Step8 from '../screens/Step8';

const stepMap = {
  '1': Step1, '2': Step2, '3': Step3, '4': Step4,
  '5': Step5, '6': Step6, '7': Step7, '8': Step8,
};

export default function StepRoutes() {
  const { num } = useParams();
  const Comp = stepMap[num];
  if (!Comp) return <Navigate to="/" replace />;
  return (
    <StepPage step={Number(num)}>
      <Comp />
    </StepPage>
  );
}
