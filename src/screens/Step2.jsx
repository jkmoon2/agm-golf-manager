// src/screens/Step2.jsx

import React, { useState, useEffect, useContext } from "react";
import styles from "./Step2.module.css";
import { StepContext } from "../flows/StepFlow";
import { EventContext } from "../contexts/EventContext";
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function Step2() {

  // ── iOS Safe-Bottom & BottomTab 대응 (footer 고정 + 컨텐츠 스크롤) ─────────
  const [__bottomGap, __setBottomGap] = React.useState(64);
  React.useEffect(() => {
    const probe = () => {
      try {
        const el = document.querySelector('[data-bottom-nav]') 
               || document.querySelector('#bottomTabBar') 
               || document.querySelector('.bottomTabBar') 
               || document.querySelector('.BottomTabBar');
        __setBottomGap(el && el.offsetHeight ? el.offsetHeight : 64);
      } catch {}
    };
    probe();
    window.addEventListener('resize', probe);
    return () => window.removeEventListener('resize', probe);
  }, []);
  const __FOOTER_H = 56;
  const __safeBottom = `calc(env(safe-area-inset-bottom, 0px) + ${__bottomGap}px)`;
  const __pageStyle  = { minHeight:'100dvh', boxSizing:'border-box', paddingBottom:`calc(${__FOOTER_H}px + ${__safeBottom})` };

  // Context에서 방 정보와 네비게이션 함수 가져오기
  const {
    roomCount,
    setRoomCount,
    roomNames,
    setRoomNames,
    goPrev,
    goNext
  } = useContext(StepContext);

  // EventContext에서 현재 eventId 가져오기
  const { eventId } = useContext(EventContext);

  // 로컬 상태: 방 개수, 방 이름 목록
  const defaultCount = Number(roomCount) >= 3 ? roomCount : 4;
  const [localRoomCount, setLocalRoomCount] = useState(defaultCount);
  const [localRoomNames, setLocalRoomNames] = useState(
    Array.isArray(roomNames) && roomNames.length >= defaultCount
      ? roomNames
      : Array.from({ length: defaultCount }, () => "")
  );
  const [composingIdx, setComposingIdx] = useState(null);

  // Context 변경 시 로컬 상태 동기화
  useEffect(() => {
    const count = Number(roomCount) >= 3 ? roomCount : 4;
    setLocalRoomCount(count);
    setLocalRoomNames(
      Array.isArray(roomNames) && roomNames.length >= count
        ? roomNames
        : Array.from({ length: count }, () => "")
    );
  }, [roomCount, roomNames]);

  // 로컬 개수 변경 시 이름 배열 크기 조정
  useEffect(() => {
    const count = Number(localRoomCount) || 0;
    if (count < 1) return;
    setLocalRoomNames(prev => {
      const copy = [...prev];
      if (copy.length < count) {
        return copy.concat(Array(count - copy.length).fill(""));
      } else if (copy.length > count) {
        return copy.slice(0, count);
      }
      return copy;
    });
  }, [localRoomCount]);

  // 방 이름 입력 중 한글 조합 방지
  const handleNameCompositionStart = idx => setComposingIdx(idx);
  const handleNameCompositionEnd = (e, idx) => {
    setComposingIdx(null);
    const newNames = [...localRoomNames];
    newNames[idx] = e.target.value;
    setLocalRoomNames(newNames);
  };

  // 로컬 개수 변경 시 즉시 blur 핸들러 호출
  const applyRoomCount = count => {
    let finalCount = Number(count);
    if (isNaN(finalCount) || finalCount < 3) finalCount = 3;
    if (finalCount > 20) finalCount = 20;
    setLocalRoomCount(finalCount);
    setRoomCount(finalCount);

    const resized = Array(finalCount).fill("");
    setLocalRoomNames(resized);
    setRoomNames(resized);
  };

  // 방 이름 blur 시 최종값 Context 저장
  const handleRoomNameBlur = (idx, e) => {
    if (composingIdx !== idx) {
      const tmp = [...localRoomNames];
      tmp[idx] = e.target.value.trim();
      setLocalRoomNames(tmp);
      setRoomNames(tmp);
    }
  };

  // Firestore에 방 정보 저장 후 Context 업데이트, 다음 스텝 이동
  const handleNext = async () => {
    if (!eventId) {
      alert('이벤트 ID가 없습니다. 다시 시작해주세요.');
      return;
    }
    // 1) Firestore 업데이트
    await updateDoc(doc(db, 'events', eventId), {
      roomCount: localRoomCount,
      roomNames: localRoomNames
    });
    // 2) Context 업데이트
    setRoomCount(localRoomCount);
    setRoomNames(localRoomNames);
    // 3) 다음 STEP
    goNext();
  };

  return (
    <div className={styles.step} style={__pageStyle}>
      {/* 방 개수 설정 UI */}
      <div className={styles.roomCountSelector}>
        <button
          className={styles.rpBtn}
          onClick={() => applyRoomCount(localRoomCount - 1)}
        >−</button>
        {[3, 4, 5, 6, 7, 8].map(n => (
          <button
            key={n}
            className={localRoomCount === n ? styles.active : undefined}
            onClick={() => applyRoomCount(n)}
          >{n}개</button>
        ))}
        <button
          className={styles.rpBtn}
          onClick={() => applyRoomCount(localRoomCount + 1)}
        >＋</button>
      </div>

      {/* 방 이름 입력 UI */}
      <div className={styles.roomNames}>
        {localRoomNames.map((name, i) => (
          <div key={i} className={styles.roomNameRow}>
            <label>{i + 1}번 방:</label>
            <input
              type="text"
              value={name}
              onChange={e => {
                const tmp = [...localRoomNames];
                tmp[i] = e.target.value;
                setLocalRoomNames(tmp);
              }}
              onCompositionStart={() => handleNameCompositionStart(i)}
              onCompositionEnd={e => handleNameCompositionEnd(e, i)}
              onBlur={e => handleRoomNameBlur(i, e)}
            />
          </div>
        ))}
      </div>

      {/* ▼ 하단 버튼: 좌/우 여백 추가 */}
      <div
        className={styles.stepFooter}
        style={{
          position:"fixed", left:0, right:0, bottom: __safeBottom, zIndex: 5,
          boxSizing:'border-box', padding:'12px 16px'
        }}
      >
        <button onClick={goPrev}>← 이전</button>
        <button onClick={handleNext}>다음 →</button>
      </div>
    </div>
  );
}
