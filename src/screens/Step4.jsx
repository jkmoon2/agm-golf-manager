// src/screens/Step4.jsx

import React, { useContext } from "react";
import styles from "./Step4.module.css";
import { StepContext } from "../flows/StepFlow";
import { EventContext } from "../contexts/EventContext";                 // 추가 import
import {
  doc,
  collection,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';                                                      // 모듈식 Firestore
import { db } from '../firebase';

export default function Step4(props) {
  const {
    uploadMethod,
    participants,
    setParticipants,
    roomCount,
    handleFile,
    goPrev,
    goNext
  } = useContext(StepContext);

  const { eventId } = useContext(EventContext);                                  // 추가 컨텍스트

  // 1) 참가자 선택 토글
  const toggleSelect = (i) => {
    const c = [...participants];
    c[i].selected = !c[i].selected;
    setParticipants(c);
  };

  // 2) 참가자 추가
  const addParticipant = async () => {
    if (!eventId) return alert('이벤트가 설정되지 않았습니다.');
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
      updatedAt: serverTimestamp(),
    };

    const docRef = doc(db, 'events', eventId, 'participants', String(newId));   // eventId 사용
    await setDoc(docRef, newObj);
    setParticipants((p) => [...p, newObj]);
  };

  // 3) 선택된 참가자 삭제
  const delSelected = async () => {
    if (!eventId) return alert('이벤트가 설정되지 않았습니다.');
    const toDeleteIds = participants
      .filter((x) => x.selected)
      .map((x) => x.id);

    const batch = writeBatch(db);
    const collRef = collection(db, 'events', eventId, 'participants');            // eventId 사용
    toDeleteIds.forEach((id) => {
      batch.delete(doc(collRef, String(id)));
    });
    await batch.commit();
    setParticipants((p) => p.filter((x) => !x.selected));
  };

  // 4) 그룹 변경
  const changeGroup = async (i, newGroup) => {
    if (!eventId) return;
    const c = [...participants];
    c[i].group = newGroup;
    setParticipants(c);
    const docRef = doc(db, 'events', eventId, 'participants', String(c[i].id));
    await updateDoc(docRef, {
      group: newGroup,
      updatedAt: serverTimestamp(),
    });
  };

  // 5) 닉네임/핸디 입력
  const changeNickname = async (i, newName) => {
    if (!eventId) return;
    const c = [...participants];
    c[i].nickname = newName;
    setParticipants(c);
    const docRef = doc(db, 'events', eventId, 'participants', String(c[i].id));
    await updateDoc(docRef, {
      nickname: newName,
      updatedAt: serverTimestamp(),
    });
  };

  const changeHandicap = async (i, newHd) => {
    if (!eventId) return;
    const c = [...participants];
    c[i].handicap = newHd;
    setParticipants(c);
    const docRef = doc(db, 'events', eventId, 'participants', String(c[i].id));
    await updateDoc(docRef, {
      handicap: newHd,
      updatedAt: serverTimestamp(),
    });
  };

  return (
    <div className={`${styles.step} ${styles.step4}`}>  

      {/* 2차 헤더: 파일 선택 / 총 슬롯 */}
      <div className={`${styles.excelHeader} ${
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
                onChange={(e) => changeHandicap(i, Number(e.target.value))}
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
        <button onClick={goPrev}>← 이전</button>
        <button onClick={addParticipant}>추가</button>
        <button onClick={delSelected}>삭제</button>
        <button onClick={goNext}>다음 →</button>
      </div>
    </div>
  );
}
