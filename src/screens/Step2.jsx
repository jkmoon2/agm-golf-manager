// src/screens/Step2.jsx

import React, { useState, useEffect, useContext } from "react";
import styles from "./Step2.module.css";
import { StepContext } from "../flows/StepFlow";

export default function Step2() {

  // ── Context에서만 꺼내세요 ──
  const {
    roomCount,
    setRoomCount,
    roomNames,
    setRoomNames,
    goPrev,
    goNext
  } = useContext(StepContext);

  // ── 로컬 상태 ──
  const defaultCount = Number(roomCount) >= 3 ? roomCount : 4;
  const [localRoomCount, setLocalRoomCount] = useState(defaultCount);
  const [localRoomNames, setLocalRoomNames] = useState(
    Array.isArray(roomNames) && roomNames.length >= defaultCount
      ? roomNames
      : Array.from({ length: defaultCount }, () => "")
  );
  const [composingIdx, setComposingIdx] = useState(null);

  // ── Effect 동기화 로직 (기존 그대로) ──
  useEffect(() => {
    const count = Number(roomCount) >= 3 ? roomCount : 4;
    setLocalRoomCount(count);
    setLocalRoomNames(
      Array.isArray(roomNames) && roomNames.length >= count
        ? roomNames
        : Array.from({ length: count }, () => "")
    );
  }, [roomCount, roomNames]);

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

  // ── 핸들러들 (기존 그대로) ──
  const handleNameCompositionStart = idx => setComposingIdx(idx);
  const handleNameCompositionEnd = (e, idx) => {
    setComposingIdx(null);
    const newNames = [...localRoomNames];
    newNames[idx] = e.target.value;
    setLocalRoomNames(newNames);
  };

  const handleRoomCountBlur = () => {
    let finalCount = Number(localRoomCount);
    if (isNaN(finalCount) || finalCount < 3) finalCount = 3;
    if (finalCount > 20) finalCount = 20;
    setLocalRoomCount(finalCount);
    setRoomCount(finalCount);

    const resized = Array(finalCount).fill("");
    setLocalRoomNames(resized);
    setRoomNames(resized);
  };

  const handleRoomNameBlur = (idx, e) => {
    if (composingIdx !== idx) {
      const tmp = [...localRoomNames];
      tmp[idx] = e.target.value.trim();
      setLocalRoomNames(tmp);
      setRoomNames(tmp);
    }
  };

  return (
    <div className={styles.step}>
      {/* 방 개수 설정 */}
      <div className={styles.roomCountSelector}>
        <button
          className={styles.rpBtn}
          onClick={() => setLocalRoomCount(c => Math.max(3, c - 1))}
          onBlur={handleRoomCountBlur}
        >
          –
        </button>
        {[3, 4, 5, 6, 7, 8].map(n => (
          <button
            key={n}
            className={localRoomCount === n ? styles.active : undefined}
            onClick={() => setLocalRoomCount(n)}
            onBlur={handleRoomCountBlur}
          >
            {n}개
          </button>
        ))}
        <button
          className={styles.rpBtn}
          onClick={() => setLocalRoomCount(c => c + 1)}
          onBlur={handleRoomCountBlur}
        >
          ＋
        </button>
        {/* 숫자 입력 박스는 CSS로 숨김 처리 */}
      </div>

      {/* 방 이름 입력 */}
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

      {/* 이전/다음 버튼 */}
      <div className={styles.stepFooter}>
        <button onClick={goPrev}>← 이전</button>
        <button onClick={goNext}>다음 →</button>
      </div>
    </div>
  );
}
