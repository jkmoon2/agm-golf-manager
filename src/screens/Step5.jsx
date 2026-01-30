// src/screens/Step5.jsx

import React, { useState, useEffect, useContext, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { StepContext } from '../flows/StepFlow';          // ✅ 경로 고정 (에러 방지)
import { EventContext } from '../contexts/EventContext';  // ✅ 경로 고정 (에러 방지)
import { serverTimestamp, collection, onSnapshot } from 'firebase/firestore';     // ✅ [ADD] participantsUpdatedAt 동기화용
import { db } from '../firebase';
import styles from './Step5.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// (util) Firestore에 저장 가능한 형태로 정리
//  - Firestore는 undefined를 허용하지 않음(중첩 포함) → 전부 제거
//  - 빈 key("")도 허용하지 않음 → 제거
// ─────────────────────────────────────────────────────────────────────────────
const sanitizeUndefinedDeep = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (Array.isArray(value)) {
    return value
      .map((v) => sanitizeUndefinedDeep(v))
      .filter((v) => v !== undefined);
  }

  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((k) => {
      if (!k) return; // 빈 키 방지
      const v = sanitizeUndefinedDeep(value[k]);
      if (v === undefined) return;
      out[k] = v;
    });
    return out;
  }

  return value;
};

export default function Step5() {
  const {
    participants,
    setParticipants,
    roomCount,
    roomNames,
    goPrev,
    goNext,

    // (옵션) StepFlow에 존재하면 사용
    updateParticipant,
    updateParticipantsBulk,
  } = useContext(StepContext);

  // ✅ SSOT 통일: 점수는 /events/{eventId}/scores/{pid} 에만 저장(양방향 실시간)
  //    - Step5/7/Admin, Player 모두 동일한 scores를 읽고/쓰도록 정리
  //    - participants 배열에는 score를 영구 저장하지 않음(방배정/명단만 유지)
  const { eventId, updateEventImmediate, upsertScores, resetScores } = useContext(EventContext) || {};

  const rooms = useMemo(
    () => Array.from({ length: Number(roomCount || 0) }, (_, i) => i + 1),
    [roomCount]
  );

  const [loadingId, setLoadingId] = useState(null);

  // ✅ [ADD] participants 동기화 직렬화(마지막 요청이 항상 최종 반영)
  const syncInFlightRef = useRef(false);
  const queuedSyncRef = useRef(null);
  const lastSyncedSigRef = useRef('');

  // ✅ [ADD] onNext에서 항상 최신 participants로 저장하기 위한 스냅샷 ref
  const latestParticipantsRef = useRef(participants);

  // room / roomNumber 통합 처리 (스트로크/포볼 공통)
  const getRoomValue = (p) => {
    const raw = p?.roomNumber ?? p?.room;
    if (raw === '' || raw === undefined || raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const withRoomValue = (p, room) => {
    if (room === '' || room === undefined || room == null) {
      return { ...p, room: null, roomNumber: null };
    }
    const n = Number(room);
    const v = Number.isFinite(n) ? n : null;
    return { ...p, room: v, roomNumber: v };
  };


  useEffect(() => {
    latestParticipantsRef.current = participants;
  }, [participants]);

  // ✅ SSOT: 점수는 scores 서브컬렉션을 실시간 구독하여 표시
  //   - 운영자(Admin Step5) 입력 ↔ 참가자(Player Step4) 입력 모두 즉시 반영
  const [scoresMap, setScoresMap] = useState({});
  useEffect(() => {
    if (!eventId) {
      setScoresMap({});
      return undefined;
    }
    try {
      const colRef = collection(db, 'events', eventId, 'scores');
      const unsub = onSnapshot(colRef, (snap) => {
        const next = {};
        snap.forEach((d) => {
          const data = d.data() || {};
          next[d.id] = data;
        });
        setScoresMap(next);
      });
      return () => unsub();
    } catch (e) {
      console.warn('[Step5] scores subscription failed', e);
      setScoresMap({});
      return undefined;
    }
  }, [eventId]);

  // ✅ (추가) Step5에서는 “중간영역만 스크롤” 되도록 body 스크롤 잠금 (타이틀 고정 문제 해결)
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // (A) 하단 버튼 위치를 Step4와 동일한 방식으로 맞추기 (bottomTabBar 높이 감지 + safe-area)
  // ─────────────────────────────────────────────────────────────────────────────
  const [__bottomGap, __setBottomGap] = useState(64);
  useEffect(() => {
    const probe = () => {
      try {
        const el =
          document.querySelector('[data-bottom-nav]') ||
          document.querySelector('#bottomTabBar') ||
          document.querySelector('.bottomTabBar') ||
          document.querySelector('.BottomTabBar');
        __setBottomGap(el && el.offsetHeight ? el.offsetHeight : 64);
      } catch (e) {}
    };
    probe();
    window.addEventListener('resize', probe);
    return () => window.removeEventListener('resize', probe);
  }, []);

  const __FOOTER_H = 56;
  const __safeBottom = `calc(env(safe-area-inset-bottom, 0px) + ${__bottomGap}px)`;

  const pageStyle = {
    height: '100dvh',
    overflow: 'hidden',
    boxSizing: 'border-box',
    // footer가 fixed라서, 본문이 footer 밑으로 들어가지 않게 paddingBottom 확보
    paddingBottom: `calc(${__FOOTER_H}px + ${__safeBottom})`,
    display: 'flex',
    flexDirection: 'column',
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // (B) Firestore에 participants[] 커밋 (A안: onBlur 시점에만 1회 커밋)
  //  - updateEventImmediate({participants}, false) 로 “스킵” 방지
  // ─────────────────────────────────────────────────────────────────────────────
  const syncParticipantsToEvent = useCallback(
    async (nextList) => {
      if (!eventId || typeof updateEventImmediate !== 'function') return;

      // ✅ in-flight면 "마지막 요청"만 저장해두고 종료 (마지막이 승리)
      if (syncInFlightRef.current) {
        queuedSyncRef.current = nextList || [];
        return;
      }

      try {
        const sanitized = (nextList || []).map((p) => {
          // ✅ SSOT: 점수는 scores 서브컬렉션만 사용 → participants에는 score/scoreRaw 저장 금지
          const { scoreRaw, score, ...rest } = p;
          return sanitizeUndefinedDeep(rest);
        });

        // 간단 시그니처(중복 동기화 스킵용)
        let sig = '';
        try { sig = JSON.stringify(sanitized); } catch { sig = ''; }
        if (sig && sig === lastSyncedSigRef.current) return;

        syncInFlightRef.current = true;

        // ★ patch: STEP6/STEP8 표에서 방 구성용 roomTable 갱신(점수는 scores 서브컬렉션이 권위 소스)
        const roomTable = {};
        for (const p of sanitized) {
          const r = p?.roomNumber ?? p?.room;       // 어떤 데이터가 와도 안전하게
          if (!r) continue;
          const key = String(r);

          if (!roomTable[key]) roomTable[key] = [];
          roomTable[key].push(p.id);
        }  

        await updateEventImmediate(
          {
            participants: sanitized,
            roomTable,
            participantsUpdatedAt: serverTimestamp(),
            participantsUpdatedAtClient: Date.now(),
          },
          false
        );

        if (sig) lastSyncedSigRef.current = sig;
      } catch (e) {
        console.warn('[Step5] syncParticipantsToEvent error:', e);
      } finally {
        syncInFlightRef.current = false;

        // ✅ in-flight 동안 들어온 최신 요청이 있으면 1번 더 실행
        if (queuedSyncRef.current) {
          const queued = queuedSyncRef.current;
          queuedSyncRef.current = null;
          // 재귀 1회(계속 누적되어도 마지막 것만 따라감)
          syncParticipantsToEvent(queued);
        }
      }
    },
    [eventId, updateEventImmediate]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // (C) 점수 입력: 숫자키패드 유지 + 빈칸 롱프레스하면 '-'만 입력 후 숫자 입력 대기
  // ─────────────────────────────────────────────────────────────────────────────
  const participantsRef = useRef(participants);
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // 점수 입력 커밋 시퀀스 (A안: onBlur에서 마지막 1회만 Firestore/Context에 반영)
  const scoreCommitSeqRef = useRef(0);

  // 각 참가자 점수 input ref (롱프레스 후 포커스 유지)
  const scoreInputRefs = useRef({});

  // ✅ [ADD] 셀을 눌러도 점수 input에 포커스(모바일에서 "수동" 버튼 오클릭/포커스 이탈 방지)
  const focusScoreInput = (pid) => {
    try {
      const el = scoreInputRefs.current?.[pid];
      if (el && typeof el.focus === 'function') el.focus();
    } catch {}
  };

  // 롱프레스 타이머
  const scoreLongPressTimers = useRef({});

  const cancelScoreLongPress = (pid) => {
    const t = scoreLongPressTimers.current[pid];
    if (t) clearTimeout(t);
    delete scoreLongPressTimers.current[pid];
  };

  const startScoreLongMinus = (pid) => {
    cancelScoreLongPress(pid);

    scoreLongPressTimers.current[pid] = setTimeout(() => {
      const cur = (participantsRef.current || []).find((x) => x.id === pid);
      const curText =
        cur?.scoreRaw !== undefined
          ? String(cur.scoreRaw ?? '')
          : (cur?.score != null ? String(cur.score) : '');

      // 요구사항: "빈칸이면 → 롱프레스하면 '-'만 들어가고 숫자 입력 기다림"
      let nextText = '-';
      if (curText && curText.startsWith('-')) {
        // 이미 -로 시작하면 토글로 제거
        nextText = curText.slice(1);
      } else if (curText && !curText.startsWith('-')) {
        // 값이 있으면 앞에 - 붙이기
        nextText = `-${curText}`;
      } else {
        // 빈칸이면 '-'만
        nextText = '-';
      }

      onScoreChange(pid, nextText);

      // 포커스 유지 + 커서 맨 끝
      setTimeout(() => {
        const el = scoreInputRefs.current[pid];
        if (el) {
          try {
            el.focus();
            const len = String(nextText).length;
            if (el.setSelectionRange) el.setSelectionRange(len, len);
          } catch (e) {}
        }
      }, 0);
    }, 550);
  };

  // 입력값 정리(숫자/선행 - 만 허용, 콤마 등 제거)
  const normalizeScoreText = (raw) => {
    const s = String(raw ?? '');
    if (s === '') return '';
    let cleaned = s.replace(/[^0-9-]/g, '');
    cleaned = cleaned.replace(/(?!^)-/g, '');
    return cleaned;
  };

  // ✅ [A안] onChange는 "로컬 업데이트만" 수행 (Firestore 저장/커밋은 하지 않음)
  const onScoreChange = (id, rawValue) => {
    const value = normalizeScoreText(rawValue);

    setParticipants((prev) => {
      const nextList = prev.map((p) => {
        if (p.id !== id) return p;

        if (value === '' || value === null) {
          return { ...p, score: null, scoreRaw: '' };
        }

        if (value === '-') {
          return { ...p, score: null, scoreRaw: '-' };
        }

        const num = Number(value);
        if (Number.isNaN(num)) {
          return { ...p, score: null, scoreRaw: value };
        }

        const clone = { ...p, score: num, scoreRaw: value }; // ✅ [PATCH] 편집 중에는 scoreRaw 유지 (liveScore 덮어쓰기 방지)
        return clone;
      });

      latestParticipantsRef.current = nextList;
      return nextList;
    });
  };

  // ✅ [A안] onBlur에서만 1회 커밋 (Firestore + (옵션) updateParticipant)
  const onScoreBlur = (id, rawFromDom) => {
    setParticipants((prev) => {
      const nextList = prev.map((p) => {
        if (p.id !== id) return p;

        const curText =
          rawFromDom !== undefined
            ? String(rawFromDom ?? '')
            : (p?.scoreRaw !== undefined
              ? String(p.scoreRaw ?? '')
              : (p?.score != null ? String(p.score) : ''));

        const v = normalizeScoreText(curText);

        // 빈값/단독 '-' 는 저장 불가 → null로 정리
        if (v === '' || v === '-') {
          const clone = { ...p, score: null };
          if ('scoreRaw' in clone) delete clone.scoreRaw;
          return clone;
        }

        const num = Number(v);
        const clone = { ...p, score: Number.isFinite(num) ? num : null };
        if ('scoreRaw' in clone) delete clone.scoreRaw;
        return clone;
      });

      const seq = ++scoreCommitSeqRef.current;
      Promise.resolve().then(() => {
        if (seq !== scoreCommitSeqRef.current) return;

        // ✅ SSOT: 점수는 scores 서브컬렉션으로만 저장
        //    - participants[] 저장은 방배정/명단용으로만 사용
        const committedScore = nextList.find((x) => x.id === id)?.score ?? null;
        if (typeof upsertScores === 'function') {
          upsertScores([{ id, score: committedScore }]).catch((e) => {
            console.warn('[Step5] upsertScores(onBlur) failed:', e);
          });
        }
      });

      latestParticipantsRef.current = nextList;
      return nextList;
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // (D) 수동 배정(딜레이 + 스핀)
  // ─────────────────────────────────────────────────────────────────────────────
  const onManualAssign = (id) => {
    // 이미 로딩 중이면 무시
    if (loadingId != null) return;

    setLoadingId(id);

    setTimeout(() => {
      let chosen = null;
      let targetNickname = null;
      let nextList = null;

      setParticipants((ps) => {
        const target = ps.find((p) => p.id === id);
        if (!target) return ps;

        // 이미 배정돼 있으면 무시
        if (getRoomValue(target) != null) return ps;

        targetNickname = target.nickname;

        // 같은 조에서 이미 배정된 방
        const usedRooms = ps
          .filter((p) => p.group === target.group && getRoomValue(p) != null)
          .map((p) => getRoomValue(p));

        const available = rooms.filter((r) => !usedRooms.includes(r));
        chosen = available.length ? available[Math.floor(Math.random() * available.length)] : null;

        nextList = ps.map((p) => (p.id === id ? withRoomValue(p, chosen) : p));
        return nextList;
      });

      setLoadingId(null);

      if (chosen != null) {
        const displayName = (roomNames?.[chosen - 1] || `${chosen}번 방`).trim();
        alert(`${targetNickname}님은 ${displayName}에 배정되었습니다.`);
      } else {
        alert('남은 방이 없습니다.');
      }

      if (nextList) syncParticipantsToEvent(nextList);
    }, 900); // ✅ 딜레이 체감(기존 느낌 유지)
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // (E) 강제 메뉴: 바깥 터치하면 닫힘 + 버튼 아래에 묻히지 않게 Portal로 띄우기
  // ─────────────────────────────────────────────────────────────────────────────
  const [forceSelectingId, setForceSelectingId] = useState(null); // ✅ id=0 대비
  const [forceAnchorRect, setForceAnchorRect] = useState(null);
  const [forceMenuStyle, setForceMenuStyle] = useState(null);
  const forceMenuRef = useRef(null);

  const closeForceMenu = useCallback(() => {
    setForceSelectingId(null);
    setForceAnchorRect(null);
    setForceMenuStyle(null);
  }, []);

  const toggleForceMenu = (e, pid) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    if (forceSelectingId === pid) {
      closeForceMenu();
      return;
    }
    setForceSelectingId(pid);
    setForceAnchorRect({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
  };

  // 메뉴 위치 계산(아래 공간이 부족하면 위로 띄움)
  useEffect(() => {
    // ✅ id=0인 경우도 열려야 하므로 null 체크로 변경
    if (forceSelectingId == null || !forceAnchorRect) return;

    const place = () => {
      const vw = window.innerWidth || 360;
      const vh = window.innerHeight || 640;

// ✅ [PATCH] '강제' 메뉴 폭을 글자(방 이름) 길이에 맞게 자동 조정
//  - 기존 고정폭(112px) 대신, 현재 roomNames/rooms 기반으로 적정 폭 계산
const labels = [];
try {
  (rooms || []).forEach((r) => labels.push(((roomNames?.[r - 1] || `${r}번 방`).trim()) || `${r}번 방`));
} catch (e) {}
labels.push('배정취소');

const maxLen = labels.reduce((m, t) => Math.max(m, String(t || '').length), 0);
const estW = Math.round(maxLen * 8.5 + 28); // 대략(폰트 13~14px 기준): 글자폭*len + padding
const minW = 84;
const maxW = Math.min(280, (vw || 360) - 16);
const menuW = Math.max(minW, Math.min(estW, maxW));

const menuH = Math.min(320, rooms.length * 36 + 12);

      const bottomLimit = vh - (__FOOTER_H + __bottomGap + 16);

      let left = forceAnchorRect.right - menuW;
      left = Math.max(8, Math.min(left, vw - menuW - 8));

      let top = forceAnchorRect.bottom + 6;
      if (top + menuH > bottomLimit) top = forceAnchorRect.top - menuH - 6;
      top = Math.max(8, Math.min(top, bottomLimit - menuH));

      setForceMenuStyle({
        position: 'fixed',
        left,
        top,
        width: menuW,
        maxHeight: menuH,
        overflowY: 'auto',
        zIndex: 1002,
      });
    };

    const t = setTimeout(place, 0);
    window.addEventListener('resize', place);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', place);
    };
  }, [forceSelectingId, forceAnchorRect, rooms.length, __bottomGap, roomNames]); // ✅ bottomGap도 반영

  const onForceAssign = (id, room) => {
    let targetNickname = null;
    let prevRoom = null;
    let nextList = null;

    setParticipants((ps) => {
      const target = ps.find((p) => p.id === id);
      if (!target) return ps;

      targetNickname = target.nickname;
      prevRoom = getRoomValue(target);

      // 취소
      if (room == null) {
        nextList = ps.map((p) => (p.id === id ? { ...p, room: null, roomNumber: null } : p));
        return nextList;
      }

      // 같은 조가 같은 방에 들어가면 안 되므로, 이미 같은 조가 그 방에 있으면 "맞트레이드(스왑)"
      const conflict = ps.find((p) => p.id !== id && p.group === target.group && getRoomValue(p) === room);

      if (conflict) {
        nextList = ps.map((p) => {
          if (p.id === id) return { ...p, room, roomNumber: room };
          if (p.id === conflict.id) return { ...p, room: prevRoom, roomNumber: prevRoom };
          return p;
        });
      } else {
        nextList = ps.map((p) => (p.id === id ? { ...p, room, roomNumber: room } : p));
      }

      return nextList;
    });

    closeForceMenu();

    if (room != null) {
      const displayName = (roomNames?.[room - 1] || `${room}번 방`).trim();
      alert(`${targetNickname}님은 ${displayName}에 배정되었습니다.`);
    } else {
      alert(`${targetNickname}님의 방 배정이 취소되었습니다.`);
    }

    if (nextList) syncParticipantsToEvent(nextList);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // (F) 자동 배정 / 초기화
  // ─────────────────────────────────────────────────────────────────────────────
  const onAutoAssign = () => {
    let nextSnapshot = null;

    setParticipants((ps) => {
      let updated = [...ps];
      const groups = Array.from(new Set(updated.map((p) => p.group)));

      groups.forEach((group) => {
        const assigned = updated
          .filter((p) => p.group === group && getRoomValue(p) != null)
          .map((p) => getRoomValue(p));

        const unassigned = updated.filter((p) => p.group === group && getRoomValue(p) == null);

        const slots = rooms.filter((r) => !assigned.includes(r));
        const shuffled = [...slots].sort(() => Math.random() - 0.5);

        unassigned.forEach((p, idx) => {
          const r = shuffled[idx] ?? null;
          updated = updated.map((x) => (x.id === p.id ? withRoomValue(x, r) : x));
        });
      });

      nextSnapshot = updated;
      return updated;
    });

    if (nextSnapshot) syncParticipantsToEvent(nextSnapshot);
  };

  const onReset = () => {
    let nextSnapshot = null;

    // ✅ [ADD] reset 이전에 예약된 onBlur 커밋(Promise)을 무효화
    scoreCommitSeqRef.current += 1;

    // ✅ [ADD] 진행중/대기중 동기화도 같이 끊어줘야 점수 되살아남(깜빡임) 방지
    queuedSyncRef.current = null;
    syncInFlightRef.current = false;

    // ✅ reset 1번에 “점수+방배정+버튼상태” 모두 초기화
    setLoadingId(null);

    setParticipants((ps) => {
      nextSnapshot = ps.map((p) => {
        const out = { ...p, room: null, roomNumber: null, score: null };
        if ('scoreRaw' in out) out.scoreRaw = '';
        return out;
      });
      return nextSnapshot;
    });

    closeForceMenu();
    // ✅ SSOT: 점수 초기화는 scores 서브컬렉션에서 수행(1회 reset로 통일)
    if (typeof resetScores === 'function') {
      resetScores().catch((e) => console.warn('[Step5] resetScores failed:', e));
    } else if (typeof upsertScores === 'function' && Array.isArray(nextSnapshot)) {
      // fallback (컨텍스트에 resetScores가 없을 때)
      upsertScores(nextSnapshot.map((p) => ({ id: p.id, score: null }))).catch((e) =>
        console.warn('[Step5] upsertScores(reset fallback) failed:', e)
      );
    }

    if (nextSnapshot) syncParticipantsToEvent(nextSnapshot);
  };

  const onNext = async () => {
    try {
      await syncParticipantsToEvent(latestParticipantsRef.current || participants);
    } catch (e) {
      console.warn("[Step5] syncParticipantsToEvent(onNext) failed:", e);
    }
    goNext();
  };      

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.step} style={pageStyle}>
      {/* (1) 컬럼 헤더: 상단 고정 */}
      <div className={styles.participantRowHeader} style={{ flex: '0 0 auto', zIndex: 2 }}>
        <div className={`${styles.cell} ${styles.group}`}>조</div>
        <div className={`${styles.cell} ${styles.nickname}`}>닉네임</div>
        <div className={`${styles.cell} ${styles.handicap}`}>G핸디</div>
        <div className={`${styles.cell} ${styles.score}`}>점수</div>
        <div className={`${styles.cell} ${styles.manual}`}>수동</div>
        <div className={`${styles.cell} ${styles.force}`}>강제</div>
      </div>

      {/* (2) 중간 스크롤 영역 */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <div style={{ height: '100%', minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div className={styles.participantTable}>
            {participants.map((p) => {
              const isDisabled = loadingId === p.id || getRoomValue(p) != null;

              const liveScore = scoresMap?.[String(p.id)]?.score;
              const displayScore =
                p.scoreRaw !== undefined
                  ? p.scoreRaw
                  : p.score != null
                    ? p.score
                    : liveScore != null
                      ? liveScore
                      : '';

              return (
                <div key={p.id} className={styles.participantRow}>
                  <div className={`${styles.cell} ${styles.group}`}>
                    <input type="text" value={`${p.group}조`} disabled />
                  </div>
                  <div className={`${styles.cell} ${styles.nickname}`}>
                    <input type="text" value={p.nickname} disabled />
                  </div>
                  <div className={`${styles.cell} ${styles.handicap}`}>
                    <input type="text" value={p.handicap} disabled />
                  </div>

                  {/* 점수 입력 */}
                  <div
                    className={`${styles.cell} ${styles.score}`}
                    // ✅ 셀 아무 곳이나 눌러도 input 포커스(모바일에서 "수동" 버튼 오클릭 방지)
                    onClick={() => focusScoreInput(p.id)}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                  >
                    <input
                      ref={(el) => {
                        if (el) scoreInputRefs.current[p.id] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="-?[0-9]*"
                      value={displayScore}
                      onChange={(e) => onScoreChange(p.id, e.target.value)}
                      onBlur={(e) => onScoreBlur(p.id, e.target.value)}   // ✅ [A안] 입력 완료 시점에만 1회 저장
                      onPointerDown={(e) => {
                        // ✅ iOS/모바일에서 탭 시 포커스가 안정적으로 잡히도록 보강
                        e.stopPropagation();
                        try { e.currentTarget.focus(); } catch {}
                        startScoreLongMinus(p.id);
                      }}
                      onPointerUp={() => cancelScoreLongPress(p.id)}
                      onPointerCancel={() => cancelScoreLongPress(p.id)}
                      onPointerLeave={() => cancelScoreLongPress(p.id)}
                      onTouchEnd={() => cancelScoreLongPress(p.id)}
                    />
                  </div>

                  {/* 수동 버튼 */}
                  <div className={`${styles.cell} ${styles.manual}`}>
                    <button
                      className={styles.smallBtn}
                      disabled={isDisabled}
                      onClick={() => onManualAssign(p.id)}
                    >
                      {loadingId === p.id ? <span className={styles.spinner} /> : '수동'}
                    </button>
                  </div>

                  {/* 강제 버튼 */}
                  <div className={`${styles.cell} ${styles.force}`}>
                    <button className={styles.smallBtn} onClick={(e) => toggleForceMenu(e, p.id)}>
                      강제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* (3) 강제 메뉴 Portal + 바깥 터치 닫힘 */}
      {(forceSelectingId != null) && forceAnchorRect
        ? createPortal(
            <>
              <div
                onClick={closeForceMenu}
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'transparent',
                  zIndex: 1001,
                }}
              />
              <div
                ref={forceMenuRef}
                className={styles.forceMenu}
                style={forceMenuStyle || { position: 'fixed', left: 8, top: 8, zIndex: 1002 }}
                onClick={(e) => e.stopPropagation()}
              >
                {rooms.map((r) => {
                  const name = (roomNames?.[r - 1] || `${r}번 방`).trim();
                  return (
                    <div
                      key={r}
                      className={styles.forceOption}
                      onClick={() => onForceAssign(forceSelectingId, r)}
                    >
                      {name}
                    </div>
                  );
                })}
                <div className={styles.forceOption} onClick={() => onForceAssign(forceSelectingId, null)}>
                  배정취소
                </div>
              </div>
            </>,
            document.body
          )
        : null}

      {/* (4) 하단 내비게이션: Step4와 동일한 방식으로 fixed */}
      <div
        className={styles.stepFooter}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: __safeBottom,
          zIndex: 5,
          boxSizing: 'border-box',
          padding: '12px 16px',
        }}
      >
        <button onClick={goPrev}>← 이전</button>
        <button onClick={onAutoAssign} className={styles.textOnly}>
          자동배정
        </button>
        <button onClick={onReset} className={styles.textOnly}>
          초기화
        </button>
        <button onClick={onNext}>다음</button>
      </div>
    </div>
  );
}
