// src/player/screens/PlayerRoomSelect.jsx

import React, { useState, useContext } from 'react';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './PlayerRoomSelect.module.css';

export default function PlayerRoomSelect() {
  const { mode } = useContext(PlayerContext);
  return mode === 'stroke'
    ? <StrokeRoomSelect />
    : <FourBallRoomSelect />;
}

// 스트로크 모드: 방 선택 후 바로 배정
function StrokeRoomSelect() {
  const { rooms = [], participant, joinRoom } = useContext(PlayerContext);
  const [assignedRoom, setAssignedRoom] = useState(null);

  const handleSelect = roomNumber => {
    joinRoom(roomNumber, participant.id);
    setAssignedRoom(roomNumber);
  };

  return (
    <div className={styles.container}>
      {participant?.nickname && (
        <p className={styles.greeting}>
          {participant.nickname}님, 안녕하세요!
        </p>
      )}

      {rooms.length === 0 ? (
        <p className={styles.empty}>등록된 방이 없습니다.</p>
      ) : (
        <div className={styles.grid}>
          {rooms.map(r => (
            <button
              key={r.number}
              className={styles.card}
              onClick={() => handleSelect(r.number)}
            >
              방 {r.number}
            </button>
          ))}
        </div>
      )}

      {assignedRoom != null && (
        <table className={styles.resultTable}>
          <thead>
            <tr>
              <th>방 번호</th>
              <th>닉네임</th>
              <th>핸디캡</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{assignedRoom}</td>
              <td>{participant.nickname}</td>
              <td>{participant.handicap}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

// 포볼 모드: 방 + 팀원 선택
function FourBallRoomSelect() {
  const { rooms = [], participants = [], participant, joinFourBall } = useContext(PlayerContext);
  const [selRoom, setSelRoom] = useState(null);
  const [selMate, setSelMate] = useState(null);
  const [assignedTeam, setAssignedTeam] = useState(null);

  const handleConfirm = () => {
    joinFourBall(selRoom, participant.id, selMate);
    setAssignedTeam({
      room: selRoom,
      mate: participants.find(p => p.id === selMate)
    });
  };

  return (
    <div className={styles.container}>
      {participant?.nickname && (
        <p className={styles.greeting}>{participant.nickname}님, 안녕하세요!</p>
      )}

      {rooms.length === 0 ? (
        <p className={styles.empty}>등록된 방이 없습니다.</p>
      ) : (
        <>
          <div className={styles.grid}>
            {rooms.map(r => (
              <button
                key={r.number}
                className={`${styles.card} ${selRoom === r.number ? styles.selected : ''}`}
                onClick={() => { setSelRoom(r.number); setSelMate(null); }}
              >
                방 {r.number}
              </button>
            ))}
          </div>
          {selRoom != null && (
            <div className={styles.grid}>
              {participants
                .filter(p => p.id !== participant.id)
                .map(p => (
                  <button
                    key={p.id}
                    className={`${styles.card} ${selMate === p.id ? styles.selected : ''}`}
                    onClick={() => setSelMate(p.id)}
                  >
                    {p.nickname} ({p.handicap})
                  </button>
                ))}
            </div>
          )}
          {selRoom != null && selMate != null && (
            <button className={styles.confirm} onClick={handleConfirm}>
              팀 구성 완료
            </button>
          )}
        </>
      )}

      {assignedTeam && (
        <table className={styles.resultTable}>
          <thead>
            <tr>
              <th>방 번호</th>
              <th>내 팀원</th>
              <th>핸디캡</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{assignedTeam.room}</td>
              <td>{assignedTeam.mate.nickname}</td>
              <td>{assignedTeam.mate.handicap}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
);
}
