// /src/player/screens/PlayerRoomSelect.jsx

import React, { useState, useEffect, useContext, useMemo } from 'react';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './PlayerRoomSelect.module.css';

export default function PlayerRoomSelect() {
  const { mode } = useContext(PlayerContext);
  const isFourball = mode === 'fourball' || mode === 'agm'; // Firestore 'agm' 대응
  return isFourball ? <FourballLikeSelect /> : <StrokeLikeSelect />;
}

/* 스트로크: 관리자 STEP5 규칙으로 1명 자동 배정 */
function StrokeLikeSelect() {
  const {
    roomNames,
    participants,
    participant,
    assignStrokeForOne,
  } = useContext(PlayerContext);

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

/* 포볼(=agm): 관리자 STEP7의 '방+파트너 자동선택' */
function FourballLikeSelect() {
  const {
    roomNames,
    participants,
    participant,
    assignFourballForOneAndPartner,
  } = useContext(PlayerContext);

  return (
    <BaseRoomSelect
      variant="fourball"
      roomNames={roomNames}
      participants={participants}
      participant={participant}
      onAssign={async (myId) => {
        const res = await assignFourballForOneAndPartner(myId);
        return res; // {roomNumber, partnerNickname}
      }}
    />
  );
}

/* 공통 UI (버튼/표 출력 동일 유지) */
function BaseRoomSelect({
  variant,            // 'stroke' | 'fourball'
  roomNames,
  participants,
  participant,
  onAssign,           // (myId) => Promise<{roomNumber, partnerNickname?}>
}) {
  const [done, setDone] = useState(false);
  const [assignedRoom, setAssignedRoom] = useState(null);
  const [showTeam, setShowTeam] = useState(false);

  // 배정 종료 후 보여줄 대상(포볼: 본인+파트너 두 명만)
  const compactMembers = useMemo(() => {
    if (!done || assignedRoom == null || !participant) return [];
    if (variant === 'fourball') {
      const mine = participants.find(p => p.id === participant.id);
      const mate = participants.find(p => p.id === mine?.partner);
      return [mine, mate].filter(Boolean);
    }
    return [participants.find(p => p.id === participant.id)].filter(Boolean);
  }, [done, assignedRoom, participants, participant, variant]);

  // 같은 방 전체 팀원(팀확인에서 사용)
  const teamMembers = useMemo(() => {
    if (!done || assignedRoom == null) return [];
    return participants.filter((p) => p.room === assignedRoom);
  }, [done, assignedRoom, participants]);

  useEffect(() => {
    if (participant?.room != null && !done) {
      setAssignedRoom(participant.room);
      setDone(true);
    }
  }, [participant, done]);

  const getLabel = (num) => {
    if (Array.isArray(roomNames) && roomNames[num - 1]?.trim()) {
      return roomNames[num - 1].trim();
    }
    return `${num}번방`;
  };

  const handleAssign = async () => {
    try {
      if (!participant || done) return;

      // 스피너 느낌의 짧은 지연
      await new Promise(r => setTimeout(r, 350));

      const { roomNumber, partnerNickname } = await onAssign(participant.id);
      setAssignedRoom(roomNumber);
      setDone(true);

      // 알림 메세지 (방이름 우선)
      const roomLabel = getLabel(roomNumber);

      if (variant === 'fourball') {
        alert(`${participant.nickname}님은 ${roomLabel}에 배정되었습니다.\n팀원을 선택하려면 확인을 눌러주세요.`);
        // 안내를 한 번 더 노출
        if (partnerNickname) {
          alert(`${participant.nickname}님은 ${partnerNickname}님을 선택했습니다.`);
        } else {
          alert('아직 팀원이 정해지지 않았습니다.');
        }
      } else {
        alert(`${participant.nickname}님은 ${roomLabel}에 배정되었습니다.`);
      }
    } catch (e) {
      console.error('[assign] error:', e);
      alert('방 배정 중 오류가 발생했습니다.');
    }
  };

  // 합계 계산 도우미
  const sumHd = (list) => list.reduce((s, p) => s + (p?.handicap || 0), 0);

  return (
    <div className={styles.container}>
      {participant?.nickname && (
        <p className={styles.greeting}>
          <span className={styles.nickname}>{participant.nickname}</span>님, 안녕하세요!
        </p>
      )}

      <div className={styles.buttonRow}>
        <button className={styles.assignBtn} onClick={handleAssign} disabled={done}>
          {done ? '배정 완료' : '방배정'}
        </button>
        <button
          className={styles.teamBtn}
          onClick={() => setShowTeam((v) => !v)}
          disabled={!done}
        >
          팀확인
        </button>
      </div>

      {/* 배정결과: 스트로크=본인만 / 포볼=본인+파트너  */}
      {done && compactMembers.length > 0 && (
        <table className={styles.table}>
          <caption className={styles.tableCaption}>
            <span className={styles.roomTitle}>{getLabel(assignedRoom)}</span> 배정 결과
          </caption>

          <colgroup>
            <col style={{ width: '62%' }} />
            <col style={{ width: '38%' }} />
          </colgroup>

          <thead>
            <tr>
              <th>닉네임</th>
              <th>G핸디</th>
            </tr>
          </thead>
          <tbody>
            {compactMembers.map((p, i) => (
              <tr key={i}>
                <td>{p.nickname}</td>
                <td>{p.handicap}</td>
              </tr>
            ))}
            <tr className={styles.summaryRow}>
              <td>합계</td>
              <td className={styles.sumValue}>{sumHd(compactMembers)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {/* 팀확인: 같은 방 전원 */}
      {showTeam && done && (
        <table className={`${styles.table} ${styles.teamTable}`}>
          <caption className={styles.tableCaption}>
            <span className={styles.roomTitle}>{getLabel(assignedRoom)}</span> 팀원 목록
          </caption>

          <colgroup>
            <col style={{ width: '62%' }} />
            <col style={{ width: '38%' }} />
          </colgroup>

          <thead>
            <tr>
              <th>닉네임</th>
              <th>G핸디</th>
            </tr>
          </thead>
          <tbody>
            {/* 항상 4줄(빈칸도 동일 높이) */}
            {Array.from({ length: 4 }).map((_, i) => {
              const p = teamMembers[i];
              return (
                <tr key={i}>
                  <td>{p?.nickname ?? '\u00A0'}</td>
                  <td>{p?.handicap ?? '\u00A0'}</td>
                </tr>
              );
            })}
            <tr className={styles.summaryRow}>
              <td>합계</td>
              <td className={styles.sumValue}>{sumHd(teamMembers)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
