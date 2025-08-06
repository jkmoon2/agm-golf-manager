// src/player/screens/PlayerRoomSelect.jsx

import React, { useState, useContext } from 'react';
import { useParams } from 'react-router-dom';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './PlayerRoomSelect.module.css';

export default function PlayerRoomSelect() {
  const { mode } = useContext(PlayerContext);
  return mode === 'stroke'
    ? <StrokeRoomSelect />
    : <FourBallRoomSelect />;
}

// ───────── 스트로크 모드 ─────────
function StrokeRoomSelect() {
  const { rooms = [], participant, joinRoom } = useContext(PlayerContext);
  const { eventId } = useParams();
  const [selectedRoom, setSelectedRoom]   = useState(null);
  const [assignedRoom, setAssignedRoom]   = useState(null);

  const handleConfirm = () => {
    if (selectedRoom == null) return;
    joinRoom(selectedRoom, participant.id);
    setAssignedRoom(selectedRoom);
  };

  return (
    <div className={styles.container}>
      {/* 참가자 인사말 */}
      {participant?.nickname && (
        <p className={styles.greeting}>
          {participant.nickname}님, 안녕하세요!
        </p>
      )}

      {/* 방 선택 그리드 */}
      {rooms.length === 0 ? (
        <p className={styles.empty}>등록된 방이 없습니다.</p>
      ) : (
        <div className={styles.grid}>
          {rooms.map(r => (
            <button
              key={r.number}
              className={`${styles.card} ${selectedRoom === r.number ? styles.selected : ''}`}
              onClick={() => setSelectedRoom(r.number)}
            >
              방 {r.number}
            </button>
          ))}
        </div>
      )}

      {/* 방배정 버튼 */}
      {selectedRoom != null && (
        <button className={styles.confirm} onClick={handleConfirm}>
          방 배정
        </button>
      )}

      {/* 배정 결과 테이블 */}
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

// ───────── 포볼 모드 ─────────
function FourBallRoomSelect() {
  const { rooms = [], participants = [], participant, joinFourBall } = useContext(PlayerContext);
  const { eventId } = useParams();
  const [selRoom, setSelRoom]       = useState(null);
  const [selMate, setSelMate]       = useState(null);
  const [assignedTeam, setAssignedTeam] = useState(null);

  const handleConfirm = () => {
    if (selRoom == null || selMate == null) return;
    joinFourBall(selRoom, participant.id, selMate);
    const mate = participants.find(p => p.id === selMate);
    setAssignedTeam({ room: selRoom, mate });
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
