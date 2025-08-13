// src/screens/Step4.jsx

import React, { useContext, useState, useEffect } from "react";
import styles from "./Step4.module.css";
import { StepContext } from "../flows/StepFlow";
import { EventContext } from "../contexts/EventContext";
import {
  doc,
  collection,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
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

  const { eventId } = useContext(EventContext);

  // ✅ G핸디 입력용 임시 문자열 상태 (id -> string)
  //    - ''(빈 문자열), '-'(마이너스) 허용
  const [hdInput, setHdInput] = useState({});

  // participants가 바뀔 때, 아직 draft가 없는 id만 초기화
  useEffect(() => {
    setHdInput(prev => {
      const next = { ...prev };
      for (const p of participants) {
        const key = String(p.id);
        if (!(key in next)) {
          next[key] = p.handicap === null || p.handicap === undefined ? '' : String(p.handicap);
        }
      }
      return next;
    });
  }, [participants]);

  // ✅ 공통 업서트 헬퍼: updateDoc 실패 시 setDoc(merge)로 안전 생성
  const upsertParticipantFields = async (pid, baseObj, patch) => {
    if (!eventId) return;
    const ref = doc(db, 'events', eventId, 'participants', String(pid));
    try {
      await updateDoc(ref, {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      const msg = String(e?.message || '');
      const notFound = e?.code === 'not-found' || msg.includes('No document to update');
      if (notFound) {
        await setDoc(
          ref,
          {
            id: baseObj?.id ?? pid,
            group: baseObj?.group ?? 1,
            nickname: baseObj?.nickname ?? '',
            handicap: baseObj?.handicap ?? null,
            score: baseObj?.score ?? null,
            room: baseObj?.room ?? null,
            partner: baseObj?.partner ?? null,
            selected: baseObj?.selected ?? false,
            ...patch,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        console.error('[Step4] upsertParticipantFields error:', e);
        throw e;
      }
    }
  };

  // 1) 참가자 선택 토글 (기존)
  const toggleSelect = (i) => {
    const c = [...participants];
    c[i].selected = !c[i].selected;
    setParticipants(c);
  };

  // 2) 참가자 추가 (기존)
  const addParticipant = async () => {
    if (!eventId) return alert('이벤트가 설정되지 않았습니다.');
    const newId = participants.length;
    const newObj = {
      id:       newId,
      group:    1,
      nickname: "",
      handicap: null, // 새 슬롯은 기본 null
      score:    null,
      room:     null,
      partner:  null,
      selected: false,
      updatedAt: serverTimestamp(),
    };

    const docRef = doc(db, 'events', eventId, 'participants', String(newId));
    await setDoc(docRef, newObj, { merge: true });
    setParticipants((p) => [...p, newObj]);
    setHdInput(prev => ({ ...prev, [String(newId)]: '' }));
  };

  // 3) 선택된 참가자 삭제 (기존)
  const delSelected = async () => {
    if (!eventId) return alert('이벤트가 설정되지 않았습니다.');
    const toDeleteIds = participants
      .filter((x) => x.selected)
      .map((x) => x.id);

    const batch = writeBatch(db);
    const collRef = collection(db, 'events', eventId, 'participants');
    toDeleteIds.forEach((id) => {
      batch.delete(doc(collRef, String(id)));
    });
    await batch.commit();
    setParticipants((p) => p.filter((x) => !x.selected));
    setHdInput(prev => {
      const next = { ...prev };
      toDeleteIds.forEach(id => { delete next[String(id)]; });
      return next;
    });
  };

  // 4) 그룹 변경 — 업서트 유지
  const changeGroup = async (i, newGroup) => {
    if (!eventId) return;
    const c = [...participants];
    c[i] = { ...c[i], group: newGroup };
    setParticipants(c);
    await upsertParticipantFields(c[i].id, c[i], { group: newGroup });
  };

  // 5) 닉네임 변경 — 업서트 유지
  const changeNickname = async (i, newName) => {
    if (!eventId) return;
    const c = [...participants];
    c[i] = { ...c[i], nickname: newName };
    setParticipants(c);
    await upsertParticipantFields(c[i].id, c[i], { nickname: newName });
  };

  // 6-A) G핸디 입력(onChange): 숫자 확정 전까지는 문자열로만 보관 ('' / '-' 허용)
  const changeHandicapDraft = (pid, raw) => {
    setHdInput(prev => ({ ...prev, [String(pid)]: raw }));
  };

  // 6-B) G핸디 확정(commit): blur 또는 Enter에서만 숫자/ null 로 저장 + 업서트
  const commitHandicap = async (i) => {
    if (!eventId) return;
    const pid = participants[i].id;
    const raw = (hdInput[String(pid)] ?? '').trim();

    // 허용 패턴: '', '-', 또는 정수/소수(마이너스 허용)
    // '' 또는 '-' → null 로 확정
    let finalVal = null;
    if (raw !== '' && raw !== '-') {
      const num = Number(raw);
      finalVal = Number.isFinite(num) ? num : null;
    }

    // 로컬 상태 반영
    const c = [...participants];
    c[i] = { ...c[i], handicap: finalVal };
    setParticipants(c);

    // Firestore 업서트
    await upsertParticipantFields(pid, c[i], { handicap: finalVal });

    // 확정 후 표시 문자열도 동기화
    setHdInput(prev => ({
      ...prev,
      [String(pid)]: finalVal === null ? '' : String(finalVal)
    }));
  };

  // Enter로 확정
  const onHdKeyDown = (e, i) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur(); // onBlur에서 commitHandicap 호출
    }
  };

  return (
    <div className={`${styles.step} ${styles.step4}`}>
      {/* 2차 헤더: 파일 선택 / 총 슬롯 */}
      <div className={`${styles.excelHeader} ${uploadMethod === "manual" ? styles.manual : ""}`}>
        {uploadMethod === "auto" && (
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
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
                {Array.from({ length: roomCount }, (_, idx) => idx + 1).map((n) => (
                  <option key={n} value={n}>{n}조</option>
                ))}
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
              {/* ⬇️ type='text'로 변경, 입력 단계는 문자열 유지 */}
              <input
                type="text"
                inputMode="decimal"        // 모바일 키패드 유도
                placeholder="G핸디"
                value={hdInput[String(p.id)] ?? (p.handicap ?? '')}
                onChange={(e) => changeHandicapDraft(p.id, e.target.value)}
                onBlur={() => commitHandicap(i)}
                onKeyDown={(e) => onHdKeyDown(e, i)}
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
