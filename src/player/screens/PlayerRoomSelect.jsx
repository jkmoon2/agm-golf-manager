// src/player/screens/PlayerRoomSelect.jsx

import React, { useState, useEffect, useContext } from 'react';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './PlayerRoomSelect.module.css';

export default function PlayerRoomSelect() {
  const { mode } = useContext(PlayerContext);
  return mode === 'stroke'
    ? <StrokeRoomSelect />
    : <FourBallRoomSelect />;
}

// ── 스트로크 모드 ─────────────────────────────────────────────────────
function StrokeRoomSelect() {
  const {
    rooms,
    participants,
    participant,
    joinRoom,
    allowTeamView
  } = useContext(PlayerContext);

  const [done, setDone]                 = useState(false);
  const [assignedRoom, setAssignedRoom] = useState(null);
  const [showTeam, setShowTeam]         = useState(false);
  const [teamMembers, setTeamMembers]   = useState([]);

  // 이미 배정된 방이 있으면 한 번만 처리
  useEffect(() => {
    if (participant?.room != null && !done) {
      setAssignedRoom(participant.room);
      setDone(true);
    }
  }, [participant, done]);

  // 팀원 목록 갱신
  useEffect(() => {
    if (done && assignedRoom != null) {
      setTeamMembers(
        participants.filter(p => p.room === assignedRoom)
      );
    }
  }, [done, assignedRoom, participants]);

  const handleAssign = async () => {
    if (!participant || done) return;
    const idx = Math.floor(Math.random() * rooms.length);
    const roomNum = rooms[idx].number;
    try {
      await joinRoom(roomNum, participant.id);
      setAssignedRoom(roomNum);
      setDone(true);
    } catch (err) {
      console.error(err);
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
        <button
          className={styles.assignBtn}
          onClick={handleAssign}
          disabled={done}
        >
          {done ? '배정 완료' : '방배정'}
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
        <table className={styles.resultTable}>
          <caption className={styles.tableCaption}>
            {assignedRoom}번 방 배정 결과
          </caption>
          <thead>
            <tr><th>닉네임</th><th>G핸디</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>{participant.nickname}</td>
              <td>{participant.handicap}</td>
            </tr>
            <tr className={styles.summaryRow}>
              <td>합계</td>
              <td>{participant.handicap}</td>
            </tr>
          </tbody>
        </table>
      )}

      {showTeam && done && (
        <table className={styles.teamTable}>
          <caption className={styles.tableCaption}>
            {assignedRoom}번 방 팀원 목록
          </caption>
          <thead>
            <tr><th>닉네임</th><th>G핸디</th></tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => {
              const p = teamMembers[i];
              return (
                <tr key={i}>
                  <td>{p?.nickname || ''}</td>
                  <td>{p?.handicap != null ? p.handicap : ''}</td>
                </tr>
              );
            })}
            <tr className={styles.summaryRow}>
              <td>합계</td>
              <td>
                {teamMembers.reduce((sum, p) => sum + (p?.handicap||0), 0)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── 포볼 모드 ─────────────────────────────────────────────────────────
function FourBallRoomSelect() {
  const {
    rooms,
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

  const handleConfirm = async () => {
    if (done || selRoom == null || !selMate) return;
    try {
      await joinFourBall(selRoom, participant.id, selMate);
      setDone(true);
    } catch (err) {
      console.error(err);
      alert('팀 구성 중 오류가 발생했습니다.');
    }
  };

  const mateData = participants.find(p => p.id === selMate);

  return (
    <div className={styles.container}>
      {participant?.nickname && (
        <p className={styles.greeting}>
          <span className={styles.nickname}>{participant.nickname}</span>님, 안녕하세요!
        </p>
      )}
      <h2 className={styles.subHeader}>STEP 1. 방 및 팀원 선택 (포볼)</h2>

      <div className={styles.grid}>
        {rooms.map(r => (
          <button
            key={r.number}
            className={`${styles.card} ${selRoom === r.number ? styles.selected : ''}`}
            onClick={() => setSelRoom(r.number)}
            disabled={done}
          >
            방 {r.number}
          </button>
        ))}
      </div>

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

      {!done && selRoom != null && selMate != null && (
        <button className={styles.confirmBtn} onClick={handleConfirm}>
          팀 구성 완료
        </button>
      )}

      {done && (
        <table className={styles.resultTable}>
          <caption className={styles.tableCaption}>
            {selRoom}번 방 구성 완료
          </caption>
          <thead>
            <tr><th>닉네임</th><th>G핸디</th></tr>
          </thead>
          <tbody>
            <tr><td>{participant.nickname}</td><td>{participant.handicap}</td></tr>
            {mateData && <tr><td>{mateData.nickname}</td><td>{mateData.handicap}</td></tr>}
            <tr className={styles.summaryRow}>
              <td>합계</td>
              <td>{(participant.handicap||0) + (mateData?.handicap||0)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
