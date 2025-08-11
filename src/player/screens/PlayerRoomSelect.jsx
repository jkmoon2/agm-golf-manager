// src/player/screens/PlayerRoomSelect.jsx

import React, { useState, useEffect, useContext, useMemo } from 'react';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './PlayerRoomSelect.module.css';

export default function PlayerRoomSelect() {
  const { mode } = useContext(PlayerContext);
  const isFourball = mode === 'fourball' || mode === 'agm';
  return isFourball ? <FourballLikeSelect /> : <StrokeLikeSelect />;
}

function StrokeLikeSelect() {
  const { roomNames, participants, participant, assignStrokeForOne } = useContext(PlayerContext);
  return (
    <BaseRoomSelect
      roomNames={roomNames}
      participants={participants}
      participant={participant}
      onAssign={async (myId) => {
        const { roomNumber } = await assignStrokeForOne(String(myId));
        return roomNumber;
      }}
    />
  );
}

function FourballLikeSelect() {
  const { roomNames, participants, participant, assignFourballForOneAndPartner } = useContext(PlayerContext);
  return (
    <BaseRoomSelect
      roomNames={roomNames}
      participants={participants}
      participant={participant}
      onAssign={async (myId) => {
        const { roomNumber, partnerNickname } = await assignFourballForOneAndPartner(String(myId));
        if (partnerNickname) {
          alert(`팀원이 자동으로 선택되었습니다: ${partnerNickname}`);
        } else {
          alert('현재 방에 팀원이 없어 자리만 확보되었습니다.');
        }
        return roomNumber;
      }}
    />
  );
}

function BaseRoomSelect({ roomNames, participants, participant, onAssign }) {
  const [done, setDone] = useState(false);
  const [assignedRoom, setAssignedRoom] = useState(null);
  const [showTeam, setShowTeam] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (participant?.room != null && !done) {
      setAssignedRoom(participant.room);
      setDone(true);
    }
  }, [participant, done]);

  const teamMembers = useMemo(() => {
    if (!done || assignedRoom == null) return [];
    return participants.filter(p => p.room === assignedRoom);
  }, [done, assignedRoom, participants]);

  const handleAssign = async () => {
    if (working || done) return;
    if (!participant || participants.length === 0) return; // 데이터 로드 전 클릭 방지

    try {
      setWorking(true);
      const roomNum = await onAssign(String(participant.id));
      setAssignedRoom(roomNum);
      setDone(true);
    } catch (e) {
      console.error('[assign] error:', e);
      alert('방 배정 중 오류가 발생했습니다.');
    } finally {
      setWorking(false);
    }
  };

  const getLabel = (num) => (Array.isArray(roomNames) && roomNames[num - 1]?.trim())
    ? roomNames[num - 1].trim()
    : `${num}번방`;

  return (
    <div className={styles.container}>
      {participant?.nickname && (
        <p className={styles.greeting}>
          <span className={styles.nickname}>{participant.nickname}</span>님, 안녕하세요!
        </p>
      )}

      <div className={styles.buttonRow}>
        <button
          className={styles.assignBtn}
          onClick={handleAssign}
          disabled={done || working || !participant || participants.length === 0}
        >
          {done ? '배정 완료' : (working ? '배정 중…' : '방배정')}
        </button>
        <button
          className={styles.teamBtn}
          onClick={() => setShowTeam(v => !v)}
          disabled={!done}
        >
          팀확인
        </button>
      </div>

      {done && (
        <table className={styles.table}>
          <caption className={styles.tableCaption}>
            <span className={styles.roomTitle}>{getLabel(assignedRoom)}</span> 배정 결과
          </caption>
          <colgroup>
            <col style={{ width: '62%' }} />
            <col style={{ width: '38%' }} />
          </colgroup>
          <thead>
            <tr><th>닉네임</th><th>G핸디</th></tr>
          </thead>
          <tbody>
            <tr><td>{participant.nickname}</td><td>{participant.handicap}</td></tr>
            <tr className={styles.summaryRow}><td>합계</td><td className={styles.sumValue}>{participant.handicap}</td></tr>
          </tbody>
        </table>
      )}

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
            <tr><th>닉네임</th><th>G핸디</th></tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => {
              const p = teamMembers[i];
              return (
                <tr key={i}>
                  <td>{p?.nickname ?? '\u00A0'}</td>
                  <td>{(p?.handicap ?? '\u00A0')}</td>
                </tr>
              );
            })}
            <tr className={styles.summaryRow}>
              <td>합계</td>
              <td className={styles.sumValue}>
                {teamMembers.reduce((s, p) => s + (p?.handicap || 0), 0)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
