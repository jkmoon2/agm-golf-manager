// src/screens/Step3.jsx

import React, { useContext } from "react";
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
    goPrev,
    goNext
  } = useContext(StepContext);

  // 업로드 방식이 선택되어야 다음으로 넘어갈 수 있습니다
  const canNext = uploadMethod === "auto" || uploadMethod === "manual";

  return (
    <div className={`${styles.step} ${styles.step3}`} style={__pageStyle}>
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
      <div className={styles.stepFooter} style={{position:"fixed", left:0, right:0, bottom: __safeBottom, zIndex: 5}}>
        <button onClick={goPrev}>← 이전</button>
        <button disabled={!canNext} onClick={goNext}>
          다음 →
        </button>
      </div>
    </div>
  );
}
