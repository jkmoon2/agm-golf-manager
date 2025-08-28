// src/player/screens/PlayerRoomSelect.jsx

import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './PlayerRoomSelect.module.css';

const TIMINGS = {
  spinBeforeAssign: 1000,
  preAlertStroke: 300,
  preAlertFourball: 300,
  spinDuringPartnerPick: 1800,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const { eventId, isEventClosed } = useContext(PlayerContext);
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
      return [mine, mate].filter(Boolean);
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
      setFlowStep('afterAssign');

      await sleep(variant === 'fourball' ? TIMINGS.preAlertFourball : TIMINGS.preAlertStroke);
      setIsAssigning(false);

      const roomLabel = getLabel(roomNumber);
      if (variant === 'fourball') {
        alert(`${participant.nickname}님은 ${roomLabel}에 배정되었습니다.\n팀원을 선택하려면 확인을 눌러주세요.`);
        setIsAssigning(true);
        await sleep(TIMINGS.spinDuringPartnerPick);
        setIsAssigning(false);
        if (partnerNickname) alert(`${participant.nickname}님은 ${partnerNickname}님을 선택했습니다.`);
        else alert('아직 팀원이 정해지지 않았습니다.');
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
    if (!eventId) return;
    navigate(`/player/home/${eventId}/2`);
  };

  const sumHd = (list) => list.reduce((s, p) => s + (Number(p?.handicap) || 0), 0);

  const assignBtnLabel =
    isFourballGroup2 ? '방확인'
      : isEventClosed ? '종료됨'
      : !isMeReady ? '동기화 중…'
      : isAssigning ? '배정 중…'
      : done ? '배정 완료'
      : '방배정';

  const teamBtnDisabled = !(done && flowStep === 'show') || isAssigning || isEventClosed;
  const nextBtnDisabled = !done || isAssigning || isEventClosed;

  // ▼▼ 하단 고정 바 (버튼 모양은 기존 클래스 그대로 사용)
  const fixedBar = {
    position: 'fixed',
    left: 16,
    right: 16,
    bottom: 'calc(env(safe-area-inset-bottom) + 64px + 12px)', // 탭바 위에 살짝 띄움
    zIndex: 20,
    background: 'transparent',
  };

  return (
    // 버튼이 가리지 않도록 여유 추가
    <div
      className={styles.container}
      style={{
        paddingBottom: 160,
        '--row-h': '34px',                // ← 행 높이(원하시면 28~32px로 조정)
        overflowY: 'hidden',              // ← 본문 세로 드래그 제거
        overscrollBehaviorY: 'contain',   // ← iOS 튕김 방지
        touchAction: 'manipulation'       // ← 모바일 스크롤 과민 방지
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

      {/* 하단 고정 “다음” 버튼 — 기존 클래스 그대로 */}
      <div style={fixedBar}>
        <button
          className={`${styles.btn} ${styles.btnBlue}`}
          style={{ width: '100%' }}
          onClick={handleNext}
          disabled={nextBtnDisabled}
        >
          다음 →
        </button>
      </div>
    </div>
  );
}
