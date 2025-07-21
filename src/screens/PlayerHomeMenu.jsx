// src/screens/PlayerHomeMenu.jsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './PlayerHomeMenu.module.css';

// STEP 번호 • 제목 • 설명 • 이동할 경로를 정의합니다.
const BUTTONS = [
  { num: 1, title: '방 선택',     desc: '스트로크/포볼',       path: '/player/home/1' },
  { num: 2, title: '방배정표',   desc: '각 방/팀원 확인',     path: '/player/home/2' },
  { num: 3, title: '이벤트',     desc: '이벤트 결과 입력',     path: '/player/home/3' },
  { num: 4, title: '점수 입력',   desc: '개인/방 점수 입력',   path: '/player/home/4' },
  { num: 5, title: '결과 확인',   desc: '최종결과표/팀결과표',   path: '/player/home/5' },
  { num: 6, title: '이벤트 확인', desc: '방별 순위 확인',       path: '/player/home/6' },
  { num: 7, title: '#TEMP',      desc: '추가 아이템 생성',     path: '/player/home/7' },
  { num: 8, title: '#TEMP',      desc: '추가 아이템 생성',     path: '/player/home/8' },
];

export default function PlayerHomeMenu() {
  const nav = useNavigate();

  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        {BUTTONS.map(({ num, title, desc, path }) => (
          <button
            key={num}
            className={styles.card}
            onClick={() => nav(path)}
          >
            <div className={styles.step}>STEP {num}</div>
            <div className={styles.title}>{title}</div>
            <div className={styles.desc}>{desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
