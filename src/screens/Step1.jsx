// src/screens/Step1.jsx

import React, { useState, useEffect, useRef, useContext } from "react";
import styles from "./Step1.module.css";
import { StepContext } from "../flows/StepFlow";
import { EventContext } from "../contexts/EventContext";  // [변경]
import EventSelector from "../components/EventSelector";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export default function Step1() {
  // StepContext: mode, setMode, title, setTitle, resetAll, goNext
  const { mode, setMode, title, setTitle, resetAll, goNext } = useContext(StepContext);
  // EventContext: eventId, loadEvent
  const { eventId, loadEvent } = useContext(EventContext);

  // 로컬 입력값 관리
  const [localTitle, setLocalTitle] = useState(title || "");
  useEffect(() => {
    setLocalTitle(title || "");
  }, [title]);

  const [composing, setComposing] = useState(false);
  const inputRef = useRef();
  const handleCompositionStart = () => setComposing(true);
  const handleCompositionEnd  = e => {
    setComposing(false);
    setLocalTitle(e.target.value);
  };

  const canNext = localTitle.trim() !== "";

  // eventId 없으면 대회 관리(홈) 화면으로
  if (!eventId) {
    return <EventSelector />;
  }

  // 시작 버튼 핸들러
  const handleStart = async () => {
    if (!canNext) return;
    const final = localTitle.trim();
    setTitle(final);
    if (!eventId) {
      const newId = `${mode}-${Date.now()}`;
      await setDoc(doc(db, "events", newId), {
        mode,
        title: final,
        roomCount: 4,
        roomNames: Array(4).fill(""),
        allowStep1: false,
        allowStep2: false,
        allowStep3: false,
        allowStep4: false,
        allowStep5: false,
        allowStep6: false,
        allowStep7: false,
        allowStep8: false,
        allowSeeRoommates: false,
      });
      await loadEvent(newId);
    }
    goNext();
  };

  return (
    <div className={`${styles.step} ${styles.step1}`}>      
      <div className={styles.stepBody}>
        {/* 모드 선택 */}
        <div className={styles.btnGroup}>
          <button
            className={mode === "stroke" ? styles.active : undefined}
            onClick={() => setMode("stroke")}
          >스트로크 모드</button>
          <button
            className={mode === "fourball" ? styles.active : undefined}
            onClick={() => setMode("fourball")}
          >AGM 포볼 모드</button>
        </div>

        {/* 대회명 입력 */}
        <input
          ref={inputRef}
          type="text"
          className={styles.fullWidthInput}
          placeholder="대회 제목을 입력하세요"
          value={localTitle}
          onChange={e => setLocalTitle(e.target.value)}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onBlur={e => {
            if (!composing) {
              const t = e.target.value.trim();
              setLocalTitle(t);
              setTitle(t);
            }
          }}
        />
      </div>

      <div className={styles.stepFooter}>
        {/* 전체 초기화 */}
        <button
          style={{ background: "#d32f2f", color: "#fff", marginRight: 8 }}
          onClick={async () => {
            if (window.confirm("정말 전체 초기화하시겠습니까?\n(모든 설정이 삭제됩니다)")) {
              resetAll();
              setLocalTitle("");
              setTitle("");
              await loadEvent(null);  // 이벤트 선택 취소
            }
          }}
        >전체 초기화</button>

        {/* 시작 → */}
        <button disabled={!canNext} onClick={handleStart}>
          시작 →
        </button>
      </div>
    </div>
  );
}
