// src/screens/Step7.jsx

import React, { useState, useContext, useRef, useEffect } from 'react';
import styles from './Step7.module.css';
import { StepContext } from '../flows/StepFlow';
import { EventContext } from '../contexts/EventContext';
import { serverTimestamp, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const LONG_PRESS_MS = 600;
const MAX_ROOM_CAPACITY = 4;

// 점수 입력 시 부분 숫자(-, 빈문자 등) 허용하는 헬퍼 (기존 그대로)
function isPartialNumber(str) {
  if (str === '') return true;
  if (str === '-' || str === '.' || str === '-.') return true;
  return /^-?\d+(\.\d*)?$/.test(str);
}

export default function Step7() {
  const {
    participants = [],
    roomNames = [],
    onScoreChange,
    onManualAssign,
    onCancel,
    onAutoAssign,
    onReset,
    goPrev,
    goNext,
    // ✅ 기존 StepFlow에서 이미 제공 중인 값들 (트레이드용 최소 추가)
    setParticipants,
    updateParticipant,
    updateParticipantsBulk,
  } = useContext(StepContext);

  const {
    eventId,
    updateEventImmediate,
    upsertScores,
    persistRoomsFromParticipants,
  } = useContext(EventContext) || {};

  // ✅ 자동 브리지(useEffect) ON/OFF 플래그 (기본 OFF)
  // - StepFlow(save)가 이미 participants를 저장하므로, Step7에서 추가로 events/rooms/scores를 때리면
  //   스냅샷 루프/쓰기 폭주가 발생할 수 있어 기본 OFF로 둡니다.
  const AUTO_BRIDGE_USEEFFECT = false;

  // 로딩 상태(수동 버튼용)
  const [loadingId, setLoadingId] = useState(null);

  // 점수 입력용 draft 상태(id → 문자열)
  const [scoreDraft, setScoreDraft] = useState({});

  // [ADD] scores 서브컬렉션 실시간 구독 → { [pid]: score }
  //   - SSOT(점수 단일 출처): participants.score에 의존하지 않고 scores/{pid}.score를 화면에 반영
  const [scoresMap, setScoresMap] = useState({});
  useEffect(() => {
    if (!eventId) return;
    const colRef = collection(db, 'events', eventId, 'scores');
    const unsub = onSnapshot(colRef, (snap) => {
      const m = {};
      snap.forEach((d) => {
        const data = d.data() || {};
        m[String(d.id)] = data.score == null ? null : data.score;
      });
      setScoresMap(m);
    });
    return unsub;
  }, [eventId]);

  const getDisplayScore = (pid, fallbackScore) => {
    if (Object.prototype.hasOwnProperty.call(scoreDraft || {}, pid)) {
      const v = scoreDraft?.[pid];
      return v == null ? '' : String(v);
    }
    const ss = scoresMap?.[pid];
    if (ss !== undefined) return ss == null ? '' : String(ss);
    return fallbackScore == null ? '' : String(fallbackScore);
  };
  const pressTimersRef = useRef({}); // 점수 입력 롱프레스용

  // ✅ “완료 버튼” 롱프레스용 타이머 & 플래그
  const manualPressTimersRef = useRef({});
  const manualLongPressFlagRef = useRef(false);

  // 하단 탭바/네비 영역 높이 계산 (모바일에서 버튼 가리지 않도록)
  const [bottomGap, setBottomGap] = useState(64);
  useEffect(() => {
    const measure = () => {
      try {
        const el =
          document.querySelector('[data-bottom-nav]') ||
          document.querySelector('#bottomTabBar') ||
          document.querySelector('.bottomTabBar') ||
          document.querySelector('.BottomTabBar');
        setBottomGap(el && el.offsetHeight ? el.offsetHeight : 64);
      } catch {
        // ignore
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const FOOTER_H = 56;
  const safeBottom = `calc(env(safe-area-inset-bottom, 0px) + ${bottomGap}px)`;
  const pageStyle = {
    minHeight: '100dvh',
    boxSizing: 'border-box',
    paddingBottom: `calc(${FOOTER_H}px + ${safeBottom})`,
    WebkitOverflowScrolling: 'touch',
    touchAction: 'pan-y',
  };

  // 1조/2조 판별 (group 필드 우선, 없으면 id로 fallback)
  const isGroup1 = (p) =>
    Number.isFinite(Number(p?.group))
      ? Number(p.group) % 2 === 1
      : p.id % 2 === 1;

  // 완료 여부: 방 + 파트너 둘 다 할당되어 있으면 완료로 간주
  const isCompleted = (id) => {
    const me = participants.find((p) => p.id === id);
    return !!(me && me.room != null && me.partner != null);
  };

  const findParticipant = (id) =>
    participants.find((p) => String(p.id) === String(id));

  // ✅ 방/팀 관련 헬퍼들 (트레이드용 최소 추가)
  const getRoomMembers = (roomNo) =>
    participants.filter((p) => Number(p?.room) === Number(roomNo));

  const getGroup1InRoom = (roomNo) =>
    getRoomMembers(roomNo).filter((p) => isGroup1(p));

  const getTeamsInRoom = (roomNo) => {
    const g1s = getGroup1InRoom(roomNo);
    return g1s
      .map((g1) => {
        const g2 = g1.partner ? findParticipant(g1.partner) : null;
        return g2 ? { g1, g2 } : null;
      })
      .filter(Boolean);
  };

  // ✅ participants 변경을 한 번에 반영하는 공용 함수
  const applyBulkChanges = async (changes) => {
    if (!Array.isArray(changes) || !changes.length) return;

    // 1순위: StepFlow에서 제공하는 updateParticipantsBulk 사용
    if (typeof updateParticipantsBulk === 'function') {
      await updateParticipantsBulk(changes);
      return;
    }

    // 2순위: 개별 업데이트
    if (typeof updateParticipant === 'function') {
      for (const ch of changes) {
        await updateParticipant(ch.id, ch.fields);
      }
      return;
    }

    // 3순위(최후): setParticipants 로컬만 수정 (Firestore 반영은 브리지 useEffect가 처리)
    if (typeof setParticipants === 'function') {
      setParticipants((prev) =>
        prev.map((p) => {
          const c = changes.find((ch) => String(ch.id) === String(p.id));
          return c ? { ...p, ...(c.fields || {}) } : p;
        })
      );
    }
  };

  // ✅ 팀(1조+2조) 이동/맞트레이드
  const moveTeamOrTradePair = async (id, targetRoom) => {
    const me1 = findParticipant(id);
    if (!me1) {
      alert('대상을 찾을 수 없습니다.');
      return;
    }
    if (!isGroup1(me1)) {
      alert('팀(1조+2조) 이동은 1조만 가능합니다.');
      return;
    }
    const me2 = me1.partner ? findParticipant(me1.partner) : null;
    if (!me2) {
      alert('해당 1조에 연결된 2조 팀원이 없습니다.');
      return;
    }

    const srcRoom = Number(me1.room);
    const dstRoom = Number(targetRoom);

    if (!Number.isFinite(dstRoom)) {
      alert('올바른 방 번호가 아닙니다.');
      return;
    }
    if (!Number.isFinite(srcRoom)) {
      alert('현재 방 정보가 없습니다.');
      return;
    }
    if (srcRoom === dstRoom) {
      alert('같은 방으로는 이동할 수 없습니다.');
      return;
    }

    const dstMembers = getRoomMembers(dstRoom);
    const dstCount = dstMembers.length;

    // 0팀/1팀(<= 2명) → 그냥 팀 이동
    if (dstCount <= MAX_ROOM_CAPACITY - 2) {
      await applyBulkChanges([
        { id: me1.id, fields: { room: dstRoom } },
        { id: me2.id, fields: { room: dstRoom } },
      ]);
      alert(
        `팀 이동 완료:\n${me1.nickname} / ${me2.nickname} → ${dstRoom}번 방`
      );
      return;
    }

    // 정원 4명이 아니면(중간 애매한 상태) 방 구성이 이상하다고 안내
    if (dstCount !== MAX_ROOM_CAPACITY) {
      alert('해당 방의 인원 구성이 2팀(4명) 기준이 아닙니다.');
      return;
    }

    // 2팀(4명) 꽉 찬 경우 → 팀 vs 팀 맞트레이드
    const dstTeams = getTeamsInRoom(dstRoom);
    if (!dstTeams.length) {
      alert('해당 방의 팀 구성을 찾을 수 없습니다.');
      return;
    }

    let pick = dstTeams[0];
    if (dstTeams.length > 1) {
      const msg = dstTeams
        .map(
          (t, idx) =>
            `${idx + 1}. ${t.g1.nickname} / ${t.g2.nickname}`
        )
        .join('\n');
      const sel = window.prompt(
        `맞트레이드할 팀을 선택하세요:\n${msg}`,
        '1'
      );
      const n = Number(sel);
      if (!Number.isFinite(n) || n < 1 || n > dstTeams.length) return;
      pick = dstTeams[n - 1];
    }

    const b1 = pick.g1;
    const b2 = pick.g2;

    await applyBulkChanges([
      { id: me1.id, fields: { room: dstRoom } },
      { id: me2.id, fields: { room: dstRoom } },
      { id: b1.id, fields: { room: srcRoom } },
      { id: b2.id, fields: { room: srcRoom } },
    ]);

    alert(
      `팀 맞트레이드 완료:\n${me1.nickname} / ${me2.nickname} ↔ ${b1.nickname} / ${b2.nickname}`
    );
  };

  // ✅ 팀원(1조만) 맞트레이드 (2조는 각 방에 그대로 있고 파트너만 교체)
  const tradeGroup1Only = async (id, targetRoom) => {
    const me1 = findParticipant(id);
    if (!me1) {
      alert('대상을 찾을 수 없습니다.');
      return;
    }
    if (!isGroup1(me1)) {
      alert('팀원(1조) 이동은 1조만 가능합니다.');
      return;
    }
    const me2 = me1.partner ? findParticipant(me1.partner) : null;
    if (!me2) {
      alert('해당 1조에 연결된 2조 팀원이 없습니다.');
      return;
    }

    const srcRoom = Number(me1.room);
    const dstRoom = Number(targetRoom);

    if (!Number.isFinite(dstRoom)) {
      alert('올바른 방 번호가 아닙니다.');
      return;
    }
    if (!Number.isFinite(srcRoom)) {
      alert('현재 방 정보가 없습니다.');
      return;
    }
    if (srcRoom === dstRoom) {
      alert('같은 방으로는 이동할 수 없습니다.');
      return;
    }

    const dstMembers = getRoomMembers(dstRoom);
    const dstGroup1s = dstMembers.filter((p) => isGroup1(p));

    if (!dstGroup1s.length) {
      alert(
        '선택한 방에 교체할 1조가 없습니다.\n팀원(1조) 이동은 항상 맞트레이드(교체)로만 가능합니다.'
      );
      return;
    }

    let dest1 = dstGroup1s[0];
    if (dstGroup1s.length > 1) {
      const msg = dstGroup1s
        .map((x, idx) => `${idx + 1}. ${x.nickname}`)
        .join('\n');
      const sel = window.prompt(
        `맞트레이드할 1조를 선택하세요:\n${msg}`,
        '1'
      );
      const n = Number(sel);
      if (!Number.isFinite(n) || n < 1 || n > dstGroup1s.length) return;
      dest1 = dstGroup1s[n - 1];
    }

    const dest2 = dest1.partner ? findParticipant(dest1.partner) : null;
    if (!dest2) {
      alert('대상 팀의 2조 정보를 찾을 수 없습니다.');
      return;
    }

    // 1조만 서로 방을 바꾸고, 2조는 그대로 방에 남아 있으면서 새로운 파트너와 팀 구성
    const changes = [
      { id: me1.id, fields: { room: dstRoom, partner: dest2.id } },
      { id: dest1.id, fields: { room: srcRoom, partner: me2.id } },
      { id: me2.id, fields: { partner: dest1.id } },
      { id: dest2.id, fields: { partner: me1.id } },
    ];

    await applyBulkChanges(changes);

    alert(
      `팀원(1조) 맞트레이드 완료:\n${me1.nickname} ↔ ${dest1.nickname}`
    );
  };

  // ✅ “완료 버튼” 롱프레스 시 동작
  const handleManualLongPress = async (id) => {
    const me = findParticipant(id);
    if (!me || !isGroup1(me) || !isCompleted(id)) {
      // 아직 완료되지 않은 상태에서는 롱프레스 기능 사용 안 함
      return;
    }

    const roomCount = Array.isArray(roomNames) ? roomNames.length : 0;
    if (roomCount === 0) {
      alert('방 정보가 없습니다.\n먼저 STEP2에서 방을 생성해 주세요.');
      return;
    }

    // 1) 이동 방식 선택
    const mode = window.prompt(
      '이동 방식을 선택하세요.\n1. 팀(1조+2조) 이동 / 맞트레이드\n2. 팀원(1조)만 맞트레이드',
      '1'
    );
    if (mode == null) return;
    const trimmed = String(mode).trim();
    if (trimmed !== '1' && trimmed !== '2') return;

    // 2) Admin STEP2 에서 만든 방 기준으로 방 번호 선택
    const roomLines = roomNames
      .map((name, idx) => {
        const no = idx + 1;
        const label =
          name && String(name).trim()
            ? String(name).trim()
            : `${no}번 방`;
        return `${no}. ${label}`;
      })
      .join('\n');

    const input = window.prompt(
      `이동할 방 번호를 입력하세요.\n(운영자가 STEP2에서 만든 방 순서 기준)\n\n${roomLines}`,
      ''
    );
    if (input == null) return;
    const roomNo = Number(input);
    if (
      !Number.isFinite(roomNo) ||
      roomNo < 1 ||
      roomNo > roomCount
    ) {
      alert('올바른 방 번호를 입력해 주세요.');
      return;
    }

    manualLongPressFlagRef.current = true; // 이 클릭은 롱프레스에서 처리했으니 일반 클릭 막기

    if (trimmed === '1') {
      await moveTeamOrTradePair(id, roomNo);
    } else {
      await tradeGroup1Only(id, roomNo);
    }
  };

  // 점수 입력용 롱프레스(기존: 음수 전환)
  const startLongPress = (id) => {
    try {
      const timers = pressTimersRef.current || {};
      if (timers[id]) clearTimeout(timers[id]);
      timers[id] = setTimeout(() => {
        setScoreDraft((draft) => {
          const current =
            Object.prototype.hasOwnProperty.call(draft, id)
              ? (draft[id] == null ? '' : String(draft[id]))
              : (() => {
                  const ss = scoresMap?.[id];
                  if (ss !== undefined) return ss == null ? '' : String(ss);
                  const p = findParticipant(id);
                  if (!p || p.score == null) return '';
                  return String(p.score);
                })();

          // 이미 음수면 그대로
          if (String(current).startsWith('-')) return draft;

          const next =
            current === ''
              ? '-'
              : `-${String(current).replace(/^-/, '')}`;
          return { ...draft, [id]: next };
        });
      }, LONG_PRESS_MS);
      pressTimersRef.current = timers;
    } catch {
      // ignore
    }
  };

  const cancelLongPress = (id) => {
    try {
      const timers = pressTimersRef.current || {};
      if (timers[id]) clearTimeout(timers[id]);
      timers[id] = null;
      pressTimersRef.current = timers;
    } catch {
      // ignore
    }
  };

  // ✅ 수동 버튼 롱프레스용 (팀/팀원 이동 선택)
  const startManualLongPress = (id) => {
    try {
      const timers = manualPressTimersRef.current || {};
      if (timers[id]) clearTimeout(timers[id]);
      timers[id] = setTimeout(() => {
        handleManualLongPress(id);
      }, LONG_PRESS_MS);
      manualPressTimersRef.current = timers;
    } catch {
      // ignore
    }
  };

  const cancelManualLongPress = (id) => {
    try {
      const timers = manualPressTimersRef.current || {};
      if (timers[id]) clearTimeout(timers[id]);
      timers[id] = null;
      manualPressTimersRef.current = timers;
    } catch {
      // ignore
    }
  };

  // 점수 입력 변경
  const handleScoreInputChange = (id, raw) => {
    if (!isPartialNumber(raw)) return;
    setScoreDraft((draft) => ({ ...draft, [id]: raw }));
  };

  // 점수 입력 종료(blur 시 실제 숫자 반영)
  const handleScoreBlur = async (id) => {
    const raw = scoreDraft[id];
    if (raw === undefined) return;

    let value = null;
    if (!(raw === '' || raw === '-' || raw === '.' || raw === '-.')) {
      const num = Number(raw);
      value = Number.isNaN(num) ? null : num;
    }

    // StepContext에 점수 반영 (원본 로직 그대로 사용)
    if (typeof onScoreChange === 'function') {
      await onScoreChange(id, value);
    }

    // draft 제거
    setScoreDraft((draft) => {
      const { [id]: _omit, ...rest } = draft;
      return rest;
    });
  };

  // 방 이름 레이블
  const getRoomLabel = (roomNo) => {
    if (!roomNo) return '';
    const idx = Number(roomNo) - 1;
    if (idx >= 0 && idx < roomNames.length) {
      const nm = roomNames[idx];
      if (nm && typeof nm === 'string' && nm.trim()) return nm.trim();
    }
    return `${roomNo}번 방`;
  };

  // 수동 배정 버튼 클릭 (기존 로직 유지)
  const handleManualClick = async (id) => {
    if (!onManualAssign) return;
    if (isCompleted(id)) return;

    const me = findParticipant(id);
    const nickname = me?.nickname || '';

    setLoadingId(id);
    try {
      // 기존 로직 존중: onManualAssign에서 방/파트너를 모두 결정
      const res = await onManualAssign(id);
      const roomNo =
        res?.roomNo ?? res?.roomNumber ?? findParticipant(id)?.room ?? null;
      const partnerNickname =
        res?.partnerNickname ??
        (() => {
          const p = findParticipant(id);
          if (!p?.partner) return null;
          const teammate = findParticipant(p.partner);
          return teammate?.nickname ?? null;
        })();

      const roomLabel = roomNo ? getRoomLabel(roomNo) : '';

      if (roomNo) {
        // 1차 알림: 방 배정
        alert(
          `${nickname}님은 ${roomLabel}에 배정되었습니다.\n` +
            `팀원을 선택하려면 확인을 눌러주세요.`
        );

        // 2차 알림: 팀원 정보
        if (partnerNickname) {
          setTimeout(() => {
            alert(`${nickname}님은 ${partnerNickname}님을 선택했습니다.`);
          }, 700);
        }
      } else {
        alert(`${nickname}님 수동 배정이 완료되었습니다.`);
      }
    } finally {
      setLoadingId(null);
    }
  };

  // ✅ 수동 버튼 클릭 시: 롱프레스에서 이미 처리한 경우는 클릭 무시
  const handleManualButtonClick = (id) => {
    if (manualLongPressFlagRef.current) {
      // 롱프레스에서 이미 처리했으므로 일반 클릭은 소모만 하고 끝
      manualLongPressFlagRef.current = false;
      return;
    }
    handleManualClick(id);
  };

  // 취소 버튼 클릭
  const handleCancelClick = (id) => {
    if (!onCancel) return;
    const me = findParticipant(id);
    onCancel(id);
    if (me) {
      alert(`${me.nickname}님과 팀원이 해제되었습니다.`);
    }
  };

  // 자동 배정
  const handleAutoClick = () => {
    if (!onAutoAssign) return;
    onAutoAssign();
  };

  // 초기화
  const handleResetClick = () => {
    if (!onReset) return;
    setScoreDraft({});
    onReset();
  };

  // ─────────────────────────────
  //  참가자 변경 → Firestore 동기화 브리지
  //  (Admin STEP7 → EventContext → Player/STEP6/STEP8)
  // ─────────────────────────────
  const lastCommittedHashRef = useRef('');

  useEffect(() => {
    if (!AUTO_BRIDGE_USEEFFECT) return; // ✅ OFF(기본) : StepFlow(save)만 사용
    if (!eventId || !updateEventImmediate) return;
    if (!Array.isArray(participants) || participants.length === 0) {
      lastCommittedHashRef.current = '';
      return;
    }

    // hash: id, room, partner, score 만을 기준으로 변경 감지
    let hash;
    try {
      const core = participants.map((p) => ({
        id: p.id,
        room: p.room ?? null,
        partner: p.partner ?? null,
        score: p.score ?? null,
      }));
      hash = JSON.stringify(core);
    } catch {
      hash = String(Date.now());
    }
    if (hash === lastCommittedHashRef.current) return;
    lastCommittedHashRef.current = hash;

    // Firestore로 내보낼 participants 호환 형태
    const compat = participants.map((p) => ({
      ...p,
      roomNumber: p.room ?? null,
      teammateId: p.partner ?? null,
      teammate: p.partner ?? null,
    }));

    // roomTable 구성 (방 번호 → 참가자 id 배열)
    const roomTable = {};
    participants.forEach((p) => {
      const r = p.room;
      if (r == null) return;
      if (!roomTable[r]) roomTable[r] = [];
      roomTable[r].push(p.id);
    });

    (async () => {
      try {
        const docUpdate = {
          participants: compat,
          participantsUpdatedAt: serverTimestamp(),
        };
        if (Object.keys(roomTable).length > 0) {
          docUpdate.roomTable = roomTable;
        }

        // 1) events/{eventId} 참가자/roomTable 갱신
        await updateEventImmediate(docUpdate);

        // 2) rooms/{roomId} 컬렉션 갱신 (Admin STEP6/STEP8, Player 에서 사용)
        if (typeof persistRoomsFromParticipants === 'function') {
          await persistRoomsFromParticipants(participants);
        }

        // 3) scores 서브컬렉션 갱신 (Admin/Player 점수 실시간 공유)
        if (typeof upsertScores === 'function') {
          const payload = participants.map((p) => ({
            id: p.id,
            score: p.score ?? null,
            room: p.room ?? null,
          }));
          await upsertScores(payload);
        }
      } catch (e) {
        console.warn('[Step7] sync to Firestore failed:', e);
      }
    })();
  }, [participants, eventId, updateEventImmediate, upsertScores, persistRoomsFromParticipants]);

  // ─────────────────────────────
  //  렌더링
  // ─────────────────────────────
  return (
    <div className={styles.step} style={pageStyle}>
      {/* 헤더 */}
      <div className={styles.participantRowHeader}>
        <div className={`${styles.cell} ${styles.group}`}>조</div>
        <div className={`${styles.cell} ${styles.nickname}`}>닉네임</div>
        <div className={`${styles.cell} ${styles.handicap}`}>G핸디</div>
        <div className={`${styles.cell} ${styles.score}`}>점수</div>
        <div className={`${styles.cell} ${styles.manual}`}>수동</div>
        <div className={`${styles.cell} ${styles.force}`}>취소</div>
      </div>

      {/* 리스트 본문 */}
      <div className={styles.participantTable}>
        {participants.map((p) => {
          const group1 = isGroup1(p);
          const done = group1 && isCompleted(p.id);

          const scoreValue = getDisplayScore(p.id, p.score);

          return (
            <div key={p.id} className={styles.participantRow}>
              {/* 조 */}
              <div className={`${styles.cell} ${styles.group}`}>
                <input
                  type="text"
                  value={group1 ? '1조' : '2조'}
                  disabled
                />
              </div>

              {/* 닉네임 */}
              <div className={`${styles.cell} ${styles.nickname}`}>
                <input type="text" value={p.nickname} disabled />
              </div>

              {/* G핸디 */}
              <div className={`${styles.cell} ${styles.handicap}`}>
                <input type="text" value={p.handicap} disabled />
              </div>

              {/* 점수 입력 */}
              <div className={`${styles.cell} ${styles.score}`}>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={scoreValue}
                  onChange={(e) =>
                    handleScoreInputChange(p.id, e.target.value)
                  }
                  onBlur={() => handleScoreBlur(p.id)}
            onTouchStart={() => startLongPress(p.id)}
            onTouchCancel={cancelLongPress}
                  onPointerDown={() => startLongPress(p.id)}
                  onPointerUp={() => cancelLongPress(p.id)}
                  onPointerLeave={() => cancelLongPress(p.id)}
                  onTouchEnd={() => cancelLongPress(p.id)}
                />
              </div>

              {/* 수동 배정 (1조만 표시) */}
              <div className={`${styles.cell} ${styles.manual}`}>
                {group1 ? (
                  <button
                    className={styles.smallBtn}
                    onClick={() => handleManualButtonClick(p.id)}
                    onPointerDown={() => startManualLongPress(p.id)}
                    onPointerUp={() => cancelManualLongPress(p.id)}
                    onPointerLeave={() => cancelManualLongPress(p.id)}
                    onTouchEnd={() => cancelManualLongPress(p.id)}
                    disabled={loadingId === p.id} // ✅ 완료 상태여도 롱프레스는 가능해야 하므로 done으로 disable 하지 않음
                    style={{
                      opacity:
                        done || loadingId === p.id ? 0.5 : 1,
                      cursor:
                        loadingId === p.id
                          ? 'not-allowed'
                          : 'pointer',
                    }}
                  >
                    {loadingId === p.id ? (
                      <span className={styles.spinner} />
                    ) : done ? (
                      '완료'
                    ) : (
                      '수동'
                    )}
                  </button>
                ) : (
                  <div style={{ width: 28, height: 28 }} />
                )}
              </div>

              {/* 취소 (1조만 표시) */}
              <div className={`${styles.cell} ${styles.force}`}>
                {group1 ? (
                  <button
                    className={styles.smallBtn}
                    onClick={() => handleCancelClick(p.id)}
                  >
                    취소
                  </button>
                ) : (
                  <div style={{ width: 28, height: 28 }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단 네비게이션(고정) */}
      <div
        className={styles.stepFooter}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: safeBottom,
          zIndex: 20,
          boxSizing: 'border-box',
          padding: '12px 16px',
          background: '#fff',
          borderTop: '1px solid #e5e5e5',
        }}
      >
        <button onClick={goPrev}>← 이전</button>
        <button onClick={handleAutoClick} className={styles.textOnly}>
          자동배정
        </button>
        <button onClick={handleResetClick} className={styles.textOnly}>
          초기화
        </button>
        <button onClick={goNext}>다음 →</button>
      </div>
    </div>
  );
}
