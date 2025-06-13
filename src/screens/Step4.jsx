// src/screens/Step4.jsx

import React, { useContext } from "react";
import styles from "./Step4.module.css";
import { db, firebase } from "../firebase";
import { useNavigate } from "react-router-dom";
import { StepContext } from "../flows/StepFlow";

export default function Step4(props) {
  const navigate = useNavigate();
  const {
    uploadMethod,
    participants,
    setParticipants,
    roomCount,
    handleFile
  } = useContext(StepContext);

  // ─────────────────────────────────────────────────────────
  // 1) 참가자 목록 로컬 토글 선택 (체크박스)
  // ─────────────────────────────────────────────────────────
  const toggleSelect = (i) => {
    const c = [...participants];
    c[i].selected = !c[i].selected;
    setParticipants(c);
  };

  // ─────────────────────────────────────────────────────────
  // 2) 참가자 추가: 로컬 state에도 추가하고 Firestore에도 신규 문서 생성
  // ─────────────────────────────────────────────────────────
  const addParticipant = async () => {
    const newId = participants.length;
    const newObj = {
      id:       newId,
      group:    1,
      nickname: "",
      handicap: 0,
      score:    null,
      room:     null,
      partner:  null,
      selected: false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = db
      .collection("events")
      .doc("golf-2023-spring")
      .collection("participants")
      .doc(String(newId));
    await docRef.set(newObj);
    setParticipants((p) => [...p, newObj]);
  };

  // ─────────────────────────────────────────────────────────
  // 3) 선택된 참가자 삭제
  // ─────────────────────────────────────────────────────────
  const delSelected = async () => {
    const toDeleteIds = participants
      .filter((x) => x.selected)
      .map((x) => x.id);

    const batch = db.batch();
    const collRef = db
      .collection("events")
      .doc("golf-2023-spring")
      .collection("participants");
    toDeleteIds.forEach((id) => {
      batch.delete(collRef.doc(String(id)));
    });
    await batch.commit();
    setParticipants((p) => p.filter((x) => !x.selected));
  };

  // ─────────────────────────────────────────────────────────
  // 4) “조” 변경
  // ─────────────────────────────────────────────────────────
  const changeGroup = async (i, newGroup) => {
    const c = [...participants];
    c[i].group = newGroup;
    setParticipants(c);
    const docRef = db
      .collection("events")
      .doc("golf-2023-spring")
      .collection("participants")
      .doc(String(c[i].id));
    await docRef.update({
      group:    newGroup,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  };

  // ─────────────────────────────────────────────────────────
  // 5) “닉네임/핸디” 입력
  // ─────────────────────────────────────────────────────────
  const changeNickname = async (i, newName) => {
    const c = [...participants];
    c[i].nickname = newName;
    setParticipants(c);
    const docRef = db
      .collection("events")
      .doc("golf-2023-spring")
      .collection("participants")
      .doc(String(c[i].id));
    await docRef.update({
      nickname: newName,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  };

  const changeHandicap = async (i, newHd) => {
    const c = [...participants];
    c[i].handicap = newHd;
    setParticipants(c);
    const docRef = db
      .collection("events")
      .doc("golf-2023-spring")
      .collection("participants")
      .doc(String(c[i].id));
    await docRef.update({
      handicap: newHd,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  };

  return (
    <div className={`${styles.step} ${styles.step4}`}>

      {/* 2차 헤더: 파일 선택 / 총 슬롯 */}
      <div
        className={`${styles.excelHeader} ${
          uploadMethod === "manual" ? styles.manual : ""
        }`}
      >
        {uploadMethod === "auto" && (
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
          />
        )}
        <span className={styles.total}>총 슬롯: {roomCount * 4}명</span>
      </div>

      {/* 3차 헤더: 컬럼 타이틀 */}
      <div className={styles.participantRowHeader}>
        <div className={`${styles.cell} ${styles.group}`}>조</div>
        <div className={`${styles.cell} ${styles.nickname}`}>닉네임</div>
        <div className={`${styles.cell} ${styles.handicap}`}>G핸디</div>
        <div className={`${styles.cell} ${styles.delete}`}>선택</div>
      </div>

      {/* 리스트 영역 */}
      <div className={styles.participantTable}>
        {participants.map((p, i) => (
          <div key={p.id} className={styles.participantRow}>
            <div className={`${styles.cell} ${styles.group}`}>
              <select
                className={styles.groupSelect}
                value={p.group}
                onChange={(e) => changeGroup(i, Number(e.target.value))}
              >
                {Array.from({ length: roomCount }, (_, idx) => idx + 1).map(
                  (n) => (
                    <option key={n} value={n}>
                      {n}조
                    </option>
                  )
                )}
              </select>
            </div>
            <div className={`${styles.cell} ${styles.nickname}`}>
              <input
                type="text"
                placeholder="닉네임"
                value={p.nickname}
                onChange={(e) => changeNickname(i, e.target.value)}
              />
            </div>
            <div className={`${styles.cell} ${styles.handicap}`}>
              <input
                type="number"
                value={p.handicap}
                onChange={(e) =>
                  changeHandicap(i, Number(e.target.value))
                }
              />
            </div>
            <div className={`${styles.cell} ${styles.delete}`}>
              <input
                type="checkbox"
                checked={p.selected || false}
                onChange={() => toggleSelect(i)}
              />
            </div>
          </div>
        ))}
      </div>

      {/* 하단 버튼 (이전/추가/삭제/다음) */}
      <div className={styles.stepFooter}>
        <button onClick={() => navigate("/step/3")}>← 이전</button>
        <button onClick={() => addParticipant()}>추가</button>
        <button onClick={() => delSelected()}>삭제</button>
        <button onClick={() => navigate("/step/5")}>다음 →</button>
      </div>
    </div>
  );
}
