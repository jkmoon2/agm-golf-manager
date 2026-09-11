// src/screens/Step4.jsx
// (원본 최대 유지 + 파일명 배지/영구 저장 + applyNewRoster 연동 + eventData 타이밍 보강)
// + G핸디 수정 시 이벤트 문서까지 동기화
// + G핸디 입력칸 길게 누르면 '-' 자동 입력(부분 숫자 허용)

import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import styles from "./Step4.module.css";
import { StepContext } from "../flows/StepFlow";
import { EventContext } from "../contexts/EventContext";
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  getDoc,
  writeBatch,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import * as XLSX from "xlsx";
import { getAuth } from "firebase/auth";
import { isRulesAdminUser } from "../utils/adminAuth";
import SkillRoomEditor from "../components/SkillRoomEditor";
import ParticipantRosterEditor from "../components/ParticipantRosterEditor";
import { getSkillRoomParticipantIdSet, normalizeSkillRoomConfig } from "../utils/skillRoom";


// 엑셀/STEP4 조 값 정규화
// - 빈칸/문자는 기존과 동일하게 1조
// - 숫자 0은 특별방 표시용 0조로 그대로 유지
function parseRosterGroup(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") return 1;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 1;
}

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
    roomNames,
    roomCapacities,
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
    persistRoomsFromParticipants, // 수동 삭제 시 rooms/roomTable 미러 정합성 유지
    // Step4에서 G핸디 변경 시 events/{eventId}.participants도 함께 갱신
    updateEventImmediate,
  } = useContext(EventContext);

  // ─────────────────────────────────────────────────────────────────────────────
  // 특별방(비슷한 G핸디 참가자 반강제 배정) 설정
  // - 내부 저장 키는 기존 버전 호환을 위해 events/{eventId}.skillRoomConfig 유지
  // - 참가자 원본/기존 배정 로직은 건드리지 않고 자동/수동/Player 배정에서만 제약을 적용
  // ─────────────────────────────────────────────────────────────────────────────
  const [skillRoomEditorOpen, setSkillRoomEditorOpen] = useState(false);
  const [participantEditorOpen, setParticipantEditorOpen] = useState(false);
  const skillRoomConfig = useMemo(
    () => normalizeSkillRoomConfig(eventData?.skillRoomConfig, { roomCount, participants }),
    [eventData?.skillRoomConfig, roomCount, participants]
  );
  const saveSkillRoomConfig = async (nextConfig) => {
    if (!eventId || typeof updateEventImmediate !== 'function') return;
    const normalized = normalizeSkillRoomConfig(nextConfig, { roomCount, participants });
    await updateEventImmediate({ skillRoomConfig: normalized }, false);
  };

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
            authCode: baseObj?.authCode ?? "",
            email: String(baseObj?.email ?? "").trim().toLowerCase(),
            name: baseObj?.name ?? "",
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

  // 수동 신규/교체/삭제는 저장 실패를 호출부에서 감지해야 하므로 예외를 삼키지 않는 전용 동기화 사용
  const syncManualRosterRoot = async (list) => {
    if (!eventId || typeof updateEventImmediate !== "function") {
      throw new Error("event update function is not ready");
    }
    const compat = (list || []).map((p) => ({
      ...p,
      roomNumber: p.room ?? p.roomNumber ?? null,
      teammateId: p.partner ?? p.teammateId ?? p.teammate ?? null,
      teammate: p.partner ?? p.teammateId ?? p.teammate ?? null,
    }));
    await updateEventImmediate({
      participants: compat,
      participantsUpdatedAt: serverTimestamp(),
    }, false);
  };

  const toggleSelect = (i) => {
    const c = [...participants];
    c[i].selected = !c[i].selected;
    setParticipants(c);
  };

  const addParticipant = () => {
    setParticipantEditorOpen(true);
  };

  const delSelected = async () => {
    if (!eventId) return alert("이벤트가 설정되지 않았습니다.");
    const ids = participants.filter((x) => x.selected).map((x) => x.id);
    if (!ids.length) return;

    const idSet = new Set(ids.map((id) => String(id)));
    const removed = participants.filter((p) => idSet.has(String(p?.id)));
    const next = participants
      .filter((p) => !idSet.has(String(p?.id)))
      .map((p) => {
        const partnerId = p?.partner ?? p?.teammateId ?? p?.teammate ?? null;
        if (partnerId == null || !idSet.has(String(partnerId))) {
          return { ...p, selected: false };
        }
        // 삭제 대상과 연결된 포볼 파트너 참조가 남지 않도록 해당 연결만 해제
        return {
          ...p,
          partner: null,
          teammateId: null,
          teammate: null,
          selected: false,
        };
      });

    const batch = writeBatch(db);
    ids.forEach((id) => {
      batch.delete(doc(collection(db, "events", eventId, "participants"), String(id)));
      batch.delete(doc(db, 'events', eventId, 'scores', String(id)));
    });

    // 삭제된 참가자를 바라보던 상대 참가자 subdoc도 같은 배치에서 파트너만 해제
    next.forEach((p) => {
      const before = participants.find((x) => String(x?.id) === String(p?.id));
      const beforePartner = before?.partner ?? before?.teammateId ?? before?.teammate ?? null;
      if (beforePartner != null && idSet.has(String(beforePartner))) {
        batch.set(
          doc(db, 'events', eventId, 'participants', String(p.id)),
          { partner: null, teammateId: null, teammate: null, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }
    });

    // 삭제 참가자의 이벤트 범위 이메일 매칭(preMembers)도 함께 제거
    if (isRulesAdminUser(getAuth().currentUser)) {
      removed
        .map((p) => normalizeManualEmail(p?.email))
        .filter(Boolean)
        .forEach((email) => batch.delete(doc(db, 'events', eventId, 'preMembers', email)));
    }

    try {
      // 먼저 루트 명단을 반영하고, 보조문서 배치가 실패하면 원본 명단으로 롤백
      await syncManualRosterRoot(next);
      try {
        await batch.commit();
      } catch (batchError) {
        try { await syncManualRosterRoot(participants); } catch {}
        throw batchError;
      }

      participantsRef.current = next;
      setParticipants(next);
      setHdInput((prev) => {
        const n = { ...prev };
        ids.forEach((id) => delete n[String(id)]);
        return n;
      });

      // 방배정이 진행 중인 상태에서 삭제한 경우 rooms/roomTable 미러도 즉시 맞춤
      if (typeof persistRoomsFromParticipants === 'function') {
        try { await persistRoomsFromParticipants(next); }
        catch (e) { console.warn('[Step4] delete rooms mirror sync failed:', e); }
      }

      // 특별방 설정에 삭제된 참가자 id가 남아 있지 않도록 설정만 정리
      if (eventData?.skillRoomConfig && typeof updateEventImmediate === 'function') {
        const nextSkillRoomConfig = normalizeSkillRoomConfig(eventData.skillRoomConfig, {
          roomCount,
          participants: next,
        });
        await updateEventImmediate({ skillRoomConfig: nextSkillRoomConfig }, false);
      }
    } catch (e) {
      console.warn('[Step4] delete selected participants failed:', e);
      alert('참가자 삭제 저장에 실패했습니다. 다시 시도해주세요.');
    }
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

  // 특별방 표시용 0조 참가자가 일반 방배정으로 섞이지 않도록 STEP4 이탈 전 확인
  // - 0조는 선택 사항이지만, 사용했다면 반드시 특별방 설정에 포함되어야 합니다.
  const validateSpecialGroupParticipants = () => {
    const zeroGroup = (participants || []).filter((p) =>
      p && p.id != null && String(p.nickname || '').trim() && Number(p.group) === 0
    );
    if (!zeroGroup.length) return true;

    const selectedIds = getSkillRoomParticipantIdSet(skillRoomConfig, { roomCount, participants });
    const missing = zeroGroup.filter((p) => !selectedIds.has(String(p.id)));
    if (!skillRoomConfig?.enabled || missing.length) {
      const names = (missing.length ? missing : zeroGroup).map((p) => p.nickname).slice(0, 8).join(', ');
      alert(
        `0조는 특별방 표시용입니다.\n특별방 설정에서 0조 참가자를 모두 대상 방에 선택해주세요.\n\n확인 대상: ${names}${(missing.length ? missing : zeroGroup).length > 8 ? ' 외' : ''}`
      );
      return false;
    }
    return true;
  };

  // ✅ STEP4에서 다른 STEP으로 이동하기 전에 G핸디 임시 입력값을 모두 저장
  const handlePrevWithCommit = async () => {
    await commitAllHandicaps();
    goPrev();
  };

  const handleNextWithCommit = async () => {
    await commitAllHandicaps();
    if (!validateSpecialGroupParticipants()) return;
    goNext();
  };

  // 관리자만 preMembers 저장 기본 ON
  const [savePII, setSavePII] = useState(
    () => isRulesAdminUser(getAuth().currentUser)
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 수동 참가자 신규 추가 / 교체(정보수정)
  // - 엑셀 재업로드를 하지 않고 해당 참가자만 반영하여 진행 중 방배정을 보존
  // - 신규 추가: 빈 수동 슬롯/삭제된 id가 있으면 우선 재사용, 없으면 새 id 추가
  // - 교체: 기존 id/room/partner를 유지하여 포볼·특별방 연결을 최대한 보존
  // ─────────────────────────────────────────────────────────────────────────────
  const normalizeManualEmail = (v) => String(v || '').trim().toLowerCase();
  const normalizeManualCode = (v) => String(v || '').trim();
  const participantIdKey = (v) => String(v ?? '').trim();

  const totalRoomCapacity = useMemo(() => {
    if (Array.isArray(roomCapacities) && roomCapacities.length) {
      return roomCapacities.reduce((sum, raw) => {
        const n = Number(raw);
        const cap = Number.isFinite(n) ? Math.min(4, Math.max(1, n)) : 4;
        return sum + cap;
      }, 0);
    }
    return Number(roomCount || 0) * 4;
  }, [roomCapacities, roomCount]);

  const selectedParticipantIds = useMemo(
    () => (participants || []).filter((p) => !!p?.selected).map((p) => p.id),
    [participants]
  );

  const getFirstReusableBlankIndex = (list = []) => {
    return (Array.isArray(list) ? list : []).findIndex((p) => {
      if (!p || p.id == null) return false;
      const hasName = String(p?.nickname || '').trim() || String(p?.name || '').trim();
      const hasIdentity = String(p?.authCode || '').trim() || String(p?.email || '').trim();
      const hasRoom = p?.room != null || p?.roomNumber != null;
      const hasPartner = p?.partner != null || p?.teammateId != null || p?.teammate != null;
      return !hasName && !hasIdentity && !hasRoom && !hasPartner;
    });
  };

  const getNextParticipantId = (list = []) => {
    const used = new Set(
      (Array.isArray(list) ? list : [])
        .map((p) => Number(p?.id))
        .filter((n) => Number.isInteger(n) && n >= 0)
    );
    let n = 0;
    while (used.has(n)) n += 1;
    return n;
  };

  const normalizeManualParticipantForm = (form = {}) => {
    const group = Number(form?.group);
    if (!Number.isInteger(group) || group < 0 || group > 4) {
      alert('조는 0~4 중에서 선택해주세요.');
      return null;
    }

    const nickname = String(form?.nickname || '').trim();
    if (!nickname) {
      alert('닉네임을 입력해주세요.');
      return null;
    }

    const hdRaw = String(form?.handicap ?? '').trim();
    const handicap = hdRaw === '' ? 0 : Number(hdRaw);
    if (!Number.isFinite(handicap)) {
      alert('G핸디를 숫자로 입력해주세요.');
      return null;
    }

    const authCode = normalizeManualCode(form?.authCode);
    const email = normalizeManualEmail(form?.email);
    const name = String(form?.name || '').trim();

    if (email && (!email.includes('@') || email.startsWith('@') || email.endsWith('@'))) {
      alert('이메일 형식을 확인해주세요.');
      return null;
    }

    return { group, nickname, handicap, authCode, email, name };
  };

  const validateManualIdentityUnique = (values, excludeId = null) => {
    const codeKey = String(values?.authCode || '').trim().toUpperCase();
    const emailKey = normalizeManualEmail(values?.email);
    const excludeKey = participantIdKey(excludeId);

    if (codeKey) {
      const dup = (participants || []).find((p) =>
        participantIdKey(p?.id) !== excludeKey &&
        String(p?.authCode || '').trim().toUpperCase() === codeKey
      );
      if (dup) {
        alert(`이미 사용 중인 인증코드입니다.\n참가자: ${dup.nickname || dup.name || dup.id}`);
        return false;
      }
    }

    if (emailKey) {
      const dup = (participants || []).find((p) =>
        participantIdKey(p?.id) !== excludeKey &&
        normalizeManualEmail(p?.email) === emailKey
      );
      if (dup) {
        alert(`이미 사용 중인 이메일입니다.\n참가자: ${dup.nickname || dup.name || dup.id}`);
        return false;
      }
    }

    return true;
  };

  const saveParticipantSubDoc = async (participant) => {
    if (!eventId || !participant || participant.id == null) return;
    const room = participant?.room ?? participant?.roomNumber ?? null;
    const partner = participant?.partner ?? participant?.teammateId ?? participant?.teammate ?? null;
    const payload = {
      ...participant,
      room,
      roomNumber: room,
      partner,
      teammateId: partner,
      teammate: partner,
      authCode: normalizeManualCode(participant?.authCode),
      email: normalizeManualEmail(participant?.email),
      name: String(participant?.name || '').trim(),
      updatedAt: serverTimestamp(),
    };
    // 점수는 /scores SSOT이므로 참가자 보조문서에도 score/scoreRaw는 저장하지 않음
    try { delete payload.score; } catch {}
    try { delete payload.scoreRaw; } catch {}
    await setDoc(
      doc(db, 'events', eventId, 'participants', String(participant.id)),
      payload,
      { merge: true }
    );
  };

  const saveManualPreMember = async (participant) => {
    const email = normalizeManualEmail(participant?.email);
    if (!savePII || !email || !eventId) return;
    const user = getAuth().currentUser;
    if (!isRulesAdminUser(user)) return;
    await setDoc(
      doc(db, 'events', eventId, 'preMembers', email),
      {
        email,
        name: String(participant?.name || '').trim() || null,
        nickname: String(participant?.nickname || '').trim() || null,
        group: Number.isFinite(Number(participant?.group)) ? Number(participant.group) : null,
        uploadedAt: serverTimestamp(),
        importedFrom: 'manual',
      },
      { merge: true }
    );
  };

  const removeOldManualPreMember = async (oldEmailRaw, newEmailRaw) => {
    const oldEmail = normalizeManualEmail(oldEmailRaw);
    const newEmail = normalizeManualEmail(newEmailRaw);
    if (!eventId || !oldEmail || oldEmail === newEmail) return;
    const user = getAuth().currentUser;
    if (!isRulesAdminUser(user)) return;
    try {
      await deleteDoc(doc(db, 'events', eventId, 'preMembers', oldEmail));
    } catch (e) {
      console.warn('[Step4] old preMember cleanup failed:', e);
    }
  };

  const hasMeaningfulEventInputs = () => {
    const inputs = eventData?.eventInputs;
    return !!(inputs && typeof inputs === 'object' && Object.keys(inputs).length > 0);
  };

  const handleParticipantEditorSubmit = async ({ mode: editMode, replaceAction = 'edit', targetId, form }) => {
    if (!eventId) {
      alert('이벤트가 설정되지 않았습니다.');
      return false;
    }

    const rootSnap = await getDoc(doc(db, 'events', eventId));
    if (!rootSnap.exists()) {
      alert('삭제되었거나 존재하지 않는 대회입니다.');
      return false;
    }

    const values = normalizeManualParticipantForm(form);
    if (!values) return false;

    const isReplace = editMode === 'replace';
    const excludeId = isReplace ? targetId : null;
    if (!validateManualIdentityUnique(values, excludeId)) return false;

    if (!values.authCode && !values.email) {
      const ok = window.confirm(
        '인증코드와 이메일이 모두 없습니다.\n이 참가자는 Player에서 직접 대회에 접속하기 어렵습니다.\n\n그래도 저장하시겠습니까?'
      );
      if (!ok) return false;
    }

    if (!isReplace) {
      if (['fourball', 'agm'].includes(String(mode || '').toLowerCase()) && values.group !== 0) {
        const ok = window.confirm(
          'AGM 포볼에서 일반 참가자를 신규 추가하면 1조/2조 인원과 파트너 구성을 확인해야 합니다.\n이미 방배정이 진행 중이고 기존 참가자 1명이 빠진 경우에는 "참가자 교체/정보수정"을 사용하는 것이 더 안전합니다.\n\n신규 추가를 계속하시겠습니까?'
        );
        if (!ok) return false;
      }

      const current = Array.isArray(participantsRef.current) ? participantsRef.current : participants;
      const blankIdx = getFirstReusableBlankIndex(current);
      if (blankIdx < 0 && current.length >= totalRoomCapacity) {
        alert(
          `현재 참가자 수가 전체 방 정원(${totalRoomCapacity}명)에 도달했습니다.\n기존 참가자 1명이 빠진 상황이면 "참가자 교체/정보수정"을 사용해주세요.`
        );
        return false;
      }

      const newId = blankIdx >= 0 ? current[blankIdx].id : getNextParticipantId(current);
      const newParticipant = {
        ...(blankIdx >= 0 ? current[blankIdx] : {}),
        id: newId,
        group: values.group,
        nickname: values.nickname,
        handicap: values.handicap,
        authCode: values.authCode,
        email: values.email,
        name: values.name,
        score: null,
        room: null,
        roomNumber: null,
        partner: null,
        teammateId: null,
        teammate: null,
        selected: false,
      };
      try { delete newParticipant.scoreRaw; } catch {}
      try { delete newParticipant.dirty; } catch {}
      try { delete newParticipant.updatedAt; } catch {}

      const next = blankIdx >= 0
        ? current.map((p, i) => (i === blankIdx ? newParticipant : p))
        : [...current, newParticipant];

      try {
        // 가장 먼저 이벤트 루트/현재 모드 명단을 저장 → 기존 참가자 방배정/점수 상태는 그대로 유지
        await syncManualRosterRoot(next);

        participantsRef.current = next;
        setParticipants(next);
        setHdInput((prev) => ({ ...prev, [String(newId)]: String(values.handicap) }));

        // 보조 저장은 루트 저장 이후 수행. 일부 실패해도 Player는 루트 participants로 로그인 가능
        const secondaryErrors = [];
        try { await deleteDoc(doc(db, 'events', eventId, 'scores', String(newId))); }
        catch (e) { secondaryErrors.push('기존 점수 초기화'); console.warn('[Step4] add score cleanup failed:', e); }
        try { await saveParticipantSubDoc(newParticipant); }
        catch (e) { secondaryErrors.push('참가자 보조문서'); console.warn('[Step4] add participant subdoc failed:', e); }
        try { await saveManualPreMember(newParticipant); }
        catch (e) { secondaryErrors.push('preMembers'); console.warn('[Step4] add preMember failed:', e); }

        if (secondaryErrors.length) {
          alert(`참가자 명단에는 정상 추가되었습니다.\n다만 보조 저장 일부를 확인해주세요: ${secondaryErrors.join(', ')}`);
        } else if (hasMeaningfulEventInputs()) {
          alert(
            `${values.nickname} 참가자를 추가했습니다.\n\n현재 이벤트 입력값이 이미 존재합니다. 새 참가자는 기존 입력값이 없으므로 진행 중인 이벤트의 참여 대상/입력 상태를 확인해주세요.`
          );
        }
        return true;
      } catch (e) {
        console.warn('[Step4] manual participant add failed:', e);
        alert('참가자 추가 저장에 실패했습니다. 기존 참가자 명단은 변경하지 않았습니다. 다시 시도해주세요.');
        return false;
      }
    }

    const current = Array.isArray(participantsRef.current) ? participantsRef.current : participants;
    const targetIndex = current.findIndex((p) => participantIdKey(p?.id) === participantIdKey(targetId));
    if (targetIndex < 0) {
      alert('교체할 참가자를 찾지 못했습니다.');
      return false;
    }

    const oldParticipant = current[targetIndex];
    const hasAssignment = (
      oldParticipant?.room != null || oldParticipant?.roomNumber != null ||
      oldParticipant?.partner != null || oldParticipant?.teammateId != null || oldParticipant?.teammate != null
    );
    if (hasAssignment && Number(oldParticipant?.group) !== Number(values.group)) {
      const ok = window.confirm(
        '현재 참가자는 이미 방 또는 포볼 파트너가 배정되어 있습니다.\n조를 변경해도 기존 방/파트너 배정은 유지됩니다.\n\n조 변경까지 그대로 진행하시겠습니까?'
      );
      if (!ok) return false;
    }

    if (replaceAction === 'replace' && hasMeaningfulEventInputs()) {
      const ok = window.confirm(
        '현재 이벤트 입력값이 이미 존재합니다.\n참가자 교체는 기존 ID를 유지하므로 일부 이벤트가 ID 기준으로 저장한 과거 입력값을 새 참가자가 이어받을 수 있습니다.\n\n교체 후 진행 중인 이벤트 입력/결과를 반드시 확인해주세요. 계속하시겠습니까?'
      );
      if (!ok) return false;
    }

    const replaced = {
      ...oldParticipant,
      id: oldParticipant.id,
      group: values.group,
      nickname: values.nickname,
      handicap: values.handicap,
      authCode: values.authCode,
      email: values.email,
      name: values.name,
      // 정보수정은 점수를 유지하고, 실제 교체일 때만 이전 참가자의 점수를 초기화
      score: replaceAction === 'replace' ? null : oldParticipant?.score ?? null,
      selected: false,
    };
    try { delete replaced.scoreRaw; } catch {}
    try { delete replaced.dirty; } catch {}
    try { delete replaced.updatedAt; } catch {}

    const next = current.map((p, i) => (i === targetIndex ? replaced : p));

    try {
      // 기존 id/방/파트너를 유지한 명단을 먼저 저장하여 진행 중 배정을 보호
      await syncManualRosterRoot(next);

      participantsRef.current = next;
      setParticipants(next);
      setHdInput((prev) => ({ ...prev, [String(oldParticipant.id)]: String(values.handicap) }));

      const secondaryErrors = [];
      // 실제 "새 참가자로 교체"일 때만 이전 참가자의 점수 SSOT를 해당 1명만 초기화
      if (replaceAction === 'replace') {
        try { await deleteDoc(doc(db, 'events', eventId, 'scores', String(oldParticipant.id))); }
        catch (e) { secondaryErrors.push('기존 점수 초기화'); console.warn('[Step4] replace score cleanup failed:', e); }
      }
      try { await saveParticipantSubDoc(replaced); }
      catch (e) { secondaryErrors.push('참가자 보조문서'); console.warn('[Step4] replace participant subdoc failed:', e); }
      try { await removeOldManualPreMember(oldParticipant?.email, values.email); }
      catch (e) { secondaryErrors.push('기존 preMembers 정리'); console.warn('[Step4] replace old preMember cleanup failed:', e); }
      try { await saveManualPreMember(replaced); }
      catch (e) { secondaryErrors.push('preMembers'); console.warn('[Step4] replace preMember failed:', e); }

      if (secondaryErrors.length) {
        alert(`${replaceAction === 'replace' ? '참가자 교체' : '참가자 정보수정'} 명단은 정상 저장되었습니다.\n다만 보조 저장 일부를 확인해주세요: ${secondaryErrors.join(', ')}`);
      }
      return true;
    } catch (e) {
      console.warn('[Step4] participant replace failed:', e);
      alert('참가자 교체/정보수정 저장에 실패했습니다. 기존 참가자 명단은 변경하지 않았습니다. 다시 시도해주세요.');
      return false;
    }
  };

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
          group: parseRosterGroup(row?.[0]),
          nickname: String(row?.[1] || "").trim(),
          handicap: Number(row?.[2]) || 0,
          authCode: String(row?.[3] || "").trim(),
          email: String(row?.[4] || "").trim().toLowerCase(),
          name: String(row?.[5] || "").trim(),
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
      const isAdmin = isRulesAdminUser(user);
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
        const groupRaw = r[0];
        const groupNum = (groupRaw === null || groupRaw === undefined || String(groupRaw).trim() === "") ? null : Number(groupRaw);
        const group = Number.isFinite(groupNum) ? groupNum : null;
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
                email,
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
              email,
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
          <div className={styles.headerGrid}>
            {/* 상단 1행: 파일명 영역은 preMembers/특별방 버튼 폭과 완전히 분리 */}
            <div className={styles.headerTopRow}>
              <div className={styles.leftCol}>
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
              <span className={styles.totalInline}>총 슬롯: {roomCount * 4}명</span>
            </div>

            {/* 하단 1행: 파일명 폭에 영향을 주지 않고 우측에만 배치 */}
            <div className={styles.headerActionRow}>
              <ToggleBtn checked={savePII} onChange={setSavePII} />
              <button
                type="button"
                onClick={() => setSkillRoomEditorOpen(true)}
                className={`${styles.pmToggleBtn} ${styles.specialRoomBtn}`}
                title="특별방 설정"
              >
                <span>특별방</span>
              </button>
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
                {Array.from({ length: 5 }, (_, n) => n).map((n) => (
                  <option key={n} value={n}>
                    {n}
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

      <SkillRoomEditor
        open={skillRoomEditorOpen}
        onClose={() => setSkillRoomEditorOpen(false)}
        onSave={saveSkillRoomConfig}
        value={skillRoomConfig}
        participants={participants}
        roomCount={roomCount}
        roomNames={roomNames}
        roomCapacities={roomCapacities}
        mode={mode}
      />

      <ParticipantRosterEditor
        open={participantEditorOpen}
        onClose={() => setParticipantEditorOpen(false)}
        onSubmit={handleParticipantEditorSubmit}
        participants={participants}
        selectedParticipantIds={selectedParticipantIds}
        mode={mode}
      />

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
