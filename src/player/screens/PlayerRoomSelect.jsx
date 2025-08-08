// src/player/screens/PlayerRoomSelect.jsx

import React, { useState, useEffect, useContext, useMemo } from 'react';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './PlayerRoomSelect.module.css';

export default function PlayerRoomSelect() {
  const { mode } = useContext(PlayerContext);
  // mode는 PlayerContext에서 'agm'을 'fourball'로 이미 정규화했음
  return mode === 'fourball' ? <FourBallRoomSelect /> : <StrokeRoomSelect />;
}

/* ─────────────────────────────────────────────────────────────
 * 스트로크 STEP1
 * ────────────────────────────────────────────────────────────*/
function StrokeRoomSelect() {
  const {
    rooms,           // [{ number }]
    roomNames,       // ["","",...]
    participants,
    participant,
    joinRoom,
  } = useContext(PlayerContext);

  const [done, setDone]                 = useState(false);
  const [assignedRoom, setAssignedRoom] = useState(null);
  const [showTeam, setShowTeam]         = useState(false);

  const teamMembers = useMemo(() => {
    if (!done || assignedRoom == null) return [];
    return participants.filter(p => p.room === assignedRoom);
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
    return `${num}번 방`;
  };

  const handleAssign = async () => {
    if (!participant || done) return;

    // fourball 이벤트에서 스트로크 배정이 눌리는 것을 방지
    if (!rooms || rooms.length === 0) {
      alert('현재 이벤트는 스트로크 방 목록이 없습니다. 포볼(agm) 대회인지 확인해 주세요.');
      return;
    }

    const idx = Math.floor(Math.random() * rooms.length);
    const roomNum = rooms[idx].number;

    try {
      await joinRoom(roomNum, participant.id);
      setAssignedRoom(roomNum);
      setDone(true);
    } catch (e) {
      console.error('[Stroke assign] error:', e);
      alert('방 배정 중 오류가 발생했습니다.');
    }
  };

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
        <button className={styles.teamBtn} onClick={() => setShowTeam(v => !v)} disabled={!done}>
          팀확인
        </button>
      </div>

      {done && (
        <table className={styles.resultTable}>
          <colgroup>
            <col className={styles.colNick} />
            <col className={styles.colHd} />
          </colgroup>
          <caption className={styles.tableCaption}>
            <span className={styles.roomTitle}>{getLabel(assignedRoom)}</span> 배정 결과
          </caption>
          <thead>
            <tr><th>닉네임</th><th>G핸디</th></tr>
          </thead>
          <tbody>
            <tr className={styles.fixedRow}>
              <td className={`${styles.fixedCell} ${styles.leftCell}`}>{participant.nickname}</td>
              <td className={styles.fixedCell}>{participant.handicap}</td>
            </tr>
            <tr className={`${styles.summaryRow} ${styles.fixedRow}`}>
              <td className={`${styles.fixedCell} ${styles.leftCell}`}>합계</td>
              <td className={styles.fixedCell}>{participant.handicap}</td>
            </tr>
          </tbody>
        </table>
      )}

      {showTeam && done && (
        <table className={styles.teamTable}>
          <colgroup>
            <col className={styles.colNick} />
            <col className={styles.colHd} />
          </colgroup>
          <caption className={styles.tableCaption}>
            <span className={styles.roomTitle}>{getLabel(assignedRoom)}</span> 팀원 목록
          </caption>
          <thead>
            <tr><th>닉네임</th><th>G핸디</th></tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => {
              const p = teamMembers[i];
              return (
                <tr key={i} className={styles.fixedRow}>
                  <td className={`${styles.fixedCell} ${styles.leftCell}`}>
                    {p?.nickname ?? '\u00A0'}
                  </td>
                  <td className={styles.fixedCell}>
                    {p?.handicap != null ? p.handicap : '\u00A0'}
                  </td>
                </tr>
              );
            })}
            <tr className={`${styles.summaryRow} ${styles.fixedRow}`}>
              <td className={`${styles.fixedCell} ${styles.leftCell}`}>합계</td>
              <td className={styles.fixedCell}>
                {teamMembers.reduce((sum, p) => sum + (p?.handicap || 0), 0)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 포볼(= 'agm') STEP1
 *  - 방 선택 → 파트너 선택 → 팀 구성 완료
 * ────────────────────────────────────────────────────────────*/
function FourBallRoomSelect() {
  const {
    rooms,           // 비어있을 수 있음
    roomNames,
    participants,
    participant,
    joinFourBall
  } = useContext(PlayerContext);

  const [selRoom, setSelRoom] = useState(null);
  const [selMate, setSelMate] = useState(null);
  const [done, setDone]       = useState(false);

  useEffect(() => {
    if (participant?.room != null && participant?.partner != null) {
      setSelRoom(participant.room);
      setSelMate(participant.partner);
      setDone(true);
    }
  }, [participant]);

  // rooms 가 비어있다면 roomNames 또는 group 으로 유도
  const derivedRooms = useMemo(() => {
    if (rooms?.length) return rooms;
    if (roomNames?.length) return roomNames.map((_, idx) => ({ number: idx + 1 }));
    const groups = [...new Set(participants.map(p => p.group))];
    return (groups.length ? groups : [1]).map(g => ({ number: g }));
  }, [rooms, roomNames, participants]);

  const getLabel = (num) => {
    if (Array.isArray(roomNames) && roomNames[num - 1]?.trim()) {
      return roomNames[num - 1].trim();
    }
    return `${num}번 방`;
  };

  const mateData = participants.find(p => p.id === selMate);

  const handleConfirm = async () => {
    if (done || selRoom == null || !selMate) return;
    try {
      await joinFourBall(selRoom, participant.id, selMate);
      setDone(true);
      alert('팀 구성이 완료되었습니다.');
    } catch (e) {
      console.error('[Fourball assign] error:', e);
      alert('팀 구성 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className={styles.container}>
      {participant?.nickname && (
        <p className={styles.greeting}>
          <span className={styles.nickname}>{participant.nickname}</span>님, 안녕하세요!
        </p>
      )}

      <h2 className={styles.subHeader}>
        STEP 1. {selRoom != null ? getLabel(selRoom) : '방 선택'} 팀원 선택 (포볼)
      </h2>

      {/* 방 선택 */}
      <div className={styles.grid}>
        {derivedRooms.map(r => (
          <button
            key={r.number}
            className={`${styles.card} ${selRoom === r.number ? styles.selected : ''}`}
            onClick={() => setSelRoom(r.number)}
            disabled={done}
          >
            {getLabel(r.number)}
          </button>
        ))}
      </div>

      {/* 파트너 선택 */}
      {selRoom != null && !done && (
        <div className={styles.grid}>
          {participants
            .filter(p => p.id !== participant.id)
            .map(p => (
              <button
                key={p.id}
                className={`${styles.card} ${selMate === p.id ? styles.selected : ''}`}
                onClick={() => setSelMate(p.id)}
                disabled={done}
              >
                {p.nickname} ({p.handicap})
              </button>
            ))}
        </div>
      )}

      {/* 완료 버튼 */}
      {!done && selRoom != null && selMate != null && (
        <button className={styles.confirmBtn} onClick={handleConfirm}>
          팀 구성 완료
        </button>
      )}

      {/* 결과 */}
      {done && (
        <table className={styles.resultTable}>
          <colgroup>
            <col className={styles.colNick} />
            <col className={styles.colHd} />
          </colgroup>
          <caption className={styles.tableCaption}>
            {getLabel(selRoom)} 구성 완료
          </caption>
          <thead>
            <tr><th>닉네임</th><th>G핸디</th></tr>
          </thead>
          <tbody>
            <tr className={styles.fixedRow}>
              <td className={`${styles.fixedCell} ${styles.leftCell}`}>{participant.nickname}</td>
              <td className={styles.fixedCell}>{participant.handicap}</td>
            </tr>
            {mateData && (
              <tr className={styles.fixedRow}>
                <td className={`${styles.fixedCell} ${styles.leftCell}`}>{mateData.nickname}</td>
                <td className={styles.fixedCell}>{mateData.handicap}</td>
              </tr>
            )}
            <tr className={`${styles.summaryRow} ${styles.fixedRow}`}>
              <td className={`${styles.fixedCell} ${styles.leftCell}`}>합계</td>
              <td className={styles.fixedCell}>
                {(participant.handicap || 0) + (mateData?.handicap || 0)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
