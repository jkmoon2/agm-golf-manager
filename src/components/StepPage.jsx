// src/components/StepPage.jsx

import React from 'react';
import styles from './StepPage.module.css';

export default function StepPage({ step, setStep, children }) {
  return (
    <div className={styles.container}>
      {/* 기존 코드 유지, 여기에 stepHeader를 추가해 제목을 표시 */}
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>STEP {step}</h2>
      </div>
      <div className={styles.stepContent}>
        {children}
      </div>
    </div>
  );
}
