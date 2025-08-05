// src/player/screens/PlayerRoomSelect.jsx

import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './PlayerRoomSelect.module.css';

export default function PlayerRoomSelect() {
  const { mode } = useContext(PlayerContext);
  return mode === 'stroke'
    ? <StrokeRoomSelect />
    : <FourBallRoomSelect />;
}

function StrokeRoomSelect() {
  const { rooms = [], participant, joinRoom } = useContext(PlayerContext);
  const navigate = useNavigate();
  const { eventId } = useParams();
  const [assignedRoom, setAssignedRoom] = useState(null);

  // participant 없으면 로그인으로
  useEffect(() => {
    if (!participant) {
      navigate(`/player/home/${eventId}/login`, { replace: true });
    }
  }, [participant, eventId, navigate]);

  const handleSelect = roomNumber => {
    joinRoom(roomNumber, participant.id);
    setAssignedRoom(roomNumber);
    sessionStorage.setItem(`auth_${eventId}`, 'true');         // ← sessionStorage
  };

  return (
    <div className={styles.container}>
      {participant?.nickname && (
        <p className={styles.greeting}>{participant.nickname}님, 안녕하세요!</p>
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
        <div className={styles.result}>
          🎉 방 {assignedRoom}에 성공적으로 배정되었습니다!
        </div>
      )}
    </div>
  );
}

function FourBallRoomSelect() {
  const { rooms = [], participants = [], participant, joinFourBall } = useContext(PlayerContext);
  const { eventId } = useParams();
  const [selRoom, setSelRoom] = useState(null);
  const [selMate, setSelMate] = useState(null);
  const [assignedTeam, setAssignedTeam] = useState(null);

  const handleConfirm = () => {
    joinFourBall(selRoom, participant.id, selMate);
    setAssignedTeam({
      room: selRoom,
      mate: participants.find(p => p.id === selMate)
    });
    sessionStorage.setItem(`auth_${eventId}`, 'true');         // ← sessionStorage
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
        <div className={styles.result}>
          🎉 방 {assignedTeam.room}에 {assignedTeam.mate.nickname}님과 함께 배정되었습니다!
        </div>
      )}
    </div>
  );
}
