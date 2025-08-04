// src/player/screens/PlayerRoomSelect.jsx

import React, { useState, useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  const navigate = useNavigate();
  const { eventId } = useParams();

  // ← 수정: 참가자 정보 없으면 로그인 화면으로 리다이렉트
  if (!participant) {
    navigate(`/player/home/${eventId}/login`, { replace: true });
    return null;
  }

  const handleSelect = roomNumber => {
    joinRoom(roomNumber, participant.id); // 운영자 STEP5 로직
    alert(`방 ${roomNumber}에 배정되었습니다.`);
    navigate('2');                        // ← 수정: 상대 경로로 STEP2 이동
  };

  return (
    <div className={styles.container}>
      {/* ← 수정: 운영자 STEP UI와 동일한 페이지 타이틀 및 참가자 인사 */}
      <h2 className={styles.title}>STEP 1. 방 선택 (스트로크)</h2>
      <p className={styles.greeting}>{participant.nickname}님, 안녕하세요!</p>

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
    </div>
  );
}

// 포볼 모드: 방 선택과 팀원 선택을 동시에
function FourBallRoomSelect() {
  const { rooms = [], participants = [], participant, joinFourBall } = useContext(PlayerContext);
  const navigate = useNavigate();
  const { eventId } = useParams();
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedMate, setSelectedMate] = useState(null);

  // ← 수정: 참가자 정보 없으면 로그인 화면으로 리다이렉트
  if (!participant) {
    navigate(`/player/home/${eventId}/login`, { replace: true });
    return null;
  }

  const handleRoomSelect = number => {
    setSelectedRoom(number);
    setSelectedMate(null);
  };
  const handleMateSelect = mateId => {
    setSelectedMate(mateId);
  };
  const handleConfirm = () => {
    joinFourBall(selectedRoom, participant.id, selectedMate); // 운영자 STEP7 로직
    alert(`방 ${selectedRoom}에서 팀원이 선택되었습니다.`);
    navigate('2');                                           // ← 수정: 상대 경로로 STEP2 이동
  };

  return (
    <div className={styles.container}>
      {/* ← 수정: 페이지 타이틀 및 참가자 인사 */}
      <h2 className={styles.title}>STEP 1. 방 및 팀원 선택 (포볼)</h2>
      <p className={styles.greeting}>{participant.nickname}님, 안녕하세요!</p>

      {rooms.length === 0 ? (
        <p className={styles.empty}>등록된 방이 없습니다.</p>
      ) : (
        <>
          <div className={styles.grid}>
            {rooms.map(r => (
              <button
                key={r.number}
                className={`${styles.card} ${selectedRoom === r.number ? styles.selected : ''}`}
                onClick={() => handleRoomSelect(r.number)}
              >
                방 {r.number}
              </button>
            ))}
          </div>
          {selectedRoom != null && (
            <div className={styles.grid}>
              {participants
                .filter(p => p.id !== participant.id)
                .map(p => (
                  <button
                    key={p.id}
                    className={`${styles.card} ${selectedMate === p.id ? styles.selected : ''}`}
                    onClick={() => handleMateSelect(p.id)}
                  >
                    {p.nickname} ({p.handicap})
                  </button>
                ))}
            </div>
          )}
          {selectedRoom != null && selectedMate != null && (
            <button className={styles.confirm} onClick={handleConfirm}>
              팀 구성 완료
            </button>
          )}
        </>
      )}
    </div>
  );
}
