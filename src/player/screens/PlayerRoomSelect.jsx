// /src/player/screens/PlayerRoomSelect.jsx
// 기존 로직 100% 유지 + EventContext 미장착/미로드 시에도 작동하도록 playerGate 폴백 구독 추가

import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PlayerContext } from '../../contexts/PlayerContext';
import { EventContext } from '../../contexts/EventContext';
import styles from './PlayerRoomSelect.module.css';

// 🆕 Firestore 폴백 구독용
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

const TIMINGS = {
  spinBeforeAssign: 1000,
  preAlertStroke: 300,
  preAlertFourball: 300,
  spinDuringPartnerPick: 1800,
};
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
  const { eventId: playerEventId, isEventClosed } = useContext(PlayerContext);
  const { eventId: ctxEventId, eventData, loadEvent } = useContext(EventContext);
  const { eventId: urlEventId } = useParams();

  // ★ 추가: joinRoom을 별도 훅 호출로 가져와서(기존 줄 수정 없이) 중복 감지 시 교정 커밋에 사용
  const { joinRoom } = useContext(PlayerContext); // ★ 추가

  // 🆕 폴백 구독 상태
  const [fallbackGate, setFallbackGate] = useState(null);

  // URL 또는 PlayerContext의 eventId를 EventContext에 주입
  useEffect(() => {
    const eid = urlEventId || playerEventId;
    if (eid && ctxEventId !== eid && typeof loadEvent === 'function') {
      loadEvent(eid);
    }
  }, [urlEventId, playerEventId, ctxEventId, loadEvent]);

  // 🆕 EventContext가 비어있는 경우 Firestore 직접 구독
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

  // ★ 추가: '숨김' 지원 (기본값: 보이기). Admin Settings에서 step1.teamConfirmHidden === true 이면 숨김.
  //         혹은 step1.teamConfirmVisible === false 여도 숨김.
  const teamConfirmVisible =
    !(gate?.step1?.teamConfirmHidden === true) && !!(gate?.step1?.teamConfirmVisible ?? true); // ★ 추가

  const done = !!participant?.room;
  const assignedRoom = participant?.room ?? null;

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
    if (participant?.room != null && flowStep === 'idle') {
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
      const mate = participants.find((p) => String(p.id) === String(mine?.partner));
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

  const isFourballGroup2 = variant === 'fourball' && Number(participant?.group) === 2;

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

  // ★ 추가: 방 유효성 검사(스트로크 전용)
  const roomCount = useMemo(() => (Array.isArray(roomNames) ? roomNames.length : 0), [roomNames]); // ★ 추가
  const isValidStrokeRoom = (roomNo) => { // ★ 추가
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

    if (isFourballGroup2) {
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
      const { roomNumber, partnerNickname } = await onAssign(participant.id);

      // ★ 추가: 스트로크 방중복/정원초과 즉시 검증 + 교정
      let finalRoom = roomNumber;
      if (!isValidStrokeRoom(finalRoom)) {
        // 교정 후보(같은 조 없는 방 + 정원 미만) 중 랜덤
        const candidates = Array.from({ length: roomCount }, (_, i) => i + 1)
          .filter((r) => isValidStrokeRoom(r));
        if (candidates.length > 0) {
          finalRoom = candidates[Math.floor(Math.random() * candidates.length)];
          if (typeof joinRoom === 'function') {
            await joinRoom(finalRoom, participant.id); // Firestore에 즉시 커밋
          }
        } else {
          // 교정 불가(모든 방이 충돌/정원초과) → 사용자에게 안내하고 종료
          setIsAssigning(false);
          setFlowStep('idle');
          alert('동시 배정으로 인한 충돌이 감지되었습니다.\n잠시 후 다시 시도해주세요.');
          return;
        }
      }
      // ★ 추가 끝

      if (Number.isFinite(Number(finalRoom))) saveMyRoom(Number(finalRoom));

      setFlowStep('afterAssign');

      await sleep(variant === 'fourball' ? TIMINGS.preAlertFourball : TIMINGS.preAlertStroke);
      setIsAssigning(false);

      const roomLabel = getLabel(finalRoom);
      if (variant === 'fourball') {
        alert(`${participant.nickname}님은 ${roomLabel}에 배정되었습니다.\n팀원을 선택하려면 확인을 눌러주세요.`);
        // ★ (기존) 팀원 선택 안내
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
    isFourballGroup2 ? '방확인'
      : isEventClosed ? '종료됨'
      : !isMeReady ? '동기화 중…'
      : isAssigning ? '배정 중…'
      : done ? '배정 완료'
      : '방배정';

  // 운영자 설정 반영(컨텍스트/폴백 공통)
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
    >
      {participant?.nickname && (
        <p className={styles.greeting}>
          <span className={styles.nickname}>{participant.nickname}</span>님, 안녕하세요!
        </p>
      )}

      {isEventClosed && <div className={styles.notice}>대회가 종료되어 더 이상 참여할 수 없습니다.</div>}
      {!isEventClosed && !isAssigning && isSyncing && (
        <div className={styles.notice}>내 정보 동기화 중입니다…</div>
      )}

      <div className={styles.buttonRow}>
        <button
          className={`${styles.btn} ${styles.btnBlue} ${isAssigning ? styles.loading : ''}`}
          onClick={handleAssign}
          disabled={isEventClosed || (!isFourballGroup2 && (done || isAssigning || !isMeReady))}
        >
          {isAssigning && <span className={styles.spinner} aria-hidden="true" />}
          <span>{assignBtnLabel}</span>
        </button>
        <button
          className={`${styles.btn} ${styles.btnGray}`}
          onClick={handleTeamButton}
          disabled={teamBtnDisabled}
          style={teamConfirmVisible ? undefined : { display: 'none' }} // ★ 추가: 숨김 반영
        >
          팀확인
        </button>
      </div>

      {done && flowStep === 'show' && (
        <div className={styles.tables}>
          <div className={styles.tableBlock}>
            <div className={styles.tableCaption}>
              <span className={styles.roomTitle}>{getLabel(assignedRoom)}</span> 배정 결과
            </div>
            <table className={styles.table}>
              <colgroup><col className={styles.colName} /><col className={styles.colHd} /></colgroup>
              <thead><tr><th>닉네임</th><th>G핸디</th></tr></thead>
              <tbody>
                {compactMembers.map((p, idx) => (
                  <tr key={p?.id ?? `c-${idx}`}>
                    <td>{p?.nickname ?? '\u00A0'}</td>
                    <td>{p?.handicap ?? '\u00A0'}</td>
                  </tr>
                ))}
                <tr className={styles.summaryRow}><td>합계</td><td className={styles.sumValue}>{sumHd(compactMembers)}</td></tr>
              </tbody>
            </table>
          </div>

          {/* 팀원 목록 표시 */}
          {showTeam && (
            <div className={styles.tableBlock}>
              <div className={styles.tableCaption}>
                <span className={styles.roomTitle}>{getLabel(assignedRoom)}</span> 팀원 목록
              </div>
              <table className={`${styles.table} ${styles.teamTable}`}>
                <colgroup><col className={styles.colName} /><col className={styles.colHd} /></colgroup>
                <thead><tr><th>닉네임</th><th>G핸디</th></tr></thead>
                <tbody>
                  {teamMembersPadded.map((p, idx) => (
                    <tr key={p?.id ?? `t-${idx}`}>
                      <td>{p?.nickname ?? '\u00A0'}</td>
                      <td>{p?.handicap ?? '\u00A0'}</td>
                    </tr>
                  ))}
                  <tr className={styles.summaryRow}><td>합계</td><td className={styles.sumValue}>{sumHd(teamMembers)}</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={fixedBar}>
        <button
          className={`${styles.btn} ${styles.btnBlue}`}
          style={{ width: '100%' }}
          onClick={handleNext}
          disabled={nextBtnDisabled}
          aria-disabled={nextBtnDisabled}
        >
          다음 →
        </button>
      </div>
    </div>
  );
}
