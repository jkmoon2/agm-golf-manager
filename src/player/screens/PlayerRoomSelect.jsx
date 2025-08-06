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

// ── 스트로크 방 선택 STEP1 ─────────────────────────────────
function StrokeRoomSelect() {
  const {
    participants,
    participant,
    joinRoom,
    allowTeamView
  } = useContext(PlayerContext);

  const [done, setDone]         = useState(false);
  const [assignedRoom, setAssignedRoom] = useState(null);
  const [teamMembers, setTeamMembers]   = useState([]);
  const [showTeam, setShowTeam]         = useState(false);

  // 이미 로그인된 참가자에 방정보가 있으면 초기화
  useEffect(() => {
    if (participant?.room != null) {
      setAssignedRoom(participant.room);
      setDone(true);
      setTeamMembers(participants.filter(p => p.room === participant.room));
    }
  }, [participant, participants]);

  const handleAssign = async () => {
    if (!participant || done) return;

    // ① 내 그룹에서 이미 배정된 방 번호들
    const usedRooms = participants
      .filter(p => p.group === participant.group && p.room != null)
      .map(p => p.room);

    // ② 전체 그룹 번호 목록 → 방 번호로 사용
    const allRooms = Array.from(new Set(participants.map(p => p.group)));
    const available = allRooms.filter(r => !usedRooms.includes(r));
    const choice = available.length
      ? available[Math.floor(Math.random() * available.length)]
      : null;

    try {
      await joinRoom(choice, participant.id);
      setAssignedRoom(choice);
      setDone(true);
      // 로컬 teamMembers 갱신
      setTeamMembers(
        participants
          .map(p =>
            p.id === participant.id
              ? { ...p, room: choice }
              : p
          )
          .filter(p => p.room === choice)
      );
    } catch (err) {
      console.error(err);
      alert('방 배정 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className={styles.container}>
      {participant?.nickname && (
        <p className={styles.greeting}>
          <span className={styles.nickname}>
            {participant.nickname}
          </span>
          님, 안녕하세요!
        </p>
      )}

      <div className={styles.buttonRow}>
        <button
          className={styles.actionButton}
          onClick={handleAssign}
          disabled={done}
        >
          {done ? '배정 완료' : '방배정'}
        </button>
        <button
          className={styles.actionButton}
          disabled={!allowTeamView || !done}
          onClick={() => setShowTeam(v => !v)}
        >
          팀확인
        </button>
      </div>

      {done && (
        <table className={styles.resultTable}>
          <caption>{assignedRoom}번 방 배정 결과</caption>
          <thead>
            <tr><th>닉네임</th><th>G핸디</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>{participant.nickname}</td>
              <td>{participant.handicap}</td>
            </tr>
          </tbody>
        </table>
      )}

      {showTeam && allowTeamView && (
        <table className={styles.teamTable}>
          <caption>{assignedRoom}번 방 팀원 목록</caption>
          <thead>
            <tr><th>닉네임</th><th>G핸디</th></tr>
          </thead>
          <tbody>
            {teamMembers.map(p => (
              <tr key={p.id}>
                <td>{p.nickname}</td>
                <td>{p.handicap}</td>
              </tr>
            ))}
            {/* 빈 슬롯 채우기 (최대 4명) */}
            {teamMembers.length < 4 &&
              Array(4 - teamMembers.length).fill().map((_, i) => (
                <tr key={`empty-${i}`}>
                  <td>&nbsp;</td><td>&nbsp;</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── 포볼 방 & 팀 선택 STEP1 ─────────────────────────────────
function FourBallRoomSelect() {
  const {
    participants,
    participant,
    joinFourBall
  } = useContext(PlayerContext);

  const [selRoom, setSelRoom]   = useState(null);
  const [selMate, setSelMate]   = useState(null);
  const [done, setDone]         = useState(false);

  // 이미 방+파트너가 있다면 초기화
  useEffect(() => {
    if (participant?.room != null && participant?.partner != null) {
      setSelRoom(participant.room);
      setSelMate(participant.partner);
      setDone(true);
    }
  }, [participant]);

  const handleConfirm = async () => {
    if (!participant || done || selRoom == null || !selMate) return;
    try {
      await joinFourBall(selRoom, participant.id, selMate);
      setDone(true);
    } catch (err) {
      console.error(err);
      alert('팀 구성 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className={styles.container}>
      {participant?.nickname && (
        <p className={styles.greeting}>
          <span className={styles.nickname}>
            {participant.nickname}
          </span>
          님, 안녕하세요!
        </p>
      )}

      <h2 className={styles.subHeader}>
        STEP 1. 방 및 팀원 선택 (포볼)
      </h2>

      <div className={styles.grid}>
        {participants
          .reduce((acc, p) => {
            if (!acc.some(x => x.number === p.room && p.room!=null))
              acc.push({ number: p.room });
            return acc;
          }, [])
          .map(r => (
            <button
              key={r.number}
              className={`${styles.card} ${
                selRoom === r.number ? styles.selected : ''
              }`}
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
                className={`${styles.card} ${
                  selMate === p.id ? styles.selected : ''
                }`}
                onClick={() => setSelMate(p.id)}
                disabled={done}
              >
                {p.nickname} ({p.handicap})
              </button>
            ))}
        </div>
      )}

      {!done && selRoom != null && selMate != null && (
        <button
          className={styles.confirm}
          onClick={handleConfirm}
        >
          팀 구성 완료
        </button>
      )}

      {done && (
        <table className={styles.resultTable}>
          <caption>{selRoom}번 방 구성 완료</caption>
          <thead><tr><th>닉네임</th><th>G핸디</th></tr></thead>
          <tbody>
            <tr>
              <td>{participant.nickname}</td>
              <td>{participant.handicap}</td>
            </tr>
            {participants
              .find(p => p.id === selMate) && (
              <tr>
                <td>{participants.find(p => p.id === selMate).nickname}</td>
                <td>{participants.find(p => p.id === selMate).handicap}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
