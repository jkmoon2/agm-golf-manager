// src/screens/Step1.jsx

import React, { useState, useEffect, useRef, useContext } from "react";
import styles from "./Step1.module.css";
import { StepContext } from "../flows/StepFlow";

export default function Step1() {
  const { mode, setMode, title, setTitle, resetAll, goNext } = useContext(StepContext);

  const [localTitle, setLocalTitle] = useState(title || "");
  useEffect(() => {
    setLocalTitle(title || "");
  }, [title]);

  const [composing, setComposing] = useState(false);
  const inputRef = useRef();

  const handleCompositionStart = () => {
    setComposing(true);
  };
  const handleCompositionEnd = (e) => {
    setComposing(false);
    setLocalTitle(e.target.value);
  };

  const canNext = localTitle.trim() !== "";

  return (
    <div className={`${styles.step} ${styles.step1}`}>
      <div className={styles.stepBody}>
        {/* 모드 선택 */}
        <div className={styles.btnGroup}>
          <button
            className={mode === "stroke" ? styles.active : undefined}
            onClick={() => setMode('stroke')}
          >
            스트로크 모드
          </button>
          <button
            className={mode === "agm" ? styles.active : undefined}
            onClick={() => setMode('agm')}
          >
            AGM 포볼 모드
          </button>
        </div>

        {/* 대회 제목 입력 */}
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
              const final = e.target.value.trim();
              setLocalTitle(final);
              setTitle(final);
            }
          }}
        />
      </div>

      {/* 하단 버튼 */}
      <div className={styles.stepFooter}>
        {/* 전체 초기화 */}
        <button
          style={{ background: "#d32f2f", color: "#fff", marginRight: 8 }}
          onClick={() => {
            if (window.confirm("정말 전체 초기화하시겠습니까?\n(모든 설정이 삭제됩니다)")) {
              resetAll();
              setLocalTitle("");
              setTitle("");
            }
          }}
        >
          전체 초기화
        </button>

        {/* 다음으로 (대회명 입력 후에만 활성화) */}
        <button
          disabled={!canNext}
          onClick={goNext}>
          시작 →
        </button>
      </div>
    </div>
  );
}
