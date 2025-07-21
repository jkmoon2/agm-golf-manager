// src/screens/HomeScreen.jsx

import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './HomeScreen.module.css';
import { EventContext } from '../contexts/EventContext';

const STEPS = [
  { num: 1, title: '모드, 대회',    desc: '스트로크/포볼, 대회명' },
  { num: 2, title: '방',          desc: '방 개수·방 이름' },
  { num: 3, title: '업로드',      desc: '자동(엑셀)·수동(직접)' },
  { num: 4, title: '리스트',      desc: '참가자 현황·추가/삭제' },
  { num: 5, title: '배정',        desc: '스트로크, 수동/자동/강제' },
  { num: 6, title: '결과표',      desc: '스트로크, JPG/PDF다운' },
  { num: 7, title: '포볼 배정',   desc: 'AGM포볼, 수동/자동/강제' },
  { num: 8, title: '포볼 결과표', desc: 'AGM포볼, JPG/PDF다운' },
];

export default function HomeScreen() {
  const nav = useNavigate();
  const { eventId } = useContext(EventContext);

  const handleClick = num => {
    if (num === 0) return nav('0');
    if (num === 1) return nav('1');
    if (num === 9) return nav('dashboard');
    if (!eventId) {
      alert('먼저 대회를 선택하거나 새 대회를 시작해주세요.');
      return;
    }
    nav(`${num}`);
  };

  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        <button className={styles.card} onClick={() => handleClick(0)}>
          <div className={styles.step}>STEP 0</div>
          <div className={styles.title}>대회 관리</div>
          <div className={styles.desc}>대회 관리, 생성/불러오기</div>
        </button>
        {STEPS.map(({ num, title, desc }) => (
          <button
            key={num}
            className={styles.card}
            onClick={() => handleClick(num)}
          >
            <div className={styles.step}>STEP {num}</div>
            <div className={styles.title}>{title}</div>
            <div className={styles.desc}>{desc}</div>
          </button>
        ))}
        <button className={styles.card} onClick={() => handleClick(9)}>
          <div className={styles.step}>#TEMP</div>
          <div className={styles.title}>임시</div>
          <div className={styles.desc}>추가 아이템 생성</div>
        </button>
      </div>
    </div>
  );
}