// src/screens/Step2.jsx

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Step2.module.css";

export default function Step2({
  step,
  roomCount,
  setRoomCount,
  roomNames,
  setRoomNames
}) {
  const navigate = useNavigate();

  // 기본 방 개수: props.roomCount가 없거나 3 미만이면 4로 초기화
  const defaultCount = Number(roomCount) >= 3 ? roomCount : 4;

  // 1) 로컬 상태: localRoomCount, localRoomNames
  const [localRoomCount, setLocalRoomCount] = useState(defaultCount);
  const [localRoomNames, setLocalRoomNames] = useState(
    Array.isArray(roomNames) && roomNames.length >= defaultCount
      ? roomNames
      : Array.from({ length: defaultCount }, () => "")
  );
  const [composingIdx, setComposingIdx] = useState(null);

  // 2) props가 바뀔 때마다 local 상태 동기화
  useEffect(() => {
    const count = Number(roomCount) >= 3 ? roomCount : 4;
    setLocalRoomCount(count);
    setLocalRoomNames(
      Array.isArray(roomNames) && roomNames.length >= count
        ? roomNames
        : Array.from({ length: count }, () => "")
    );
  }, [roomCount, roomNames]);

  // 3) localRoomCount가 바뀔 때마다 localRoomNames 길이 맞춤
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

  // 4) IME 조합 추적용
  const handleNameCompositionStart = idx => {
    setComposingIdx(idx);
  };
  const handleNameCompositionEnd = (e, idx) => {
    setComposingIdx(null);
    const newNames = [...localRoomNames];
    newNames[idx] = e.target.value;
    setLocalRoomNames(newNames);
  };

  // 5) 방 개수 onBlur 시 Firestore 쓰기
  const handleRoomCountBlur = () => {
    let finalCount = Number(localRoomCount);
    if (isNaN(finalCount) || finalCount < 3) finalCount = 3;
    if (finalCount > 20) finalCount = 20;
    setLocalRoomCount(finalCount);

    // Firestore에 방 개수 저장
    setRoomCount(finalCount);

    // 방 이름 배열도 초기화
    const resizedNames = Array(finalCount).fill("");
    setLocalRoomNames(resizedNames);
    setRoomNames(resizedNames);
  };

  // 6) 방 이름 onBlur 시 Firestore 쓰기
  const handleRoomNameBlur = (idx, e) => {
    if (composingIdx !== idx) {
      const tmp = [...localRoomNames];
      tmp[idx] = e.target.value.trim();
      setLocalRoomNames(tmp);
      setRoomNames(tmp);
    }
  };

  return (
    <div className={`${styles.step} ${styles.step2}`}>
      {/* stepBody 클래스로 변경 */}
      <div className={styles.stepBody}>
        {/* ─── 방 개수 선택 영역 ─── */}
        <div className={styles.roomCountSelector}>
          <button
            className={styles.rpBtn}
            onClick={() => setLocalRoomCount(c => Math.max(3, c - 1))}
          >
            –
          </button>
          {[3, 4, 5, 6, 7, 8].map(n => (
            <button
              key={n}
              className={localRoomCount === n ? styles.active : undefined}
              onClick={() => setLocalRoomCount(n)}
            >
              {n}개
            </button>
          ))}
          <button
            className={styles.rpBtn}
            onClick={() => setLocalRoomCount(c => c + 1)}
          >
            ＋
          </button>

          <input
            type="number"
            value={localRoomCount}
            onChange={e => {
              const v = Number(e.target.value);
              setLocalRoomCount(isNaN(v) ? 3 : v);
            }}
            onBlur={handleRoomCountBlur}
            min={3}
            max={20}
          />
        </div>

        {/* ─── 방 이름 입력 영역 (스크롤 가능) ─── */}
        <div className={`${styles.roomNames} ${styles.scrollArea}`}>
          {(localRoomNames || []).map((name, i) => (
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
      </div>

      {/* stepFooter는 CSS에서 정의된 styles.stepFooter */}
      <div className={styles.stepFooter}>
        <button onClick={() => navigate("/step/1")}>← 이전</button>
        <button onClick={() => navigate("/step/3")}>다음 →</button>
      </div>
    </div>
  );
}
