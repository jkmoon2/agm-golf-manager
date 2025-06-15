// src/components/StepPage.jsx

import React from 'react';
import { useSwipeable } from 'react-swipeable';
import { useNavigate } from 'react-router-dom';
import styles from './StepPage.module.css';

export default function StepPage({ children }) {
  const navigate = useNavigate();

  const handlers = useSwipeable({
    onSwipedLeft:  () => navigate('next'),      // 실제 다음/이전 로직은 StepFlow에서 처리
    onSwipedRight: () => navigate('prev'),
    onSwipedDown:  () => navigate('/step/1'),
    preventScrollOnSwipe: true,
    trackMouse: true,
    delta: 50,
  });

  return (
    <div {...handlers} className={styles.container}>
      {/* 이전에 있던 STEP 헤더를 모두 제거 */}
      <div className={styles.stepContent}>
        {children}
      </div>
    </div>
  );
}
