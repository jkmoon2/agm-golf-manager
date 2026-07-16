// src/screens/Step3.jsx

import React, { useContext, useRef, useState } from "react";
import styles from "./Step3.module.css";
import { StepContext } from "../flows/StepFlow";

export default function Step3() {

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

  const {
    uploadMethod,
    setUploadMethod,
    initManual,
    handleFile,
    goPrev,
    goNext
  } = useContext(StepContext);

  // ✅ 자동(엑셀) 업로드는 기존 운영 흐름처럼 STEP3의 “다음”에서 파일 선택 → 파싱 → STEP4 이동
  // - STEP4 진입 후 uploadMethod/eventData 동기화 타이밍에 따라 파일 선택 UI가 숨겨지는 문제를 피함
  // - 파일 선택을 취소하면 STEP3에 그대로 머물고, 선택 완료 시에만 STEP4로 이동
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleNextClick = () => {
    if (uploadMethod === "auto") {
      try {
        fileInputRef.current && fileInputRef.current.click();
      } catch (e) {}
      return;
    }
    goNext();
  };

  const handleAutoFileChange = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;
    try {
      setIsUploading(true);
      if (typeof handleFile === "function") {
        // React 이벤트 객체 상태와 무관하게 파일 객체만 순수 객체로 전달
        await handleFile({ target: { files: [file] } });
      }
      await goNext({ uploadMethod: "auto" });
    } catch (err) {
      console.warn("[Step3] excel upload failed:", err);
      alert(`엑셀 업로드 중 오류가 발생했습니다.
${err?.message || err?.code || ""}`);
    } finally {
      setIsUploading(false);
      try {
        if (e?.target) e.target.value = "";
      } catch {}
    }
  };

  // 업로드 방식이 선택되어야 다음으로 넘어갈 수 있습니다
  const canNext = uploadMethod === "auto" || uploadMethod === "manual";

  return (
    <div className={`${styles.step} ${styles.step3}`} style={__pageStyle}>
      {/* 자동 업로드 파일 입력: STEP3 다음 버튼에서 직접 열어 기존 흐름 유지 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleAutoFileChange}
        style={{ display: "none" }}
      />

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

      {/* ▼ 하단 버튼: 좌/우 여백 추가 */}
      <div
        className={styles.stepFooter}
        style={{
          position:"fixed", left:0, right:0, bottom: __safeBottom, zIndex: 5,
          boxSizing:'border-box', padding:'12px 16px'
        }}
      >
        <button onClick={goPrev}>← 이전</button>
        <button disabled={!canNext || isUploading} onClick={handleNextClick}>
          {isUploading ? "업로드 중..." : "다음 →"}
        </button>
      </div>
    </div>
  );
}
