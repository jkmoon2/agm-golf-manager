// src/screens/Step4.jsx
// (원본 최대 유지 + 파일명 배지/영구 저장 + applyNewRoster 연동 + eventData 타이밍 보강)
// + G핸디 수정 시 이벤트 문서까지 동기화
// + G핸디 입력칸 길게 누르면 '-' 자동 입력(부분 숫자 허용)

import React, { useContext, useEffect, useRef, useState } from "react";
import styles from "./Step4.module.css";
import { StepContext } from "../flows/StepFlow";
import { EventContext } from "../contexts/EventContext";
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import * as XLSX from "xlsx";
import { getAuth } from "firebase/auth";

// 구버전 호환 키(사용자 로컬 저장 시 이전 버전과 호환)
const LEGACY_LAST_SELECTED_FILENAME_KEY = "agm_step4_filename";

// 페이지 전환 간에도 남는 간단 메모리 캐시
let __STEP4_FILE_CACHE = "";

// G핸디 입력 시 부분 숫자(-, ., -., 공백) 허용
function isPartialNumber(str) {
  if (str === "") return true;
  if (str === "-" || str === "." || str === "-.") return true;
  return /^-?\d+(\.\d*)?$/.test(str);
}

export default function Step4() {
  // ─────────────────────────────────────────────────────────────────────────────
  // 하단 네비게이션 안전 영역(원본 유지)
  // ─────────────────────────────────────────────────────────────────────────────
  const [__bottomGap, __setBottomGap] = useState(64);
  useEffect(() => {
    const probe = () => {
      try {
        const el =
          document.querySelector("[data-bottom-nav]") ||
          document.querySelector("#bottomTabBar") ||
          document.querySelector(".bottomTabBar") ||
          document.querySelector(".BottomTabBar");
        __setBottomGap(el && el.offsetHeight ? el.offsetHeight : 64);
      } catch (e) {}
    };
    probe();
    window.addEventListener("resize", probe);
    return () => window.removeEventListener("resize", probe);
  }, []);
  const __FOOTER_H = 56;
  const __safeBottom = `calc(env(safe-area-inset-bottom, 0px) + ${__bottomGap}px)`;
  const pageStyle = {
    minHeight: "100dvh",
    boxSizing: "border-box",
    paddingBottom: `calc(${__FOOTER_H}px + ${__safeBottom})`,
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // StepFlow 컨텍스트(원본 유지)
  // ─────────────────────────────────────────────────────────────────────────────
  const {
    uploadMethod,
    participants,
    setParticipants,
    roomCount,
    handleFile, // 기존 파서
    goPrev,
    goNext,
    mode, // 'stroke' | 'fourball'
  } = useContext(StepContext);

  // ─────────────────────────────────────────────────────────────────────────────
  // EventContext 유틸(파일명 저장/복원 + 서버 원샷 반영)
  // ─────────────────────────────────────────────────────────────────────────────
  const {
    eventId,
    eventData, // 문서 스냅샷 도착 시 파일명 배지 재동기화
    rememberUploadFilename, // (mode, name)
    getUploadFilename, // (mode) => string
    applyNewRoster, // ({participants, mode, uploadFileName, clearScores})
    // Step4에서 G핸디 변경 시 events/{eventId}.participants도 함께 갱신
    updateEventImmediate,
  } = useContext(EventContext);

  // 최신 participants 참조용 ref (업로드 직후 서버 반영에 사용)
  const participantsRef = useRef(participants);

  // 파일 선택 input ref(파일명 표시를 input에 의존하지 않기 위해 사용)
  const fileInputRef = useRef(null);
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // 이벤트/모드별 파일명 저장 키
  const getFileKey = () =>
    `agm_step4_filename:${eventId || "no-event"}:${mode || "stroke"}`;

  // 최초 마운트 시 저장된 파일명 복원(문서 → 저장소 순으로)
  const [selectedFileName, setSelectedFileName] = useState(() => {
    try {
      const KEY = getFileKey();
      const fromDoc =
        typeof getUploadFilename === "function" ? getUploadFilename(mode) || "" : "";
      const fromKey =
        __STEP4_FILE_CACHE ||
        localStorage.getItem(KEY) ||
        sessionStorage.getItem(KEY) ||
        "";
      const legacy =
        localStorage.getItem(LEGACY_LAST_SELECTED_FILENAME_KEY) ||
        sessionStorage.getItem(LEGACY_LAST_SELECTED_FILENAME_KEY) ||
        "";

      // ✅ 모드/이벤트 분리 우선: 문서 → 모드키(local/session) → 레거시
      return fromDoc || fromKey || legacy || "";
    } catch {
      return "";
    }
  });

  // 라우팅 복귀/모드 변경 시 파일명 재동기화
  useEffect(() => {
    try {
      const KEY = getFileKey();
      const fromDoc =
        typeof getUploadFilename === "function" ? getUploadFilename(mode) || "" : "";
      const fromKey =
        __STEP4_FILE_CACHE ||
        localStorage.getItem(KEY) ||
        sessionStorage.getItem(KEY) ||
        "";
      const legacy =
        localStorage.getItem(LEGACY_LAST_SELECTED_FILENAME_KEY) ||
        sessionStorage.getItem(LEGACY_LAST_SELECTED_FILENAME_KEY) ||
        "";

      // ★ patch: KEY가 비어있고 legacy만 있을 때, 모드/이벤트 키로 승격 저장(모드 분리 유지)
      if (!fromKey && legacy) {
        try {
          localStorage.setItem(KEY, legacy);
          sessionStorage.setItem(KEY, legacy);
        } catch {}
      }

      const next = fromDoc || fromKey || legacy || "";
      if (next !== selectedFileName) setSelectedFileName(next);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, mode]);

  // eventData 스냅샷이 늦게 도착해도 파일명 배지 자동 동기화
  useEffect(() => {
    try {
      const fromDoc =
        typeof getUploadFilename === "function" ? getUploadFilename(mode) || "" : "";
      if (fromDoc && fromDoc !== selectedFileName) {
        setSelectedFileName(fromDoc);
        const KEY = getFileKey();
        __STEP4_FILE_CACHE = fromDoc;
        try {
          localStorage.setItem(KEY, fromDoc);
          sessionStorage.setItem(KEY, fromDoc);
          localStorage.setItem(LEGACY_LAST_SELECTED_FILENAME_KEY, fromDoc);
          sessionStorage.setItem(LEGACY_LAST_SELECTED_FILENAME_KEY, fromDoc);
        } catch {}
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventData, mode]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 참가자 개별 편집
  // ─────────────────────────────────────────────────────────────────────────────
  const [hdInput, setHdInput] = useState({});
  useEffect(() => {
    setHdInput((prev) => {
      const next = { ...prev };
      for (const p of participants) {
        const key = String(p.id);
        if (!(key in next)) {
          next[key] =
            p.handicap === null || p.handicap === undefined ? "" : String(p.handicap);
        }
      }
      return next;
    });
  }, [participants]);

  // G핸디 롱프레스용 타이머(각 참가자별)
  const hdLongPressTimers = useRef({});

  const startLongMinus = (pid) => {
    try {
      const timers = hdLongPressTimers.current || {};
      if (timers[pid]) clearTimeout(timers[pid]);
      timers[pid] = setTimeout(() => {
        setHdInput((prev) => {
          const key = String(pid);
          const current = prev[key] ?? "";
          // 이미 음수면 그대로
          if (String(current).startsWith("-")) return prev;
          const next =
            current === "" ? "-" : `-${String(current).replace(/^-/, "")}`;
          return { ...prev, [key]: next };
        });
      }, 600);
      hdLongPressTimers.current = timers;
    } catch (e) {}
  };

  const cancelLongMinus = (pid) => {
    try {
      const timers = hdLongPressTimers.current || {};
      if (timers[pid]) clearTimeout(timers[pid]);
      timers[pid] = null;
      hdLongPressTimers.current = timers;
    } catch (e) {}
  };

  const upsertParticipantFields = async (pid, baseObj, patch) => {
    if (!eventId) return;
    const ref = doc(db, "events", eventId, "participants", String(pid));
    try {
      await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
    } catch (e) {
      const msg = String(e?.message || "");
      const notFound = e?.code === "not-found" || msg.includes("No document to update");
      if (notFound) {
        await setDoc(
          ref,
          {
            id: baseObj?.id ?? pid,
            group: baseObj?.group ?? 1,
            nickname: baseObj?.nickname ?? "",
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
        console.warn("[Step4] upsertParticipantFields error:", e);
        throw e;
      }
    }
  };

  // 현재 participants 상태를 기반으로 events/{eventId}.participants 동기화
  const syncEventDocParticipants = async (list) => {
    if (!eventId || typeof updateEventImmediate !== "function") return;
    try {
      const compat = (list || []).map((p) => ({
        ...p,
        roomNumber: p.room ?? null,
        teammateId: p.partner ?? null,
        teammate: p.partner ?? null,
      }));
      await updateEventImmediate({
        participants: compat,
        participantsUpdatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("[Step4] syncEventDocParticipants error:", e);
    }
  };

  const toggleSelect = (i) => {
    const c = [...participants];
    c[i].selected = !c[i].selected;
    setParticipants(c);
  };

  const addParticipant = async () => {
    if (!eventId) return alert("이벤트가 설정되지 않았습니다.");
    const newId = participants.length;
    const newObj = {
      id: newId,
      group: 1,
      nickname: "",
      handicap: null,
      score: null,
      room: null,
      partner: null,
      selected: false,
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, "events", eventId, "participants", String(newId)), newObj, {
      merge: true,
    });
    setParticipants((p) => [...p, newObj]);
    setHdInput((prev) => ({ ...prev, [String(newId)]: "" }));
  };

  const delSelected = async () => {
    if (!eventId) return alert("이벤트가 설정되지 않았습니다.");
    const ids = participants.filter((x) => x.selected).map((x) => x.id);
    const batch = writeBatch(db);
    ids.forEach((id) =>
      batch.delete(doc(collection(db, "events", eventId, "participants"), String(id)))
    );
    await batch.commit();
    const after = (p) => p.filter((x) => !x.selected);
    setParticipants((p) => after(p));
    setHdInput((prev) => {
      const n = { ...prev };
      ids.forEach((id) => delete n[String(id)]);
      return n;
    });
  };

  const changeGroup = async (i, v) => {
    const c = [...participants];
    c[i] = { ...c[i], group: v };
    setParticipants(c);
    await upsertParticipantFields(c[i].id, c[i], { group: v });
    // 그룹 변경도 이벤트 문서에 반영
    await syncEventDocParticipants(c);
  };

  const changeNickname = async (i, v) => {
    const c = [...participants];
    c[i] = { ...c[i], nickname: v };
    setParticipants(c);
    await upsertParticipantFields(c[i].id, c[i], { nickname: v });
    // 닉네임 변경도 이벤트 문서에 반영
    await syncEventDocParticipants(c);
  };

  const changeHandicapDraft = (pid, raw) => {
    if (!isPartialNumber(raw)) return;
    setHdInput((prev) => ({ ...prev, [String(pid)]: raw }));
  };

  const commitHandicap = async (i) => {
    const pid = participants[i].id;
    const raw = (hdInput[String(pid)] ?? "").trim();
    let v = null;
    if (raw !== "" && raw !== "-") {
      const num = Number(raw);
      v = Number.isFinite(num) ? num : null;
    }
    const c = [...participants];
    c[i] = { ...c[i], handicap: v };
    setParticipants(c);
    await upsertParticipantFields(pid, c[i], { handicap: v });
    setHdInput((prev) => ({ ...prev, [String(pid)]: v === null ? "" : String(v) }));
    // G핸디 수정 내용도 이벤트 문서에 즉시 반영 → STEP5/STEP7에서 동일하게 보이도록
    await syncEventDocParticipants(c);
  };

  const onHdKeyDown = (e) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  // ✅ STEP4 전체 행의 G핸디 임시 입력값(hdInput)을 한 번에 커밋
  const commitAllHandicaps = async () => {
    try {
      const current = [...participants];
      const nextHdInput = { ...hdInput };
      const updates = [];

      for (let i = 0; i < current.length; i++) {
        const pid = current[i].id;
        const raw = (nextHdInput[String(pid)] ?? "").trim();
        let v = null;

        if (raw !== "" && raw !== "-") {
          const num = Number(raw);
          v = Number.isFinite(num) ? num : null;
        }

        // 값이 실제로 변경되지 않았다면 건너뜀
        if (v === current[i].handicap) {
          nextHdInput[String(pid)] = v === null ? "" : String(v);
          continue;
        }

        const updated = { ...current[i], handicap: v };
        current[i] = updated;
        updates.push({ pid, updated, value: v });
        nextHdInput[String(pid)] = v === null ? "" : String(v);
      }

      if (updates.length === 0) {
        // 그래도 입력값은 정규화해 둠
        setHdInput(nextHdInput);
        return;
      }

      setParticipants(current);

      // Firestore 참가자 문서들 일괄 반영
      await Promise.all(
        updates.map(({ pid, updated, value }) =>
          upsertParticipantFields(pid, updated, { handicap: value })
        )
      );

      setHdInput(nextHdInput);
      // 이벤트 문서에도 최신 participants 전체를 반영
      await syncEventDocParticipants(current);
    } catch (e) {
      console.warn("[Step4] commitAllHandicaps error:", e);
    }
  };

  // ✅ STEP4에서 다른 STEP으로 이동하기 전에 G핸디 임시 입력값을 모두 저장
  const handlePrevWithCommit = async () => {
    await commitAllHandicaps();
    goPrev();
  };

  const handleNextWithCommit = async () => {
    await commitAllHandicaps();
    goNext();
  };

  // 관리자만 preMembers 저장 기본 ON
  const [savePII, setSavePII] = useState(
    () => getAuth().currentUser?.email === "a@a.com"
  );

  // 참가자 지문(필요 시)
  const seedOfParticipants = (list = []) => {
    try {
      const base = (list || []).map((p) => [
        String(p?.id ?? ""),
        String(p?.nickname ?? ""),
        Number(p?.group ?? 0),
      ]);
      base.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      return JSON.stringify(base);
    } catch {
      return "";
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 엑셀 업로드(파일명 영구 저장 + applyNewRoster 원샷 반영)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleFileExtended = async (e) => {
    try {
      const f = e?.target?.files?.[0];
      if (!f) return;
      const name = f?.name || "";
      setSelectedFileName(name);

      // 1) 로컬/세션 저장(이벤트/모드별 키)
      try {
        const KEY = getFileKey();
        __STEP4_FILE_CACHE = name;
        localStorage.setItem(KEY, name);
        sessionStorage.setItem(KEY, name);
        // 구버전 호환
        localStorage.setItem(LEGACY_LAST_SELECTED_FILENAME_KEY, name);
        sessionStorage.setItem(LEGACY_LAST_SELECTED_FILENAME_KEY, name);
      } catch {}

      // 2) 이벤트 문서에도 파일명 저장
      if (typeof rememberUploadFilename === "function") {
        try {
          await rememberUploadFilename(mode, name);
        } catch {}
      }

      

      // ★ patch: 업로드 roster를 Step4에서 직접 파싱하여 즉시 반영
      //   - STEP4에서 G핸디를 수정해도, 같은 파일을 다시 업로드하면 "업로드 파일 기준"으로 복귀
      //   - handleFile 이후 participantsRef.current가 이전 값일 수 있어, applyNewRoster에 잘못 전달되는 문제 방지
      let rosterFromFile = null;
      try {
        const abRoster = await f.arrayBuffer();
        const wbRoster = XLSX.read(abRoster, { type: "array" });
        const sheetRoster = wbRoster.Sheets[wbRoster.SheetNames[0]];
        const rowsRoster = XLSX.utils
          .sheet_to_json(sheetRoster, { header: 1 })
          .slice(1);

        rosterFromFile = rowsRoster.map((row, idx) => ({
          id: idx,
          group: Number(row?.[0]) || 1,
          nickname: String(row?.[1] || "").trim(),
          handicap: Number(row?.[2]) || 0,
          authCode: String(row?.[3] || "").trim(),
          score: null,
          room: null,
          partner: null,
          selected: false,
        }));

        // 즉시 반영(화면/다른 STEP 동기화)
        participantsRef.current = rosterFromFile;
        setParticipants(rosterFromFile);
        setHdInput(() => {
          const next = {};
          rosterFromFile.forEach((p) => {
            next[String(p.id)] =
              p.handicap === null || p.handicap === undefined
                ? ""
                : String(p.handicap);
          });
          return next;
        });
      } catch (e) {
        rosterFromFile = null;
      }

      // 3) 기존 파서(상태 반영은 기존 handleFile에 위임)
      if (typeof handleFile === "function") {
        // React SyntheticEvent 풀링 문제를 피하기 위해 순수 객체로 다시 감싸서 전달
        await handleFile({ target: { files: [f] } });
      }

      // 4) 점수 초기화 + participants + 파일명까지 서버에 원샷 반영
      // ★ patch: handleFile(setState) 직후 participantsRef가 이전 값일 수 있는 레이스 컨디션 방지
      //          → 업로드 파일을 Step4에서 직접 파싱한 roster를 우선 사용
      if (typeof applyNewRoster === "function") {
        await applyNewRoster({
          participants: rosterFromFile || participantsRef.current || [],
          mode,
          uploadFileName: name,
          clearScores: true,
        });
      } else {
        // applyNewRoster가 없더라도 최소한 이벤트 문서 participants는 즉시 갱신
        await syncEventDocParticipants(rosterFromFile || participantsRef.current || []);
      }

      // ★ patch: 같은 파일 재선택 가능하도록 file input value 초기화
      try {
        if (e?.target) e.target.value = "";
      } catch {}

      // 5) (선택) preMembers 저장 — 관리자만
      const user = getAuth().currentUser;
      const isAdmin = !!user && user.email === "a@a.com";
      if (!savePII || !eventId || !isAdmin || !f) return;

      const ab = await f.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      const CHUNK = 450; // 배치 커밋 안정화
      let buf = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const email = String(r[4] || "").trim().toLowerCase();
        const nameCell = String(r[5] || "").trim();
        const nickname = String(r[1] || "").trim();
        const group = Number(r[0]) || null;
        if (!email) continue;
        buf.push({
          email,
          nameCell,
          nickname,
          group: Number.isFinite(group) ? group : null,
        });
        if (buf.length === CHUNK) {
          const batch = writeBatch(db);
          buf.forEach(({ email, nameCell, nickname, group }) => {
            batch.set(
              doc(db, "events", eventId, "preMembers", email),
              {
                name: nameCell || null,
                nickname: nickname || null,
                group,
                uploadedAt: serverTimestamp(),
                importedFrom: "excel",
              },
              { merge: true }
            );
          });
          await batch.commit();
          buf = [];
        }
      }
      if (buf.length) {
        const batch = writeBatch(db);
        buf.forEach(({ email, nameCell, nickname, group }) => {
          batch.set(
            doc(db, "events", eventId, "preMembers", email),
            {
              name: nameCell || null,
              nickname: nickname || null,
              group,
              uploadedAt: serverTimestamp(),
              importedFrom: "excel",
            },
            { merge: true }
          );
        });
        await batch.commit();
      }

      // ★ patch: 같은 파일을 연속 선택해도 onChange가 다시 발생하도록 input 값을 비움
      try {
        if (e?.target) e.target.value = "";
      } catch {}

    } catch (err) {
      console.warn("[Step4] handleFileExtended error", err);
      alert(`엑셀 업로드 중 preMembers 반영에 실패했습니다.\n(${err?.code || "error"})`);
    }
  };

  // 길게 누르면 전체 선택/해제(원본 유지)
  const longPressTimer = useRef(null);
  const startLongSelectAll = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      setParticipants((prev) => {
        const all = prev.every((p) => !!p.selected);
        return prev.map((p) => ({ ...p, selected: !all }));
      });
    }, 600);
  };
  const cancelLong = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const ToggleBtn = ({ checked, onChange }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={styles.pmToggleBtn}
      title="preMembers 저장 여부"
    >
      <span aria-hidden>{checked ? "☑" : "☐"}</span>
      <span>preMembers</span>
    </button>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className={`${styles.step} ${styles.step4}`} style={pageStyle}>
      <div
        className={`${styles.excelHeader} ${
          uploadMethod === "manual" ? styles.manual : ""
        }`}
        style={{ marginBottom: 12 }}
      >
        {uploadMethod === "auto" && (
          <div
            className={styles.headerGrid}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "start",
              columnGap: 12,
            }}
          >
            <div
              className={styles.leftCol}
              style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}
            >
              {/* 파일 입력: input 라벨은 업로드 후 value 초기화로 "선택된 파일 없음"이 되므로 숨기고, 저장된 파일명을 배지로 표시 */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileExtended}
                style={{ display: "none" }}
              />
              <button
                type="button"
                className={styles.filePickBtn}
                onClick={() => {
                  try {
                    fileInputRef.current && fileInputRef.current.click();
                  } catch (e) {}
                }}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.18)",
                  background: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  lineHeight: "14px",
                  whiteSpace: "nowrap",
                }}
                title="엑셀 파일 선택"
              >
                파일 선택
              </button>
              <span
                className={styles.filenameBadge}
                title={selectedFileName || "선택한 파일 없음"}
              >
                {selectedFileName || "선택한 파일 없음"}
              </span>
            </div>

            <div className={styles.rightCol}>
              <div className={styles.rightBox}>
                <span className={styles.totalInline}>총 슬롯: {roomCount * 4}명</span>
                <ToggleBtn checked={savePII} onChange={setSavePII} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 표 헤더 */}
      <div className={styles.participantRowHeader}>
        <div className={`${styles.cell} ${styles.group}`}>조</div>
        <div className={`${styles.cell} ${styles.nickname}`}>닉네임</div>
        <div className={`${styles.cell} ${styles.handicap}`}>G핸디</div>
        <div className={`${styles.cell} ${styles.delete}`}>
          <span
            onMouseDown={startLongSelectAll}
            onMouseUp={cancelLong}
            onMouseLeave={cancelLong}
            onTouchStart={startLongSelectAll}
            onTouchEnd={cancelLong}
            style={{ userSelect: "none", cursor: "pointer" }}
            title="길게 누르면 전체 선택/해제"
          >
            선택
          </span>
        </div>
      </div>

      {/* 표 본문 */}
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
                  <option key={n} value={n}>
                    {n}조
                  </option>
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
              <input
                type="text"
                inputMode="decimal"
                placeholder="G핸디"
                value={hdInput[String(p.id)] ?? (p.handicap ?? "")}
                onChange={(e) => changeHandicapDraft(p.id, e.target.value)}
                onBlur={() => commitHandicap(i)}
                onKeyDown={onHdKeyDown}
                onPointerDown={() => startLongMinus(p.id)}
                onPointerUp={() => cancelLongMinus(p.id)}
                onPointerLeave={() => cancelLongMinus(p.id)}
                onTouchEnd={() => cancelLongMinus(p.id)}
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

      {/* 하단 고정 버튼(원본 유지) */}
      <div
        className={styles.stepFooter}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: __safeBottom,
          zIndex: 5,
          boxSizing: "border-box",
          padding: "12px 16px",
        }}
      >
        <button onClick={handlePrevWithCommit}>← 이전</button>
        <button onClick={addParticipant}>추가</button>
        <button onClick={delSelected}>삭제</button>
        <button onClick={handleNextWithCommit}>다음 →</button>
      </div>
    </div>
  );
}
