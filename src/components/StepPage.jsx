// src/components/StepPage.jsx

import React from 'react';
import { useSwipeable } from 'react-swipeable';
import { useNavigate } from 'react-router-dom';
import styles from './StepPage.module.css';

export default function StepPage({ step, children }) {
  const navigate = useNavigate();

  const handlers = useSwipeable({
    // ← 왼쪽 스와이프: 6단계일 땐 무시, 그 외엔 다음 단계로 (최대 8단계)
    onSwipedLeft: () => {
      if (step !== 6 && step < 8) {
        navigate(`/step/${step + 1}`);
      }
    },
    // → 오른쪽 스와이프: 1단계면 홈(/)으로, 아니면 이전 단계로
    onSwipedRight: () => {
      if (step === 1) {
        navigate('/');
      } else {
        navigate(`/step/${step - 1}`);
      }
    },
    // ↓ 아래 스와이프: 2~8단계에서만 1단계로 이동
    onSwipedDown: () => {
      if (step > 1) {
        navigate(`/step/1`);
      }
    },
    // ↑ 위 스와이프는 별도 처리 없음
    preventDefaultTouchmoveEvent: true,
    trackMouse: true,
  });

  return (
    <div {...handlers} className={styles.container}>
      <main className={styles.content}>
        {children}
      </main>
    </div>
  );
}
