// /src/player/screens/PlayerRoomSelect.jsx

import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PlayerContext } from '../../contexts/PlayerContext';
import { EventContext } from '../../contexts/EventContext';
import styles from './PlayerRoomSelect.module.css';

import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { signInAnonymously } from 'firebase/auth';

const TIMINGS = {
  spinBeforeAssign: 1000,
  preAlertStroke: 300,
  preAlertFourball: 300,
  spinDuringPartnerPick: 1800,
};

async function ensureAuthReady() {
  try {
    if (!auth?.currentUser) {
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
  const { roomNames, participants, participant, assignStrokeForOne } = useContext(PlayerContext);
  return (
    <BaseRoomSelect
      variant="stroke"
      roomNames={roomNames}
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
  const { roomNames, participants, participant, assignFourballForOneAndPartner } =
    useContext(PlayerContext);
  return (
    <BaseRoomSelect
      variant="fourball"
      roomNames={roomNames}
      participants={participants}
      participant={participant}
      onAssign={async (myId) => {
        const { roomNumber, partnerNickname } = await assignFourballForOneAndPartner(myId);
        return { roomNumber, partnerNickname };
      }}
    />
  );
}

function BaseRoomSelect({ variant, roomNames, participants, participant, onAssign }) {
  const navigate = useNavigate();
  const { eventId: playerEventId, setEventId, isEventClosed } = useContext(PlayerContext);
  const { eventId: ctxEventId, eventData, loadEvent } = useContext(EventContext);
  const { eventId: urlEventId } = useParams();

  // ✅ URL의 eventId가 PlayerContext의 eventId보다 우선 (이전 대회 localStorage 잔상/오배정 방지)
  useEffect(() => {
    if (!urlEventId) return;
    if (urlEventId === playerEventId) return;
    try {
      setEventId?.(urlEventId);
      localStorage.setItem('eventId', urlEventId);
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
    if (eventData?.playerGate) { setFallbackGate(null); return; }
    const ref = doc(db, 'events', id);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      if (d?.playerGate) setFallbackGate(normalizeGate(d.playerGate));
      else setFallbackGate(null);
    });
    return unsub;
  }, [urlEventId, ctxEventId, playerEventId, eventData?.playerGate]);

  const gate = eventData?.playerGate ? normalizeGate(eventData.playerGate) : (fallbackGate || {});
  const step2Enabled = (gate?.steps?.[2] || 'enabled') === 'enabled';
  const teamConfirmEnabled = !!(gate?.step1?.teamConfirmEnabled ?? true);

  const teamConfirmVisible =
    !(gate?.step1?.teamConfirmHidden === true) && !!(gate?.step1?.teamConfirmVisible ?? true);

  // iOS/Safari(PWA 포함)에서 실시간 스냅샷 반영이 늦거나,
  // 운영자 세션에서 참가자 탭을 동시에 사용할 때 UI가 바로 갱신되지 않는 케이스 대비
  const [optimisticRoom, setOptimisticRoom] = useState(null);

  useEffect(() => {
    const r = Number(participant?.room);
    if (Number.isFinite(r) && r >= 1) setOptimisticRoom(r);
  }, [participant?.room]);

  // NOTE: Number(null) === 0, so Number.isFinite(Number(participant?.room)) was making
  // 'done' true even when the participant was NOT assigned yet. We must require room >= 1.
  const roomNum = Number(participant?.room);
  const optNum = Number(optimisticRoom);
  const done = (Number.isFinite(roomNum) && roomNum >= 1) || (Number.isFinite(optNum) && optNum >= 1);
  const assignedRoom = (Number.isFinite(roomNum) && roomNum >= 1)
    ? roomNum
    : ((Number.isFinite(optNum) && optNum >= 1) ? optNum : null);

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

  const participantsLoaded = Array.isArray(participants) && participants.length > 0;
  const isMeReady = useMemo(() => {
    if (!participant?.id) return false;
    if (!participantsLoaded) return false;
    return participants.some((p) => String(p.id) === String(participant.id));
  }, [participantsLoaded, participants, participant?.id]);
  const isSyncing = participantsLoaded && !isMeReady;

  useEffect(() => {
    const r = Number(participant?.room);
    if (Number.isFinite(r) && r >= 1 && flowStep === 'idle') {
      setShowTeam(false);
      setFlowStep('show');
    }
  }, [participant?.room, flowStep]);

  const getLabel = (num) =>
    Array.isArray(roomNames) && roomNames[num - 1]?.trim()
      ? roomNames[num - 1].trim()
      : `${num}번방`;

  const compactMembers = useMemo(() => {
    if (!done || assignedRoom == null || !participant) return [];
    if (variant === 'fourball') {
      const mine = participants.find((p) => String(p.id) === String(participant.id));
      const mate = participants.find((p) => String(mine?.partner || '') === String(p.id));
      const pair = [mine, mate].filter(Boolean);
      pair.sort((a, b) => (Number(a?.group || 99) - Number(b?.group || 99)));
      return pair;
    }
    const me = participants.find((p) => String(p.id) === String(participant.id));
    return [me].filter(Boolean);
  }, [done, assignedRoom, participants, participant, variant]);

  const teamMembersRaw = useMemo(() => {
    if (!done || assignedRoom == null) return [];
    return participants.filter((p) => Number(p.room) === Number(assignedRoom));
  }, [done, assignedRoom, participants]);

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

  const roomCount = useMemo(() => (Array.isArray(roomNames) ? roomNames.length : 0), [roomNames]);
  const isValidStrokeRoom = (roomNo) => {
    if (variant !== 'stroke' || !roomNo) return true;
    const myGroup = Number(participant?.group) || 0;
    const sameGroupExists = participants.some(
      (p) =>
        Number(p.room) === Number(roomNo) &&
        Number(p.group) === myGroup &&
        String(p.id) !== String(participant?.id)
    );
    const currentCount = participants.filter((p) => Number(p.room) === Number(roomNo)).length;
    const isFull = currentCount >= 4;
    return !sameGroupExists && !isFull;
  };

  const isValidFourballRoom = (roomNo) => {
    if (variant !== 'fourball' || !roomNo) return true;
    const currentCount = participants.filter((p) => Number(p.room) === Number(roomNo)).length;
    return currentCount < 4;
  };

  const saveMyRoom = (roomNo) => {
    if (!roomNo || !playerEventId) return;
    try {
      localStorage.setItem(`player.currentRoom:${playerEventId}`, String(roomNo));
      localStorage.setItem('player.currentRoom', String(roomNo));
    } catch {}
  };

  useEffect(() => {
    if (Number.isFinite(Number(participant?.room))) {
      saveMyRoom(Number(participant.room));
    }
  }, [participant?.room]);

  const ensureAuthAndMembershipBeforeAssign = async (eventId) => {
    try {
      await ensureAuthReady();
      await ensureMembership(eventId, null);
    } catch (e) {
      console.warn('[PlayerRoomSelect] ensureAuthAndMembershipBeforeAssign failed', e);
    }
  };

  const handleAssign = async () => {
    if (!participant?.id) return;
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

    if (variant === 'fourball' && Number(participant?.group) === 2) {
      setIsAssigning(true);
      await sleep(500);
      setIsAssigning(false);
      if (participant?.room != null) {
        const roomLabel = getLabel(participant.room);
        saveMyRoom(Number(participant.room));
        setShowTeam(false);
        setFlowStep('show');
        alert(`${participant.nickname}님은 이미 ${roomLabel}에 배정되었습니다.`);
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
        const res = await onAssign(participant.id);
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
        alert(`${participant.nickname}님은 ${roomLabel}에 배정되었습니다.\n팀원을 선택하려면 확인을 눌러주세요.`);
        if (partnerNickname) {
          setIsAssigning(true);
          await sleep(TIMINGS.spinDuringPartnerPick);
          setIsAssigning(false);
          alert(`${participant.nickname}님은 ${partnerNickname}님을 선택했습니다.`);
        }
      } else {
        alert(`${participant.nickname}님은 ${roomLabel}에 배정되었습니다.`);
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
    left: 16,
    right: 16,
    bottom: 'calc(env(safe-area-inset-bottom) + 64px + 12px)',
    zIndex: 20,
    background: 'transparent',
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
      {participant?.nickname && (
        <p className={styles.greeting}>
          <span className={styles.nickname} translate="no" contentEditable={false} style={guard}>
            {participant.nickname}
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
