// src/flows/StepFlow.jsx

import React, { useState, createContext, useEffect, useContext, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { serverTimestamp } from 'firebase/firestore';

import { EventContext } from '../contexts/EventContext';
import StepPage from '../components/StepPage';
import Step1    from '../screens/Step1';
import Step2    from '../screens/Step2';
import Step3    from '../screens/Step3';
import Step4    from '../screens/Step4';
import Step5    from '../screens/Step5';
import Step6    from '../screens/Step6';
import Step7    from '../screens/Step7';
import Step8    from '../screens/Step8';

export const StepContext = createContext();

// ✅ Step5 등에서 import 해서 쓰는 훅 (기존 구조 유지)
export const useStep = () => useContext(StepContext);

/**
 * ✅ [ADD] deep stable stringify (중첩 객체/배열 포함)
 * - JSON.stringify(obj, replacerArray) 방식은 nested key가 통째로 누락되는 문제가 있어 사용 금지
 * - save()의 "동일 payload 저장 스킵" / roomTable 변경 감지에 사용
 */
const stableStringify = (input) => {
  const seen = new WeakSet();

  const norm = (v) => {
    if (v == null) return v;

    // Firestore Timestamp 유사 객체
    if (v && typeof v === 'object' && typeof v.toMillis === 'function') {
      try { return v.toMillis(); } catch { /* ignore */ }
    }

    if (typeof v !== 'object') return v;

    if (seen.has(v)) return null;
    seen.add(v);

    if (Array.isArray(v)) return v.map(norm);

    const out = {};
    Object.keys(v).sort().forEach((k) => {
      const nv = norm(v[k]);
      if (nv !== undefined) out[k] = nv;
    });
    return out;
  };

  try {
    return JSON.stringify(norm(input));
  } catch (e) {
    return '';
  }
};

/**
 * ✅ [ADD] Firestore backoff/Quota 상황에서도 STEP 이동이 무한 대기하지 않도록 타임아웃
 */
const withTimeout = async (promise, ms = 2500) => {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`timeout:${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
};

// ✅ [ADD] save() 직렬화(순서 보장) - reset/점수 저장 레이스 방지
const saveChainRef = { current: Promise.resolve() };

export default function StepFlow() {
  const {
    eventId,
    eventData,
    updateEvent,
    updateEventImmediate,
    // ✅ 추가: participants → rooms 컬렉션 스냅샷 저장용 브리지
    persistRoomsFromParticipants,
    // ✅ [PATCH] Player 즉시 반영용 scores 서브컬렉션
    upsertScores,
  } = useContext(EventContext);

  const { step }    = useParams();
  const navigate    = useNavigate();

  // 0) eventId 없으면 STEP0으로 강제 이동
  useEffect(() => {
    if (!eventId) navigate('/admin/home/0', { replace: true });
  }, [eventId, navigate]);

  // 1) 서버 데이터를 로컬 state에 항상 동기화
  const [mode, setMode]                 = useState('stroke');
  const [title, setTitle]               = useState('');
  const [roomCount, setRoomCount]       = useState(4);
  const [roomNames, setRoomNames]       = useState(Array(4).fill(''));
  const [roomCapacities, setRoomCapacities] = useState(Array(4).fill(4));
  const [uploadMethod, setUploadMethod] = useState('');

  // ⭐ patch: participants 상태 + ref 동기화
  const [participants, setParticipantsInner] = useState([]);
  const participantsRef = useRef(participants);
  const lastLocalParticipantsWriteMsRef = useRef(0);

  // ✅ [ADD] 로컬 편집(저장 전) 변경 시점: 서버 스냅샷이 로컬 입력을 덮어쓰는 문제 방지
  const localDirtyParticipantsMsRef = useRef(0);

  // ✅ [ADD] eventData(서버) participants를 적용하는 중에는 dirty로 기록하지 않기 위한 플래그
  const applyingRemoteParticipantsRef = useRef(false);

  /**
   * ✅ [ADD] save() 중복 호출/폭주 방지용 시그니처 ref
   * - lastSaveSignatureRef: "성공적으로 저장된" 마지막 payload
   * - inFlightSaveSignatureRef: "저장 진행 중" payload (동일 payload 중복 호출 방지)
   * - lastRoomsSignatureRef: roomTable(=방배정) 변경 감지용 (score 변경은 rooms 동기화 금지)
   */
  const lastSaveSignatureRef = useRef('');
  const inFlightSaveSignatureRef = useRef('');
  const lastRoomsSignatureRef = useRef('');

  // ✅ [PATCH] scores 1건/초기화 bulk 반영용 (중복 호출 방지에 활용 가능)
  const lastScoresSignatureRef = useRef('');
  const lastScoresSigMapRef = useRef({}); // id별 최근 upsertScores sig

  // ✅ [PATCH] 초기화 중 중복 클릭/중복 저장 방지
  const resetInFlightRef = useRef(false);

  // ⚠️ 중요: React setState는 비동기라서,
  // 입력 직후(같은 tick)에 goNext/save가 실행되면 prev가 아직 반영되기 전에
  // 이전 participants로 저장되어 점수가 '0'으로 덮어쓰이는 현상이 생길 수 있음.
  // 그래서 ref를 먼저(동기적으로) 갱신하고, 그 값으로 state를 업데이트한다.
  const setParticipants = (updater) => {
    const prev = participantsRef.current;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    participantsRef.current = next;

    // ✅ [ADD] 로컬에서 수정한 시점 기록(단, 서버 스냅샷 적용 중엔 제외)
    if (!applyingRemoteParticipantsRef.current) {
      localDirtyParticipantsMsRef.current = Date.now();
    }

    setParticipantsInner(next);
  };

  // ✅ 날짜 필드 동기화 추가(기존 유지)
  const [dateStart, setDateStart]       = useState('');
  const [dateEnd, setDateEnd]           = useState('');

  // ---------- [추가] 얕은 비교 헬퍼 : 실제 변경이 있을 때만 setState ----------
  const shallowEqualParticipants = (a = [], b = []) => {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      const x = a[i], y = b[i];
      if (!y) return false;
      if (
        x.id       !== y.id       ||
        x.group    !== y.group    ||
        x.nickname !== y.nickname ||
        x.handicap !== y.handicap ||
        x.room     !== y.room     ||
        x.partner  !== y.partner  ||
        x.selected !== y.selected
      ) return false;
    }
    return true;
  };
  // ---------------------------------------------------------------------------

  // ---------- [보완] eventData가 변경될 때 "실제로 달라졌을 때만" setState ----------
  useEffect(() => {
    if (!eventData) return;

    // mode
    if (mode !== eventData.mode) setMode(eventData.mode);

    // title
    if (title !== eventData.title) setTitle(eventData.title);

    // roomCount
    const nextRoomCount = eventData.roomCount ?? 4;
    if (roomCount !== nextRoomCount) setRoomCount(nextRoomCount);

    // roomNames
    const nextRoomNames = eventData.roomNames || Array(nextRoomCount).fill('');
    if ((roomNames || []).join('|') !== (nextRoomNames || []).join('|')) {
      setRoomNames(nextRoomNames);
    }

    // roomCapacities
    const nextRoomCapacities = Array.from({ length: nextRoomCount }, (_, i) => {
      const raw = Number(Array.isArray(eventData.roomCapacities) ? eventData.roomCapacities[i] : 4);
      const safe = Number.isFinite(raw) ? raw : 4;
      return Math.min(4, Math.max(1, safe));
    });
    if ((roomCapacities || []).join('|') !== (nextRoomCapacities || []).join('|')) {
      setRoomCapacities(nextRoomCapacities);
    }

    // uploadMethod
    if (uploadMethod !== eventData.uploadMethod) setUploadMethod(eventData.uploadMethod);

    // participants (안전 동기화: 빈 서버값이 로컬을 덮어쓰지 않도록 가드)
    const remoteParticipants = Array.isArray(eventData.participants)
      ? eventData.participants
      : [];

    applyingRemoteParticipantsRef.current = true;  
    setParticipants((prev) => {
      const prevList   = Array.isArray(prev) ? prev : [];
      const remoteList = remoteParticipants;

      // 1) 둘 다 비어 있으면 그대로 유지
      if (prevList.length === 0 && remoteList.length === 0) {
        return prevList;
      }

      // 2) 로컬이 비어 있고, 서버에만 데이터가 있으면 → 서버 데이터로 초기화
      if (prevList.length === 0 && remoteList.length > 0) {
        return remoteList;
      }

      // 3) 로컬에는 데이터가 있는데, 서버 값이 빈 배열이면 → 로컬 유지
      //    (엑셀 업로드 직후 "빈 participants" 스냅샷이 늦게 도착하는 경우 방지)
      if (prevList.length > 0 && remoteList.length === 0) {
        return prevList;
      }

      // 4) 둘 다 비어 있지 않은 경우:
      //    내용이 같으면 그대로 두고, 다를 때만 서버 값으로 교체
      if (shallowEqualParticipants(prevList, remoteList)) {
        return prevList;
      }

      // 로컬에서 막 저장한 직후(예: Step6에서 publicView만 업데이트되어 스냅샷이 먼저 오는 경우)
      // 서버 participants가 로컬보다 오래된 것으로 판단되면 로컬을 유지(점수 0 덮어쓰기 방지)
      const remoteAt = (eventData?.participantsUpdatedAt && typeof eventData.participantsUpdatedAt.toMillis === 'function')
        ? eventData.participantsUpdatedAt.toMillis()
        : (typeof eventData?.participantsUpdatedAtClient === 'number' ? eventData.participantsUpdatedAtClient : 0);
      const localWriteAt = lastLocalParticipantsWriteMsRef.current || 0;
      const localJustWrote = !!localWriteAt && (Date.now() - localWriteAt < 4000);
      if (localJustWrote) {
        if (!remoteAt || remoteAt < localWriteAt) {
          return prevList;
        }
      }

      const localDirtyAt = localDirtyParticipantsMsRef.current || 0;
      const localDirtyRecent = !!localDirtyAt && (Date.now() - localDirtyAt < 4000);
      if (localDirtyRecent) {
        if (!remoteAt || remoteAt < localDirtyAt) {
          return prevList;
        }
      }

      localDirtyParticipantsMsRef.current = 0;
      return remoteList;
    });
    applyingRemoteParticipantsRef.current = false;

    // dates
    const nextStart = eventData.dateStart || '';
    const nextEnd   = eventData.dateEnd   || '';
    if (dateStart !== nextStart) setDateStart(nextStart);
    if (dateEnd   !== nextEnd)   setDateEnd(nextEnd);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventData]); // 의존성은 기존과 동일하게 eventData 하나로 유지
  // ---------------------------------------------------------------------------

  // [COMPAT] Player/STEP8이 읽는 스키마로 동시 저장(dual write)
  const compatParticipant = (p) => {
    const copy = { ...p };

    // Remove draft fields
    // scoreRaw가 남아있으면(blur 없이 다음/이동) 저장 전에 score로 커밋
    if (Object.prototype.hasOwnProperty.call(copy, "scoreRaw")) {
      const raw = copy.scoreRaw;
      const s = raw === null || raw === undefined ? "" : String(raw).trim();
      if (s !== "") {
        const n = Number(s);
        if (Number.isFinite(n)) copy.score = n;
      }
      delete copy.scoreRaw;
    }
    if (Object.prototype.hasOwnProperty.call(copy, "dirty")) delete copy.dirty;    

    // score는 number 또는 null로 정규화
    if (typeof copy.score === "string") {
      const t = copy.score.trim();
      if (t === "") copy.score = null;
      else {
        const n = Number(t);
        copy.score = Number.isFinite(n) ? n : null;
      }
    } else if (copy.score === "" || copy.score === undefined) {
      copy.score = null;
    } else if (copy.score != null) {
      const n = Number(copy.score);
      copy.score = Number.isFinite(n) ? n : null;
    }

    const roomVal = copy.roomNumber ?? copy.room ?? null;

    return {
      ...copy,
      room: roomVal,
      roomNumber: roomVal,
      teammateId: copy.partner ?? null,
      teammate: copy.partner ?? null,
    };
  };

  const buildRoomTable = (list=[]) => {
    const table = {};
    list.forEach(p => {
      const r = p.room ?? null;
      if (r == null) return;
      if (!table[r]) table[r] = [];
      table[r].push(p.id);
    });
    return table;
  };


  // 저장 헬퍼: 함수 값을 제거하고 순수 JSON만 전달
  // ★ patch-start: make save async and await remote write to ensure persistence before route changes
  const saveOnce = async (updates) => {
    const clean = {};
    // ✅ rooms 컬렉션 스냅샷 생성에 사용할 participants (있을 때만)
    let participantsForRooms = null;

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'participants' && Array.isArray(value)) {
        // [COMPAT] participants를 호환형으로 변환해서 저장
        const compat = value.map(item => {
          const base = {};
          Object.entries(item).forEach(([k, v]) => {
            if (typeof v !== 'function' && v !== undefined) base[k] = v;
          });
          return compatParticipant(base);
        });
        clean[key] = compat;
        // ✅ 모드별 participants 분리 저장 지원(스트로크/포볼)
        // - EventContext에서도 동일 미러를 수행하지만, StepFlow에서도 같이 기록해 두면
        //   기존 이벤트(필드 미존재)도 최초 저장 시 분리 필드가 생성되어 더 안정적임.
        try {
          const m = (clean.mode || mode || (eventData && eventData.mode) || 'stroke');
          const mm = String(m || '').toLowerCase();
          const isFour = (mm === 'fourball' || mm === 'agm');

          // ✅ [SSOT/SAFE] 모드별 participants 분리 필드가 이미 존재하는 이벤트에서는
          // 현재 모드 필드만 갱신하고, 다른 모드 필드는 건드리지 않음(교차 덮어쓰기 방지)
          const hadSplit = !!(eventData && (
            Object.prototype.hasOwnProperty.call(eventData, 'participantsStroke') ||
            Object.prototype.hasOwnProperty.call(eventData, 'participantsFourball')
          ));

          // 기존 이벤트(분리 필드 없음) 최초 저장 시에는 호환을 위해 양쪽 필드를 1회 생성
          if (!hadSplit) {
            clean.participantsStroke = compat;
            clean.participantsFourball = compat;
          } else if (isFour) {
            clean.participantsFourball = compat;
          } else {
            clean.participantsStroke = compat;
          }
        } catch {}
        // [COMPAT] 참고용 roomTable도 같이 저장(읽지 않으면 무시됨)
        clean.roomTable   = buildRoomTable(compat);
        // ✅ [SYNC_GUARD] 점수는 /scores SSOT, participants 저장 payload에는 배정 관련 필드만 유지
        // ✅ rooms 하위 컬렉션 저장용으로도 기억
        participantsForRooms = compat;
      } else if (typeof value !== 'function' && value !== undefined) {
        clean[key] = value;
      }
    });

    /**
     * ✅ [ADD] 동일 payload/동일 in-flight payload 저장 스킵 → 쓰기 폭주 방지
     * (주의) sig는 "성공 저장" 이후에만 lastSaveSignatureRef에 기록됨
     */
    const sig = stableStringify(clean);
    if (sig) {
      if (sig === lastSaveSignatureRef.current) return;
      if (sig === inFlightSaveSignatureRef.current) return;
      inFlightSaveSignatureRef.current = sig;
    }

    // Firestore events/{eventId}에 먼저 저장
    const hasParticipants = Object.prototype.hasOwnProperty.call(clean, 'participants');
    if (hasParticipants) {
      clean.participantsUpdatedAt = serverTimestamp();
      clean.participantsUpdatedAtClient = Date.now();
      lastLocalParticipantsWriteMsRef.current = clean.participantsUpdatedAtClient;
    }

    // ✅ [ADD] rooms 동기화는 roomTable(=방배정) 변경이 있을 때만 수행
    const roomSig = participantsForRooms
      ? stableStringify(clean.roomTable || buildRoomTable(participantsForRooms))
      : '';

    try {
      await withTimeout(
        (updateEventImmediate
          ? updateEventImmediate(clean, hasParticipants ? false : true)
          : updateEvent(clean)
        ),
        2500
      );

      // 성공한 경우에만 lastSaveSignatureRef 업데이트
      if (sig) lastSaveSignatureRef.current = sig;
      localDirtyParticipantsMsRef.current = 0;
    } catch (e) {
      console.warn('[StepFlow] save(updateEvent*) failed (continue):', e);
    } finally {
      if (sig && inFlightSaveSignatureRef.current === sig) {
        inFlightSaveSignatureRef.current = '';
      }
    }

    // ✅ participants가 포함된 경우에만 rooms 컬렉션 스냅샷도 동기화
    // ✅ 그리고 "방배정(roomTable)"이 실제로 바뀐 경우에만 실행 (score 변경으로 rooms 갈아엎기 금지)
    if (participantsForRooms && typeof persistRoomsFromParticipants === 'function') {
      const shouldSyncRooms = !!roomSig && roomSig !== lastRoomsSignatureRef.current;

      if (shouldSyncRooms) {
        try {
          await withTimeout(persistRoomsFromParticipants(participantsForRooms), 2500);
          // 성공한 경우에만 room sig 기록
          lastRoomsSignatureRef.current = roomSig;
        } catch (e) {
          console.warn('[StepFlow] persistRoomsFromParticipants failed (continue):', e);
        }
      }
    }
  };

  // ✅ [ADD] save 직렬화 래퍼: 항상 순서대로 실행되게 해서 "초기화 후 점수 부활/깜빡임" 방지
  const save = (updates) => {
    saveChainRef.current = (saveChainRef.current || Promise.resolve())
      .catch(() => {}) // 앞 save 에러로 체인이 끊기지 않게
      .then(() => saveOnce(updates));
    return saveChainRef.current;
  };

  // ★ patch-end

  // ✅ [PATCH] 점수 디바운스 타이머 (캡처 next 문제 해결용)
  const scoreSaveTimerRef = useRef(null);

  // ✅ [ADD] save() 직렬화(순서 보장) - reset/점수 저장 레이스 방지
  const saveChainRef = useRef(Promise.resolve());

  // 전체 초기화 (현재 mode 유지)
  const resetAll = async () => {
    // ✅ [PATCH] 점수 디바운스 타이머가 남아있으면, 나중에 옛 점수를 다시 저장할 수 있음 → 즉시 취소
    try {
      if (scoreSaveTimerRef.current) clearTimeout(scoreSaveTimerRef.current);
    } catch { /* ignore */ }
    scoreSaveTimerRef.current = null;

    const init = {
      mode,
      title:        '',
      roomCount:    4,
      roomNames:    Array(4).fill(''),
      roomCapacities: Array(4).fill(4),
      uploadMethod: '',
      participants: [],
      dateStart:    '',
      dateEnd:      ''
    };
    setMode(init.mode);
    setTitle(init.title);
    setRoomCount(init.roomCount);
    setRoomNames(init.roomNames);
    setRoomCapacities(init.roomCapacities);
    setUploadMethod(init.uploadMethod);
    setParticipants(init.participants);
    setDateStart(init.dateStart);
    setDateEnd(init.dateEnd);
    await save(init);
    navigate('/admin/home/0', { replace: true });
  };

  // STEP 네비게이션
  const curr       = Number(step) || 1;
  const strokeFlow = [1,2,3,4,5,6];
  const agmFlow    = [1,2,3,4,7,8];
  // ✅ mode 값이 'agm'으로 들어오거나(구버전) eventData 로딩 전 기본값('stroke')이 잠깐 잡히는 경우가 있어
  //    화면/저장 로직에서 일관되게 'stroke' | 'fourball'로 정규화해서 사용
  const normMode = (m) => {
    if (!m) return 'stroke';
    if (m === 'agm') return 'fourball';
    return m;
  };

  const effectiveMode = normMode((eventData && eventData.mode) || mode);
  const flow       = effectiveMode === 'stroke' ? strokeFlow : agmFlow;

  // ★ FIX: 저장을 await 후 이동(레이스 제거) + participantsRef로 항상 최신 값 사용
  const goNext = async () => {
    // ✅ eventData 로딩 전에 저장/이동하면 mode 기본값('stroke')이 Firestore에 덮어써지며
    //    포볼 대회가 스트로크 탭으로 "이동"되는 현상이 발생할 수 있음
    if (eventId && !eventData) {
      alert('대회 데이터를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const latest = participantsRef.current || participants;
    await save({ title, roomCount, roomNames, roomCapacities, uploadMethod, participants: latest, dateStart, dateEnd });
    const idx  = flow.indexOf(curr);
    const next = flow[(idx + 1) % flow.length];
    navigate(`/admin/home/${next}`);
  };

  const goPrev = async () => {
    if (eventId && !eventData) {
      alert('대회 데이터를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const latest = participantsRef.current || participants;
    await save({ title, roomCount, roomNames, roomCapacities, uploadMethod, participants: latest, dateStart, dateEnd });
    const idx  = flow.indexOf(curr);
    const prev = flow[(idx - 1 + flow.length) % flow.length];
    navigate(prev === 0 ? '/admin/home/0' : `/admin/home/${prev}`);
  };

  // ★ FIX: 하단 메뉴/아이콘으로 step 강제 이동할 때도 먼저 저장(점수 0 덮어쓰기 방지)
  const setStep = async (n) => {
    if (eventId && !eventData) {
      alert('대회 데이터를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const latest = participantsRef.current || participants;
    await save({ title, roomCount, roomNames, roomCapacities, uploadMethod, participants: latest, dateStart, dateEnd });
    navigate(`/admin/home/${n}`);
  };

  // 모드 변경 & 저장
  const changeMode  = newMode => {
    setMode(newMode);
    save({ mode: newMode });
  };

  // 대회명 변경 & 저장
  const changeTitle = newTitle => {
    setTitle(newTitle);
    save({ title: newTitle });
  };

  // 파일 업로드 처리 (Step4 등)
  const handleFile = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ab    = await file.arrayBuffer();
    const wb    = XLSX.read(ab, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(1);
    const data  = rows.map((row, idx) => ({
      id:       idx,
      group:    Number(row[0]) || 1,
      nickname: String(row[1] || '').trim(),
      handicap: Number(row[2]) || 0,
      authCode: String(row[3] || '').trim(),
      // ✅ 이메일 로그인 매칭용(엑셀 5~6열 보강, 기존 1~4열 로직 유지)
      email:    String(row[4] || '').trim().toLowerCase(),
      name:     String(row[5] || '').trim(),
      score:    null,
      room:     null,
      partner:  null,
      selected: false
    }));
    setParticipants(data);
    await save({ participants: data }); // ← 업로드 직후 즉시 커밋(+ rooms 컬렉션도 정리)
  };

  // Step5: 수동 초기화
  const initManual = () => {
    const totalSlots = (Array.isArray(roomCapacities) && roomCapacities.length)
      ? roomCapacities.reduce((sum, v) => sum + Math.max(1, Math.min(4, Number(v) || 4)), 0)
      : roomCount * 4;
    const data = Array.from({ length: totalSlots }, (_, idx) => ({
      id:       idx,
      group:    1,
      nickname: '',
      handicap: 0,
      score:    null,
      room:     null,
      partner:  null,
      authCode: '',
      selected: false
    }));
    setParticipants(data);
    save({ participants: data });
  };

  const getRoomCapacity = (roomNo) => {
    const idx = Number(roomNo) - 1;
    const raw = Number(Array.isArray(roomCapacities) ? roomCapacities[idx] : 4);
    const safe = Number.isFinite(raw) ? raw : 4;
    return Math.min(4, Math.max(1, safe));
  };

  // [ADD2] 그룹 판정 헬퍼: group 필드 우선, 없으면 id 홀/짝으로 보조
  const isGroup1 = (p) => {
    const g = Number(p?.group);
    if (Number.isFinite(g)) return (g % 2) === 1; // 1,3,5... => 1조/리더
    return (Number(p?.id) % 2) === 1;
  };
  const isGroup2 = (p) => {
    const g = Number(p?.group);
    if (Number.isFinite(g)) return (g % 2) === 0; // 2,4,6... => 2조/파트너
    return (Number(p?.id) % 2) === 0;
  };

  // 🔹 추가: 두 사람을 **한 번의 저장으로** 같은 방/상호 파트너로 확정하는 헬퍼

  // ✅ [PATCH][SSOT] score-only 업데이트 감지 (점수는 /scores SSOT로만 저장)
  const isScoreOnlyFields = (fields) => {
    if (!fields || typeof fields !== 'object') return false;
    const keys = Object.keys(fields);
    return keys.length > 0 && keys.every((k) => k === 'score');
  };

  const updateParticipantsBulkNow = async (changes) => {
    const base = participantsRef.current || [];
    const map = new Map((changes || []).map((c) => [String(c.id), c.fields || {}]));

    const next = base.map((p) =>
      map.has(String(p.id)) ? { ...p, ...map.get(String(p.id)) } : p
    );

    setParticipants(next);

    // ✅ [PATCH][SSOT] score-only bulk update는 participants 저장(save) 금지 (방배정 덮어쓰기/레이스 방지)
    const allScoreOnly = Array.isArray(changes) && changes.length > 0 && changes.every((c) => isScoreOnlyFields(c.fields));
    if (allScoreOnly) {
      if (typeof upsertScores === 'function') {
        try {
          const payload = (changes || []).map((c) => {
            const id = c.id;
            const raw = (c.fields && Object.prototype.hasOwnProperty.call(c.fields, 'score')) ? c.fields.score : null;
            const v = raw === '' ? null : Number(raw);
            const me = (next || []).find((p) => p.id === id) || (participantsRef.current || []).find((p) => p.id === id);
            const room = me?.room ?? me?.roomNumber ?? null;
            return { id, score: Number.isFinite(v) ? v : null, room };
          });

          // id별 sig 기록(중복 호출 방지)
          const mapSig = lastScoresSigMapRef.current || {};
          payload.forEach(({ id, score, room }) => {
            mapSig[String(id)] = `${id}:${score ?? 'null'}:${room ?? 'null'}`;
          });
          lastScoresSigMapRef.current = mapSig;

          await Promise.resolve(upsertScores(payload));
        } catch (e) {
          console.warn('[StepFlow] upsertScores(score-only bulk) failed (continue):', e);
        }
      }
      return;
    }

    await save({ participants: next, dateStart, dateEnd });
  };

  // (추가) 두 사람(1조+2조) 배정을 한 번에 커밋하는 헬퍼
  const assignPairToRoom = async (p1Id, p2Id, roomNo) => {
    await updateParticipantsBulkNow([
      { id: p1Id, fields: { room: roomNo, roomNumber: roomNo, partner: p2Id } },
      { id: p2Id, fields: { room: roomNo, roomNumber: roomNo, partner: p1Id } },
    ]);
  };

  const updateParticipantNow = async (id, fields) => {
    // ✅ [PATCH][SSOT] score-only single update는 participants 저장(save) 금지 (점수는 /scores SSOT)
    if (isScoreOnlyFields(fields)) {
      const raw = (fields && Object.prototype.hasOwnProperty.call(fields, 'score')) ? fields.score : null;
      const v = raw === '' ? null : Number(raw);

      // 로컬 즉시 반영
      setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, score: Number.isFinite(v) ? v : null } : p)));

      // /scores 서브컬렉션 반영(가능할 때만)
      if (typeof upsertScores === 'function') {
        try {
          const me = (participantsRef.current || []).find((p) => p.id === id);
          const room = me?.room ?? me?.roomNumber ?? null;
          const sig = `${id}:${(Number.isFinite(v) ? v : null) ?? 'null'}:${room ?? 'null'}`;

          const mapSig = lastScoresSigMapRef.current || {};
          if (mapSig[String(id)] !== sig) {
            mapSig[String(id)] = sig;
            lastScoresSigMapRef.current = mapSig;
            await Promise.resolve(upsertScores([{ id, score: Number.isFinite(v) ? v : null, room }]));
          }
        } catch (e) {
          console.warn('[StepFlow] upsertScores(score-only single) failed (continue):', e);
        }
      }
      return;
    }

    const base = participantsRef.current || [];
    const next = base.map((p) => (p.id === id ? { ...p, ...fields } : p));
    setParticipants(next);
    await save({ participants: next, dateStart, dateEnd });
  };

  // Step7: AGM 수동 할당 (방 + 파트너 랜덤/연동)
  const handleAgmManualAssign = async (id) => {
    let ps = [...participants];
    const target = ps.find((p) => p.id === id);
    let roomNo = null;
    let partner = null;

    if (!target) {
      return { roomNo: null, nickname: "", partnerNickname: null };
    }

    if (!isGroup1(target)) {
      return {
        roomNo: (target.room ?? target.roomNumber ?? null),
        nickname: target?.nickname || '',
        partnerNickname: target?.partner
          ? (ps.find(p=>p.id===target.partner)?.nickname || null)
          : null
      };
    }

    roomNo = (target.room ?? target.roomNumber ?? null);
    if (roomNo == null) {
      // 같은 그룹1이 한 방에 최대 floor(capacity / 2)명
      const countByRoom = ps
        .filter(p => isGroup1(p) && (p.room != null || p.roomNumber != null))
        .reduce((acc, p) => { const rn = (p.room ?? p.roomNumber);
          acc[rn] = (acc[rn]||0) + 1; return acc; }, {});
      const candidates = Array.from({ length: roomCount }, (_, i) => i+1)
        .filter(r => {
          const pairSlots = Math.floor(getRoomCapacity(r) / 2);
          return pairSlots > 0 && (countByRoom[r] || 0) < pairSlots;
        });
      roomNo = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    }

    // 우선 대상의 방만 확정(파트너는 아직)
    ps = ps.map(p => p.id === id ? { ...p, room: roomNo, roomNumber: roomNo } : p);

    // 파트너는 그룹2 중 미배정자에서 선택
    const pool2 = ps.filter(p => isGroup2(p) && p.room == null && p.roomNumber == null);
    partner = pool2.length ? pool2[Math.floor(Math.random() * pool2.length)] : null;

    if (partner && roomNo != null) {
      // 두 사람을 **동시에** 확정 → 저장 한 번
      await assignPairToRoom(id, partner.id, roomNo);
      return {
        roomNo,
        nickname: target?.nickname || '',
        partnerNickname: partner?.nickname || null
      };
    }

    setParticipants(ps);
    await save({ participants: ps });
    return {
      roomNo,
      nickname: target?.nickname || '',
      partnerNickname: partner?.nickname || null
    };
  };

  // Step7: AGM 수동 할당 취소
  const handleAgmCancel = async (id) => {
    let ps = [...participants];
    const target = ps.find(p => p.id === id);
    if (target?.partner != null) {
      const pid = target.partner;
      ps = ps.map(p => (p.id === id || p.id === pid)
        ? { ...p, room: null, roomNumber: null, partner: null }
        : p
      );
    } else {
      ps = ps.map(p => p.id === id ? { ...p, room: null, roomNumber: null, partner: null } : p);
    }
    setParticipants(ps);
    await save({ participants: ps });
  };

  // Step8: AGM 자동 할당
  const handleAgmAutoAssign = async () => {
    let ps = [...participants];
    const roomsArr = Array.from({ length: roomCount }, (_, i) => i+1);

    // 1) 그룹1(리더) 채우기: 방당 최대 floor(capacity / 2)명
    roomsArr.forEach(roomNo => {
      const g1InRoom = ps.filter(p => isGroup1(p) && p.room === roomNo).length;
      const pairSlots = Math.floor(getRoomCapacity(roomNo) / 2);
      const need = Math.max(0, pairSlots - g1InRoom);
      if (need <= 0) return;

      const freeG1 = ps.filter(p => isGroup1(p) && p.room == null);
      for (let i = 0; i < need && freeG1.length; i += 1) {
        const pick = freeG1.splice(Math.floor(Math.random() * freeG1.length), 1)[0];
        ps = ps.map(p => p.id === pick.id ? { ...p, room: roomNo, roomNumber: roomNo, partner: null } : p);
      }
    });

    // 2) 그룹1마다 그룹2 파트너 채우기(미배정 그룹2에서)
    roomsArr.forEach(roomNo => {
      const freeG1 = ps.filter(p => isGroup1(p) && p.room === roomNo && p.partner == null);
      freeG1.forEach(p1 => {
        const freeG2 = ps.filter(p => isGroup2(p) && p.room == null);
        if (!freeG2.length) return;
        const pick = freeG2[Math.floor(Math.random() * freeG2.length)];
        ps = ps.map(p => {
          if (p.id === p1.id)   return { ...p, partner: pick.id };
          if (p.id === pick.id) return { ...p, room: roomNo, roomNumber: roomNo, partner: p1.id };
          return p;
        });
      });
    });

    setParticipants(ps);
    const cleanList = ps.map(p => ({
      id: p.id,
      group: p.group,
      nickname: p.nickname,
      handicap: p.handicap,
      score: p.score,
      room: p.room,
      partner: p.partner,
      authCode: p.authCode,
      selected: p.selected
    }));
    await save({ participants: cleanList });
  };

  // ✅ [PATCH] Step8/Step7/Step5 공통: "초기화" 시 디바운스 저장이 늦게 실행되며 옛 점수를 되살리는 문제 방지
  const handleAgmReset = async () => {
    if (resetInFlightRef.current) return;
    resetInFlightRef.current = true;

    // 1) 대기 중인 점수 저장 타이머가 있으면 즉시 취소 (핵심)
    try {
      if (scoreSaveTimerRef.current) clearTimeout(scoreSaveTimerRef.current);
    } catch { /* ignore */ }
    scoreSaveTimerRef.current = null;

    // 2) 최신 participants 기준으로 초기화
    const base = participantsRef.current || participants || [];
    const ps = base.map(p => ({ ...p, room: null, roomNumber: null, partner: null, score: null }));
    setParticipants(ps);

    try {
      await save({ participants: ps });

      // 3) (추가 권장) scores 서브컬렉션도 한 번에 null로 반영 → Player/다른 화면 즉시 정합
      if (typeof upsertScores === 'function') {
        try {
          const payload = ps.map(p => ({ id: p.id, score: null, room: null, roomNumber: null }));
          const sig = stableStringify(payload);
          // 너무 잦은 bulk clear 중복 방지(선택)
          if (!sig || sig !== lastScoresSignatureRef.current) {
            if (sig) lastScoresSignatureRef.current = sig;
            await withTimeout(Promise.resolve(upsertScores(payload)), 2500);
          }
        } catch (e) {
          console.warn('[StepFlow] upsertScores(reset bulk) failed (continue):', e);
        }
      }

      // reset 이후 id별 score sig도 초기화(선택)
      lastScoresSigMapRef.current = {};
    } finally {
      resetInFlightRef.current = false;
    }
  };

  // ★ Step7/Step5에서 공통으로 쓰는 점수 변경 콜백 제공
  const onScoreChangeNow = (id, value) => {
    const v = value === '' ? null : Number(value);

    // 로컬 즉시 반영
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, score: v } : p)));

    // ✅ [PATCH] Player 즉시 반영: scores 서브컬렉션 1회만 업데이트(있을 때만)
    if (typeof upsertScores === 'function') {
      try {
        const me = (participantsRef.current || []).find((p) => p.id === id);
        const room = me?.room ?? null;
        const sig = `${id}:${v ?? 'null'}:${room ?? 'null'}`;

        const map = lastScoresSigMapRef.current || {};
        if (map[String(id)] !== sig) {
          map[String(id)] = sig;
          lastScoresSigMapRef.current = map;
          Promise.resolve(upsertScores([{ id, score: v, room }]))
            .catch((e) => console.warn('[StepFlow] upsertScores failed (continue):', e));
        }
      } catch (e) {
        console.warn('[StepFlow] upsertScores failed (continue):', e);
      }
    }

    // ✅ [SSOT 통일] 점수는 /scores 서브컬렉션이 단일 진실(SSOT).
    //    따라서 점수 입력만으로 events 루트(participants)를 save() 하지 않습니다.
    //    (배정/수정 등 participants 구조 변경 시에만 save 호출)
    try {
      if (scoreSaveTimerRef.current) {
        clearTimeout(scoreSaveTimerRef.current);
        scoreSaveTimerRef.current = null;
      }
    } catch { /* ignore */ }
  };

  const ctxValue = {
    onManualAssign: handleAgmManualAssign,
    onCancel:        handleAgmCancel,
    onAutoAssign:    handleAgmAutoAssign,
    onReset:         handleAgmReset,
    onScoreChange:   onScoreChangeNow,         // ★ AGM/Stroke 점수 입력용 콜백
    goNext, goPrev, setStep,
    setMode: changeMode,
    setTitle: changeTitle,
    mode, changeMode,
    title, changeTitle,
    roomCount, setRoomCount,
    roomNames, setRoomNames,
    roomCapacities, setRoomCapacities,
    uploadMethod, setUploadMethod,
    participants, setParticipants,
    resetAll, handleFile, initManual,
    updateParticipant:      updateParticipantNow,
    updateParticipantsBulk: updateParticipantsBulkNow,
    // 날짜 state도 노출
    dateStart, setDateStart,
    dateEnd,   setDateEnd,
  };

  const pages = {
    1:<Step1/>,
    2:<Step2/>,
    3:<Step3/>,
    4:<Step4/>,
    5:<Step5/>,
    6:<Step6/>,
    7:<Step7/>,
    8:<Step8/>
  };
  const Current = pages[curr] || <Step1 />;

  return (
    <StepContext.Provider value={ctxValue}>
      <StepPage step={curr} setStep={setStep}>
        {Current}
      </StepPage>
    </StepContext.Provider>
  );
}

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
