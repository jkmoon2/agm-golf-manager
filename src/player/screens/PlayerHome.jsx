// src/player/screens/PlayerHome.jsx

import React from 'react';
import { useNavigate, useParams } from 'react-router-dom'; // ← 수정: useParams 추가
import styles from './PlayerHome.module.css';

const menu = [
  { step: 1, title: '방 선택',    sub: '스트로크/포볼'       },
  { step: 2, title: '방배정표',    sub: '각 방/팀원 확인'     },
  { step: 3, title: '이벤트',      sub: '이벤트 결과 입력'    },
  { step: 4, title: '접수 입력',   sub: '개인/방 점수 입력'    },
  { step: 5, title: '결과 확인',   sub: '최종결과표/팀결과표'  },
  { step: 6, title: '이벤트 확인', sub: '방별 순위 확인'      },
  { step: 7, title: '#TEMP',       sub: '추가 아이템 생성'    },
  { step: 8, title: '#TEMP',       sub: '추가 아이템 생성'    },
];

export default function PlayerHome() {
  const nav = useNavigate();
  const { eventId } = useParams(); // ← 수정: params에서 eventId 추출

  return (
    <div className={styles.container}>
      {/* ← 수정: 동적 페이지 타이틀 */}
      <h2 className={styles.header}>STEP {eventId} 참가 메뉴</h2>

      <div className={styles.grid}>
        {menu.map(item => (
          <button
            key={item.step}
            className={styles.card}
            onClick={() => nav(`${item.step}`)} // ← 수정: 상대 경로로 STEP 번호 이동
          >
            <div className={styles.step}>STEP {item.step}</div>
            <h3 className={styles.title}>{item.title}</h3>
            <p className={styles.desc}>{item.sub}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
