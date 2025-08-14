// src/player/screens/PlayerRoomSelect.jsx

import React, { useState, useEffect, useContext, useMemo } from 'react';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './PlayerRoomSelect.module.css';

/* =========================================================
 * 알림/스피너 타이밍 (숫자만 바꿔서 원하는 속도로 조정)
 * ---------------------------------------------------------
 * spinBeforeAssign          : 버튼 클릭 → 배정 호출 전 스피너 유지
 * preAlertStroke            : (스트로크) 배정 완료 직후 → 알림1 전
 * preAlertFourball          : (포볼)    배정 완료 직후 → 알림1 전
 * spinDuringPartnerPick     : (포볼)    알림1 닫은 직후 ~ 알림2 전(팀원 선택 중 스핀)
 * =======================================================*/
const TIMINGS = {
  spinBeforeAssign: 1000,
  preAlertStroke: 300,
  preAlertFourball: 300,
  spinDuringPartnerPick: 1800, // ⬅️ 새로 추가: 알림1 확인 후 스핀 보여줄 시간
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function PlayerRoomSelect() {
  const { mode } = useContext(PlayerContext);
  const isFourball = mode === 'fourball' || mode === 'agm';
  return isFourball ? <FourballLikeSelect /> : <StrokeLikeSelect />;
}

/* ───────── 스트로크 ───────── */
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

/* ───────── 포볼(=agm) ───────── */
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

/* ───────── 공통 UI ───────── */
function BaseRoomSelect({
  variant,
  roomNames,
  participants,
  participant,
  onAssign,
}) {
  const { isEventClosed } = useContext(PlayerContext);
  const [done, setDone] = useState(false);
  const [assignedRoom, setAssignedRoom] = useState(null);
  const [showTeam, setShowTeam] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [flowStep, setFlowStep] = useState('idle');

  // 내 정보가 participants에 로딩됐는지
  const isMeReady = useMemo(() => {
    if (!participant?.id) return false;
    if (!Array.isArray(participants) || participants.length === 0) return false;
    return participants.some((p) => String(p.id) === String(participant.id));
  }, [participants, participant?.id]);

  // 새로고침으로 이미 배정된 경우 복구
  useEffect(() => {
    if (participant?.room != null && flowStep === 'idle' && !done) {
      setAssignedRoom(participant.room);
      setDone(true);
      setShowTeam(false);
      setFlowStep('show');
    }
  }, [participant?.room, flowStep, done]);

  const getLabel = (num) => {
    if (Array.isArray(roomNames) && roomNames[num - 1]?.trim()) {
      return roomNames[num - 1].trim();
    }
    return `${num}번방`;
  };

  // 배정 결과(표1)
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

  // 같은 방 전체(표2)
  const teamMembersRaw = useMemo(() => {
    if (!done || assignedRoom == null) return [];
    return participants.filter((p) => Number(p.room) === Number(assignedRoom));
  }, [done, assignedRoom, participants]);

  // 팀 정렬(1조 페어 먼저)
  const teamMembers = useMemo(() => {
    const list = teamMembersRaw || [];
    const byId = new Map(list.map((p) => [String(p.id), p]));
    const seen = new Set();
    const ordered = [];

    const firstGroup = list.filter((p) => Number(p?.group) === 1);
    firstGroup.sort((a, b) => {
      const na = Number(a?.id), nb = Number(b?.id);
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
        const a = Number(p.id), b = Number(mate.id);
        if (!isNaN(a) && !isNaN(b) && a > b) pushPair(mate, p);
        else pushPair(p, mate);
      } else {
        pushPair(p, null);
      }
    });

    return ordered;
  }, [teamMembersRaw]);

  // 4행까지 패딩
  const teamMembersPadded = useMemo(() => {
    const arr = [...teamMembers];
    while (arr.length < 4) arr.push(null);
    return arr.slice(0, 4);
  }, [teamMembers]);

  const isFourballGroup2 = variant === 'fourball' && Number(participant?.group) === 2;

  const handleAssign = async () => {
    if (!participant?.id) return;
    if (done || isAssigning) return;

    // 아직 동기화 전이면 대기
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

    // 포볼 2조는 확인만
    if (isFourballGroup2) {
      setIsAssigning(true);
      await sleep(500);
      setIsAssigning(false);
      if (participant?.room != null) {
        const roomLabel = getLabel(participant.room);
        setAssignedRoom(participant.room);
        setDone(true);
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

      // 1) 클릭 직후 스피너
      await sleep(TIMINGS.spinBeforeAssign);

      const { roomNumber, partnerNickname } = await onAssign(participant.id);

      setFlowStep('afterAssign');

      // 2) 알림1 전 짧은 대기
      await sleep(variant === 'fourball' ? TIMINGS.preAlertFourball : TIMINGS.preAlertStroke);

      // ─── 스트로크: 알림1 → 완료 ───
      if (variant !== 'fourball') {
        setIsAssigning(false);
        const roomLabel = getLabel(roomNumber);
        alert(`${participant.nickname}님은 ${roomLabel}에 배정되었습니다.`);
        setAssignedRoom(roomNumber);
        setDone(true);
        setShowTeam(false);
        setFlowStep('show');
        return;
      }

      // ─── 포볼: 알림1 → (스피너) → 알림2 → 완료 ───
      const roomLabel = getLabel(roomNumber);
      setIsAssigning(false); // 알림1 직전에는 스피너 off
      alert(`${participant.nickname}님은 ${roomLabel}에 배정되었습니다.\n팀원을 선택하려면 확인을 눌러주세요.`);

      // 알림1을 닫은 "직후" 스피너 ON (팀원 선택 중)
      setIsAssigning(true);
      await sleep(TIMINGS.spinDuringPartnerPick);
      setIsAssigning(false);

      if (partnerNickname) {
        alert(`${participant.nickname}님은 ${partnerNickname}님을 선택했습니다.`);
      } else {
        alert('아직 팀원이 정해지지 않았습니다.');
      }

      setAssignedRoom(roomNumber);
      setDone(true);
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

  const sumHd = (list) => list.reduce((s, p) => s + (Number(p?.handicap) || 0), 0);

  const assignBtnLabel =
    isFourballGroup2
      ? '방확인'
      : isEventClosed
      ? '종료됨'
      : !isMeReady
      ? '동기화 중…'
      : isAssigning
      ? '배정 중…'
      : done
      ? '배정 완료'
      : '방배정';

  const teamBtnDisabled = !(done && flowStep === 'show') || isAssigning || isEventClosed;

  return (
    <div className={styles.container}>
      {participant?.nickname && (
        <p className={styles.greeting}>
          <span className={styles.nickname}>{participant.nickname}</span>님, 안녕하세요!
        </p>
      )}

      {isEventClosed && <div className={styles.notice}>대회가 종료되어 더 이상 참여할 수 없습니다.</div>}

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

      {/* 표들 */}
      {done && flowStep === 'show' && (
        <div className={styles.tables}>
          <div className={styles.tableBlock}>
            <div className={styles.tableCaption}>
              <span className={styles.roomTitle}>{getLabel(assignedRoom)}</span> 배정 결과
            </div>
            <table className={styles.table}>
              <colgroup>
                <col className={styles.colName} />
                <col className={styles.colHd} />
              </colgroup>
              <thead>
                <tr><th>닉네임</th><th>G핸디</th></tr>
              </thead>
              <tbody>
                {compactMembers.map((p, idx) => (
                  <tr key={p?.id ?? `c-${idx}`}>
                    <td>{p?.nickname ?? '\u00A0'}</td>
                    <td>{p?.handicap ?? '\u00A0'}</td>
                  </tr>
                ))}
                <tr className={styles.summaryRow}>
                  <td>합계</td>
                  <td className={styles.sumValue}>{sumHd(compactMembers)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {showTeam && (
            <div className={styles.tableBlock}>
              <div className={styles.tableCaption}>
                <span className={styles.roomTitle}>{getLabel(assignedRoom)}</span> 팀원 목록
              </div>
              <table className={`${styles.table} ${styles.teamTable}`}>
                <colgroup>
                  <col className={styles.colName} />
                  <col className={styles.colHd} />
                </colgroup>
                <thead>
                  <tr><th>닉네임</th><th>G핸디</th></tr>
                </thead>
                <tbody>
                  {teamMembersPadded.map((p, idx) => (
                    <tr key={p?.id ?? `t-${idx}`}>
                      <td>{p?.nickname ?? '\u00A0'}</td>
                      <td>{p?.handicap ?? '\u00A0'}</td>
                    </tr>
                  ))}
                  <tr className={styles.summaryRow}>
                    <td>합계</td>
                    <td className={styles.sumValue}>{sumHd(teamMembers)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
