// src/screens/Step3.jsx

import React, { useContext } from "react";
import styles from "./Step3.module.css";
import { StepContext } from "../flows/StepFlow";

export default function Step3() {
  const {
    uploadMethod,
    setUploadMethod,
    initManual,
    goPrev,
    goNext
  } = useContext(StepContext);

  // 업로드 방식이 선택되어야 다음으로 넘어갈 수 있습니다
  const canNext = uploadMethod === "auto" || uploadMethod === "manual";

  return (
    <div className={`${styles.step} ${styles.step3}`}>
      {/* 본문 영역: 자동/수동 선택만 표시 */}
      <div className={styles.stepBody}>
        <div className={styles.uploadTypeBtns}>
          <button
            className={uploadMethod === "auto" ? styles.active : undefined}
            onClick={() => setUploadMethod("auto")}
          >
            자동(엑셀) 업로드
          </button>
          <button
            className={uploadMethod === "manual" ? styles.active : undefined}
            onClick={() => {
              setUploadMethod("manual");
              initManual();
            }}
          >
            수동(직접 입력)
          </button>
        </div>
      </div>

      {/* 하단 네비게이션 버튼 */}
      <div className={styles.stepFooter}>
        <button onClick={goPrev}>← 이전</button>
        <button disabled={!canNext} onClick={goNext}>
          다음 →
        </button>
      </div>
    </div>
  );
}
