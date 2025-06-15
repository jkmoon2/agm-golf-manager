// src/components/StepPage.jsx

import React from 'react';
import styles from './StepPage.module.css';

export default function StepPage({ children }) {
  return (
    <div className={styles.container}>
      <div className={styles.stepContent}>
        {children}
      </div>
    </div>
  );
}
