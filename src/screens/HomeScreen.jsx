// src/screens/HomeScreen.jsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './HomeScreen.module.css';

const steps = [
  { num: 1, title: '모드, 대회',      desc1: '스트로크/포볼', desc2: '대회명 만들기' },
  { num: 2, title: '방',            desc1: '방 개수 선택',   desc2: '방 이름 변경'   },
  { num: 3, title: '업로드',        desc1: '자동(엑셀)',     desc2: '수동(입력)'     },
  { num: 4, title: '리스트',        desc1: '참가자 현황',   desc2: '추가/삭제'      },
  { num: 5, title: '배정',          desc1: '스트로크 배정', desc2: '수동/자동/강제' },
  { num: 6, title: '결과표',        desc1: '스트로크 결과', desc2: 'JPG/PDF 다운'  },
  { num: 7, title: '포볼 배정',     desc1: 'AGM포볼 배정', desc2: '수동/자동/강제' },
  { num: 8, title: '포볼 결과표',   desc1: '결과표 확인',   desc2: 'JPG/PDF 다운'  },
];

export default function HomeScreen() {
  const navigate = useNavigate();
  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        {steps.map(s => (
          <div
            key={s.num}
            className={styles.card}
            onClick={() => navigate(`/step/${s.num}`)}
          >
            <div className={styles.stepHeader}>STEP{s.num}</div>
            <div className={styles.stepTitle}>{s.title}</div>
            <div className={styles.stepDesc1}>{s.desc1}</div>
            <div className={styles.stepDesc2}>{s.desc2}</div>
          </div>
        ))}
      </div>
    </div>
  );
}