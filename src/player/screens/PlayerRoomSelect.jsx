// /src/player/screens/PlayerRoomSelect.jsx

import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PlayerContext } from '../../contexts/PlayerContext';
import { EventContext } from '../../contexts/EventContext';
import styles from './PlayerRoomSelect.module.css';

import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { signInAnonymously, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { writePlayerRoom } from '../utils/playerState';
import useEffectivePlayerEventData from '../hooks/useEffectivePlayerEventData';


function getPlayerTabId(){
  try {
    if (!window.name || !window.name.startsWith('AGM_PLAYER_TAB_')) {
      window.name = `AGM_PLAYER_TAB_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    }
    return window.name;
  } catch {
    return 'AGM_PLAYER_TAB_FALLBACK';
  }
}
function playerStorageKey(eventId, key){
  return `agm:player:${getPlayerTabId()}:${eventId || 'noevent'}:${key}`;
}

const TIMINGS = {
  spinBeforeAssign: 1000,
  preAlertStroke: 300,
  preAlertFourball: 300,
  spinDuringPartnerPick: 1800,
};

const roomCapacityAt = (roomCapacities, roomNo) => {
  const idx = Number(roomNo) - 1;
  const raw = Number(Array.isArray(roomCapacities) ? roomCapacities[idx] : 4);
  const safe = Number.isFinite(raw) ? raw : 4;
  return Math.min(4, Math.max(1, safe));
};

async function ensureAuthReady() {
  try {
    if (!auth?.currentUser) {
      await setPersistence(auth, browserSessionPersistence).catch(() => {});
      const cred = await signInAnonymously(auth);
      await cred.user.getIdToken(true);
    } else {
      await auth.currentUser.getIdToken(true);
    }
  } catch (e) {
    console.warn('[PlayerRoomSelect] ensureAuthReady', e);
  }
}

// ✅ Firestore 규칙 허용 필드만 기록( room, authCode, joinedAt )
async function ensureMembership(eventId, myRoom) {
  try {
    await ensureAuthReady();
    const uid = auth?.currentUser?.uid || null;
    if (!uid || !eventId) return;

    const payload = { joinedAt: serverTimestamp() };
    if (Number.isFinite(Number(myRoom))) payload.room = Number(myRoom);

    try {
      const code =
        sessionStorage.getItem(`authcode_${eventId}`) ||
        sessionStorage.getItem('pending_code') ||
        '';
      if (code) payload.authCode = String(code);
    } catch {}

    await setDoc(doc(db, 'events', eventId, 'memberships', uid), payload, { merge: true });
  } catch (e) {
    console.warn('[PlayerRoomSelect] ensureMembership failed', e);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeGate(g) {
  const steps = (g && g.steps) || {};
  const norm = { steps: {}, step1: { ...(g?.step1 || {}) } };
  for (let i = 1; i <= 8; i += 1) norm.steps[i] = steps[i] || 'enabled';
  if (typeof norm.step1.teamConfirmEnabled !== 'boolean') norm.step1.teamConfirmEnabled = true;
  return norm;
}

export default function PlayerRoomSelect() {
  const { mode } = useContext(PlayerContext);
  const isFourball = mode === 'fourball' || mode === 'agm';
  return isFourball ? <FourballLikeSelect /> : <StrokeLikeSelect />;
}

function StrokeLikeSelect() {
  const { roomNames, roomCapacities, participants, participant, assignStrokeForOne } = useContext(PlayerContext);
  return (
    <BaseRoomSelect
      variant="stroke"
      roomNames={roomNames}
      roomCapacities={roomCapacities}
      participants={participants}
      participant={participant}
      onAssign={async (myId) => {
        const { roomNumber } = await assignStrokeForOne(myId);
        return { roomNumber };
      }}
    />
  );
}

function FourballLikeSelect() {
  const { roomNames, roomCapacities, participants, participant, assignFourballForOneAndPartner } =
    useContext(PlayerContext);
  return (
    <BaseRoomSelect
      variant="fourball"
      roomNames={roomNames}
      roomCapacities={roomCapacities}
      participants={participants}
      participant={participant}
      onAssign={async (myId) => {
        const { roomNumber, partnerNickname } = await assignFourballForOneAndPartner(myId);
        return { roomNumber, partnerNickname };
      }}
    />
  );
}

function BaseRoomSelect({ variant, roomNames, roomCapacities, participants, participant, onAssign }) {
  const navigate = useNavigate();
  const { eventId: playerEventId, setEventId, isEventClosed } = useContext(PlayerContext);
  const { eventId: ctxEventId, eventData, loadEvent } = useContext(EventContext);
  const effectiveEventData = useEffectivePlayerEventData();
  const { eventId: urlEventId } = useParams();

  const effectiveRoomNames = useMemo(() => (
    Array.isArray(effectiveEventData?.roomNames) && effectiveEventData.roomNames.length
      ? effectiveEventData.roomNames
      : roomNames
  ), [effectiveEventData?.roomNames, roomNames]);

  const effectiveRoomCapacities = useMemo(() => (
    Array.isArray(effectiveEventData?.roomCapacities) && effectiveEventData.roomCapacities.length
      ? effectiveEventData.roomCapacities
      : roomCapacities
  ), [effectiveEventData?.roomCapacities, roomCapacities]);

  // ✅ SSOT: STEP1 화면에서 보여줄 participants/participant는 EventContext(eventData)의 참가자 배열을 우선 사용
  // - iOS(운영자모드>참가자탭)에서 PlayerContext 참가자 state가 늦게/초기화되어 보이는 문제 방지
  const effectiveParticipants = useMemo(() => {
    const safeArr = (v) => (Array.isArray(v) ? v : []);
    const sourceEventData = effectiveEventData || eventData;
    const modeFromEvent = (sourceEventData?.mode === 'fourball' || sourceEventData?.mode === 'agm') ? 'fourball' : 'stroke';
    const md = (variant === 'fourball' || variant === 'stroke') ? variant : modeFromEvent;
    const field = (md === 'fourball') ? 'participantsFourball' : 'participantsStroke';

    const primary = safeArr(sourceEventData?.[field]);
    const legacy  = safeArr(sourceEventData?.participants);

    // 모드별 필드가 있으면 legacy와 id 기준으로 병합(호환)
    const mergedRaw = primary.length
      ? (() => {
          const map = new Map();
          legacy.forEach((p, i) => {
            const obj = (p && typeof p === 'object') ? p : {};
            const id = String(obj?.id ?? i);
            map.set(id, obj);
          });
          primary.forEach((p, i) => {
            const obj = (p && typeof p === 'object') ? p : {};
            const id = String(obj?.id ?? i);
            map.set(id, { ...(map.get(id) || {}), ...obj });
          });
          return Array.from(map.values());
        })()
      : legacy;

    const normalized = mergedRaw.map((p, i) => {
      const obj = (p && typeof p === 'object') ? p : {};
      const id = (obj?.id ?? i);
      const room = (obj?.room ?? obj?.roomNumber ?? null);
      return { ...obj, id, room, roomNumber: room };
    });

    return normalized.length ? normalized : safeArr(participants);
  }, [
    variant,
    participants,
    effectiveEventData?.mode,
    effectiveEventData?.participants,
    effectiveEventData?.participantsStroke,
    effectiveEventData?.participantsFourball,
    eventData?.mode,
    eventData?.participants,
    eventData?.participantsStroke,
    eventData?.participantsFourball,
  ]);

  const effectiveParticipant = useMemo(() => {
    if (!participant) return null;

    const pid = participant?.id;
    if (pid != null) {
      const found = effectiveParticipants.find((p) => String(p?.id) === String(pid));
      if (found) return { ...participant, ...found };
    }

    const code = participant?.authCode;
    if (code) {
      const foundByCode = effectiveParticipants.find((p) => String(p?.authCode) === String(code));
      if (foundByCode) return { ...participant, ...foundByCode };
    }

    return participant;
  }, [participant, effectiveParticipants]);

  const viewParticipant = effectiveParticipant || participant;

  // ✅ URL의 eventId가 PlayerContext의 eventId보다 우선 (이전 대회 localStorage 잔상/오배정 방지)
  useEffect(() => {
    if (!urlEventId) return;
    if (urlEventId === playerEventId) return;
    try {
      setEventId?.(urlEventId);
      // ⚠️ Admin(EventContext)의 eventId(localStorage 'eventId')를 덮어쓰지 않도록 분리
      localStorage.setItem('player.eventId', urlEventId);
    } catch (_) {}
  }, [urlEventId, playerEventId, setEventId]);

  useEffect(() => {
    const eid = urlEventId || playerEventId;
    if (eid && ctxEventId !== eid && typeof loadEvent === 'function') {
      loadEvent(eid);
    }
  }, [urlEventId, playerEventId, ctxEventId, loadEvent]);

  const [fallbackGate, setFallbackGate] = useState(null);
  useEffect(() => {
    const id = urlEventId || ctxEventId || playerEventId;
    if (!id) return;
    const sourceEventData = effectiveEventData || eventData;
    if (sourceEventData?.playerGate) { setFallbackGate(null); return; }
    const ref = doc(db, 'events', id);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      if (d?.playerGate) setFallbackGate(normalizeGate(d.playerGate));
      else setFallbackGate(null);
    });
    return unsub;
  }, [urlEventId, ctxEventId, playerEventId, effectiveEventData?.playerGate, eventData?.playerGate]);

  const sourceEventDataForGate = effectiveEventData || eventData;
  const gate = sourceEventDataForGate?.playerGate ? normalizeGate(sourceEventDataForGate.playerGate) : (fallbackGate || {});
  const step2Enabled = (gate?.steps?.[2] || 'enabled') === 'enabled';
  const teamConfirmEnabled = !!(gate?.step1?.teamConfirmEnabled ?? true);

  const teamConfirmVisible =
    !(gate?.step1?.teamConfirmHidden === true) && !!(gate?.step1?.teamConfirmVisible ?? true);

  // iOS/Safari(PWA 포함)에서 실시간 스냅샷 반영이 늦거나,
  // 운영자 세션에서 참가자 탭을 동시에 사용할 때 UI가 바로 갱신되지 않는 케이스 대비
  const [optimisticRoom, setOptimisticRoom] = useState(null);

    useEffect(() => {
    const r = Number(viewParticipant?.room);
    if (Number.isFinite(r) && r >= 1) setOptimisticRoom(r);
  }, [viewParticipant?.room]);
  const isValidRoom = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1;
  };

  const done = isValidRoom(viewParticipant?.room) || isValidRoom(optimisticRoom);
  const assignedRoom = isValidRoom(viewParticipant?.room)
    ? Number(viewParticipant?.room)
    : (isValidRoom(optimisticRoom) ? Number(optimisticRoom) : null);
  useEffect(() => {
    const eid = playerEventId || ctxEventId || urlEventId;
    const r = Number(assignedRoom);
    if (eid && Number.isFinite(r) && r >= 1) {
      ensureMembership(eid, r);
    }
  }, [assignedRoom, playerEventId, ctxEventId, urlEventId]);

  const [showTeam, setShowTeam] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [flowStep, setFlowStep] = useState('idle');

  const participantsLoaded = Array.isArray(effectiveParticipants) && effectiveParticipants.length > 0;
  const isMeReady = useMemo(() => {
    if (!viewParticipant?.id) return false;
    if (!participantsLoaded) return false;
    return effectiveParticipants.some((p) => String(p.id) === String(viewParticipant.id));
  }, [participantsLoaded, effectiveParticipants, viewParticipant?.id]);
  const isSyncing = participantsLoaded && !isMeReady;

  useEffect(() => {
    if (viewParticipant?.room != null && flowStep === 'idle') {
      setShowTeam(false);
      setFlowStep('show');
    }
  }, [viewParticipant?.room, flowStep]);

  const getLabel = (num) =>
    Array.isArray(effectiveRoomNames) && effectiveRoomNames[num - 1]?.trim()
      ? effectiveRoomNames[num - 1].trim()
      : `${num}번방`;

  const compactMembers = useMemo(() => {
    if (!done || assignedRoom == null || !viewParticipant) return [];
    if (variant === 'fourball') {
      const mine = effectiveParticipants.find((p) => String(p.id) === String(viewParticipant.id));
      const mate = effectiveParticipants.find((p) => String(mine?.partner || '') === String(p.id));
      const pair = [mine, mate].filter(Boolean);
      pair.sort((a, b) => (Number(a?.group || 99) - Number(b?.group || 99)));
      return pair;
    }
    const me = effectiveParticipants.find((p) => String(p.id) === String(viewParticipant.id));
    return [me].filter(Boolean);
  }, [done, assignedRoom, effectiveParticipants, viewParticipant?.id, variant]);

  const teamMembersRaw = useMemo(() => {
    if (!done || assignedRoom == null) return [];
    return effectiveParticipants.filter((p) => Number(p.room) === Number(assignedRoom));
  }, [done, assignedRoom, effectiveParticipants]);

  const teamMembers = useMemo(() => {
    const list = teamMembersRaw || [];
    const byId = new Map(list.map((p) => [String(p.id), p]));
    const seen = new Set();
    const ordered = [];
    const firstGroup = list.filter((p) => Number(p?.group) === 1);
    firstGroup.sort((a, b) => {
      const na = Number(a?.id);
      const nb = Number(b?.id);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a?.nickname || '').localeCompare(String(b?.nickname || ''), 'ko');
    });
    const pushPair = (a, b) => {
      if (a && !seen.has(String(a.id))) { ordered.push(a); seen.add(String(a.id)); }
      if (b && !seen.has(String(b.id))) { ordered.push(b); seen.add(String(b.id)); }
    };
    firstGroup.forEach((p) => {
      if (seen.has(String(p.id))) return;
      const mate = p?.partner ? byId.get(String(p.partner)) : null;
      pushPair(p, mate);
    });
    list.forEach((p) => {
      if (seen.has(String(p.id))) return;
      const mate = p?.partner ? byId.get(String(p.partner)) : null;
      if (mate && !seen.has(String(mate.id))) {
        const a = Number(p.id); const b = Number(mate.id);
        if (!isNaN(a) && !isNaN(b) && a > b) pushPair(mate, p);
        else pushPair(p, mate);
      } else {
        pushPair(p, null);
      }
    });
    return ordered;
  }, [teamMembersRaw]);

  const teamMembersPadded = useMemo(() => {
    const arr = [...teamMembers];
    while (arr.length < 4) arr.push(null);
    return arr.slice(0, 4);
  }, [teamMembers]);

  const roomCount = useMemo(() => (Array.isArray(effectiveRoomNames) ? effectiveRoomNames.length : 0), [effectiveRoomNames]);
  const isValidStrokeRoom = (roomNo) => {
    if (variant !== 'stroke') return true;
    if (!roomNo) return false;
    const myGroup = Number(viewParticipant?.group) || 0;
    const sameGroupExists = effectiveParticipants.some(
      (p) =>
        Number(p.room) === Number(roomNo) &&
        Number(p.group) === myGroup &&
        String(p.id) !== String(viewParticipant?.id)
    );
    const currentCount = effectiveParticipants.filter((p) => Number(p.room) === Number(roomNo)).length;
    const isFull = currentCount >= roomCapacityAt(effectiveRoomCapacities, roomNo);
    return !sameGroupExists && !isFull;
  };

  const isValidFourballRoom = (roomNo) => {
    if (variant !== 'fourball') return true;
    if (!roomNo) return false;
    const currentCount = effectiveParticipants.filter((p) => Number(p.room) === Number(roomNo)).length;
    return currentCount <= roomCapacityAt(effectiveRoomCapacities, roomNo) - 2;
  };

  const saveMyRoom = (roomNo) => {
    const eid = playerEventId || ctxEventId || urlEventId;
    if (!roomNo || !eid) return;
    try {
      localStorage.setItem(playerStorageKey(eid, 'currentRoom'), String(roomNo));
    } catch {}
    try {
      writePlayerRoom(eid, roomNo);
    } catch {}
  };

  useEffect(() => {
    if (Number.isFinite(Number(viewParticipant?.room))) {
      saveMyRoom(Number(viewParticipant.room));
    }
  }, [viewParticipant?.room]);

  const ensureAuthAndMembershipBeforeAssign = async (eventId) => {
    try {
      await ensureAuthReady();
      await ensureMembership(eventId, null);
    } catch (e) {
      console.warn('[PlayerRoomSelect] ensureAuthAndMembershipBeforeAssign failed', e);
    }
  };

  const handleAssign = async () => {
    if (!viewParticipant?.id) return;
    if (done || isAssigning) return;

    if (!isMeReady) {
      setIsAssigning(true);
      await sleep(400);
      setIsAssigning(false);
      alert('참가자 데이터 동기화 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    if (isEventClosed) {
      alert('대회가 종료되어 더 이상 참여할 수 없습니다.');
      return;
    }

    if (variant === 'fourball' && Number(viewParticipant?.group) === 2) {
      setIsAssigning(true);
      await sleep(500);
      setIsAssigning(false);
      if (viewParticipant?.room != null) {
        const roomLabel = getLabel(viewParticipant.room);
        saveMyRoom(Number(viewParticipant.room));
        setShowTeam(false);
        setFlowStep('show');
        alert(`${viewParticipant.nickname}님은 이미 ${roomLabel}에 배정되었습니다.`);
      } else {
        alert('아직 방배정이 진행되지 않았습니다.\n1조 참가자가 방/팀원을 선택하면 확인 가능합니다.');
      }
      return;
    }

    try {
      setIsAssigning(true);
      setFlowStep('assigning');

      await sleep(TIMINGS.spinBeforeAssign);

      const eid = (playerEventId || ctxEventId || urlEventId);
      await ensureAuthAndMembershipBeforeAssign(eid);

      let attempt = 0;
      let roomNumber = null;
      let partnerNickname = null;

      while (attempt < 3) {
        const res = await onAssign(viewParticipant.id);
        roomNumber = res?.roomNumber ?? null;
        partnerNickname = res?.partnerNickname ?? null;

        await sleep(120 + Math.floor(Math.random() * 120));

        const ok =
          (variant === 'fourball' ? isValidFourballRoom(roomNumber) : isValidStrokeRoom(roomNumber));

        if (ok) break;

        attempt += 1;
        await sleep(150 * attempt + Math.floor(Math.random() * 120));
      }

      if (variant === 'fourball' ? !isValidFourballRoom(roomNumber) : !isValidStrokeRoom(roomNumber)) {
        setIsAssigning(false);
        setFlowStep('idle');
        alert('해당 방 정원이 가득 찼습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      // snapshot 반영 지연 대비: 방배정 결과를 UI에 즉시 반영하여 중복 클릭 방지
      const rn = Number(roomNumber);
      if (Number.isFinite(rn) && rn >= 1) setOptimisticRoom(rn);

      if (Number.isFinite(Number(roomNumber))) saveMyRoom(Number(roomNumber));

      await ensureMembership(eid, Number(roomNumber));

      setFlowStep('afterAssign');

      await sleep(variant === 'fourball' ? TIMINGS.preAlertFourball : TIMINGS.preAlertStroke);
      setIsAssigning(false);

      const roomLabel = getLabel(roomNumber);
      if (variant === 'fourball') {
        alert(`${viewParticipant.nickname}님은 ${roomLabel}에 배정되었습니다.\n팀원을 선택하려면 확인을 눌러주세요.`);
        if (partnerNickname) {
          setIsAssigning(true);
          await sleep(TIMINGS.spinDuringPartnerPick);
          setIsAssigning(false);
          alert(`${viewParticipant.nickname}님은 ${partnerNickname}님을 선택했습니다.`);
        }
      } else {
        alert(`${viewParticipant.nickname}님은 ${roomLabel}에 배정되었습니다.`);
      }

      setShowTeam(false);
      setFlowStep('show');
    } catch (e) {
      console.error('[assign] error:', e);
      setIsAssigning(false);
      setFlowStep('idle');
      alert('방 배정 중 오류가 발생했습니다.');
    }
  };

  const handleTeamButton = () => {
    if (done && flowStep === 'show') setShowTeam((v) => !v);
  };

  const handleNext = () => {
    if (!playerEventId) return;
    navigate(`/player/home/${playerEventId}/2`);
  };

  const sumHd = (list) => list.reduce((s, p) => s + (Number(p?.handicap) || 0), 0);

  const assignBtnLabel =
    (variant === 'fourball' && Number(participant?.group) === 2) ? '방확인'
      : isEventClosed ? '종료됨'
      : !isMeReady ? '동기화 중…'
      : isAssigning ? '배정 중…'
      : done ? '배정 완료'
      : '방배정';

  const teamBtnDisabled =
    !teamConfirmEnabled || !(done && flowStep === 'show') || isAssigning || isEventClosed;

  const nextBtnDisabled =
    !step2Enabled || !done || isAssigning || isEventClosed;

  const fixedBar = {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 'calc(env(safe-area-inset-bottom) + 56px)',
    zIndex: 30,
    background: '#fff',
    padding: '10px 16px',
    boxSizing: 'border-box',
  };

  const guard = { WebkitUserModify:'read-only', userSelect:'none' };

  return (
    <div
      className={styles.container}
      style={{
        paddingBottom: 160,
        '--row-h': '34px',
        overflowY: 'hidden',
        overscrollBehaviorY: 'contain',
        touchAction: 'manipulation'
      }}
      translate="no"
      contentEditable={false}
      suppressContentEditableWarning
    >
      {viewParticipant?.nickname && (
        <p className={styles.greeting}>
          <span className={styles.nickname} translate="no" contentEditable={false} style={guard}>
            {viewParticipant.nickname}
          </span>
          <span translate="no" contentEditable={false} style={guard}>님, 안녕하세요!</span>
        </p>
      )}

      {isEventClosed && (
        <div className={styles.notice} translate="no" contentEditable={false} style={guard}>
          대회가 종료되어 더 이상 참여할 수 없습니다.
        </div>
      )}
      {!isEventClosed && !isAssigning && isSyncing && (
        <div className={styles.notice} translate="no" contentEditable={false} style={guard}>
          내 정보 동기화 중입니다…
        </div>
      )}

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnBlue} ${isAssigning ? styles.loading : ''}`}
          onClick={handleAssign}
          disabled={isEventClosed || !isMeReady || done || isAssigning}
        >
          {isAssigning && <span className={styles.spinner} aria-hidden="true" />}
          <span translate="no" contentEditable={false} style={guard}>{assignBtnLabel}</span>
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGray}`}
          onClick={handleTeamButton}
          disabled={teamBtnDisabled}
          style={teamConfirmVisible ? undefined : { display: 'none' }}
        >
          <span translate="no" contentEditable={false} style={guard}>팀확인</span>
        </button>
      </div>

      {done && flowStep === 'show' && (
        <div className={styles.tables}>
          <div className={styles.tableBlock}>
            <div className={styles.tableCaption}>
              <span className={styles.roomTitle} translate="no" contentEditable={false} style={guard}>
                {getLabel(assignedRoom)}
              </span>
              <span translate="no" contentEditable={false} style={guard}> 배정 결과</span>
            </div>
            <table className={styles.table}>
              <colgroup><col className={styles.colName} /><col className={styles.colHd} /></colgroup>
              <thead>
                <tr><th translate="no" contentEditable={false} style={guard}>닉네임</th><th translate="no" contentEditable={false} style={guard}>G핸디</th></tr>
              </thead>
              <tbody>
                {compactMembers.map((p, idx) => (
                  <tr key={p?.id ?? `c-${idx}`}>
                    <td translate="no" contentEditable={false} style={guard}>{p?.nickname ?? '\u00A0'}</td>
                    <td translate="no" contentEditable={false} style={guard}>{p?.handicap ?? '\u00A0'}</td>
                  </tr>
                ))}
                <tr className={styles.summaryRow}>
                  <td translate="no" contentEditable={false} style={guard}>합계</td>
                  <td className={styles.sumValue} translate="no" contentEditable={false} style={guard}>
                    {sumHd(compactMembers)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {showTeam && (
            <div className={styles.tableBlock}>
              <div className={styles.tableCaption}>
                <span className={styles.roomTitle} translate="no" contentEditable={false} style={guard}>
                  {getLabel(assignedRoom)}
                </span>
                <span translate="no" contentEditable={false} style={guard}> 팀원 목록</span>
              </div>
              <table className={`${styles.table} ${styles.teamTable}`}>
                <colgroup><col className={styles.colName} /><col className={styles.colHd} /></colgroup>
                <thead>
                  <tr><th translate="no" contentEditable={false} style={guard}>닉네임</th><th translate="no" contentEditable={false} style={guard}>G핸디</th></tr>
                </thead>
                <tbody>
                  {teamMembersPadded.map((p, idx) => (
                    <tr key={p?.id ?? `t-${idx}`}>
                      <td translate="no" contentEditable={false} style={guard}>{p?.nickname ?? '\u00A0'}</td>
                      <td translate="no" contentEditable={false} style={guard}>{p?.handicap ?? '\u00A0'}</td>
                    </tr>
                  ))}
                  <tr className={styles.summaryRow}>
                    <td translate="no" contentEditable={false} style={guard}>합계</td>
                    <td className={styles.sumValue} translate="no" contentEditable={false} style={guard}>
                      {sumHd(teamMembers)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={fixedBar}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnBlue}`}
          style={{ width: '100%' }}
          onClick={handleNext}
          disabled={nextBtnDisabled}
          aria-disabled={nextBtnDisabled}
        >
          <span translate="no" contentEditable={false} style={guard}>다음 →</span>
        </button>
      </div>
    </div>
  );
}
