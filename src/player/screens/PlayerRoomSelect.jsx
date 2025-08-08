// src/player/screens/PlayerRoomSelect.jsx

import React, { useState, useEffect, useContext } from 'react';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './PlayerRoomSelect.module.css';

export default function PlayerRoomSelect() {
  const { mode } = useContext(PlayerContext);
  return mode === 'fourball' ? <FourBallLikeStroke /> : <StrokeRoomSelect />;
}

/* ─────────────────────────  스트로크  ───────────────────────── */
function StrokeRoomSelect() {
  const {
    participants, participant,
    roomNames,
    assignStrokeForOne,
  } = useContext(PlayerContext);

  const [done, setDone]                 = useState(false);
  const [assignedRoom, setAssignedRoom] = useState(null);
  const [showTeam, setShowTeam]         = useState(false);
  const [teamMembers, setTeamMembers]   = useState([]);

  useEffect(() => {
    if (participant?.room != null && !done) {
      setAssignedRoom(participant.room);
      setDone(true);
    }
  }, [participant, done]);

  useEffect(() => {
    if (done && assignedRoom != null) {
      setTeamMembers(participants.filter(p => p.room === assignedRoom));
    }
  }, [done, assignedRoom, participants]);

  const getLabel = (num) =>
    Array.isArray(roomNames) && roomNames[num - 1]?.trim()
      ? roomNames[num - 1].trim()
      : `${num}번 방`;

  const handleAssign = async () => {
    if (!participant || done) return;
    try {
      const { roomNumber } = await assignStrokeForOne(participant.id);
      setAssignedRoom(roomNumber);
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
            <tr>
              <td>{participant.nickname}</td>
              <td>{participant.handicap}</td>
            </tr>
            <tr className={styles.summaryRow}>
              <td>합계</td>
              <td className={styles.sumBlue}>{participant.handicap}</td>
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
                <tr key={i}>
                  <td>{p?.nickname || ''}</td>
                  <td>{p?.handicap ?? ''}</td>
                </tr>
              );
            })}
            <tr className={styles.summaryRow}>
              <td>합계</td>
              <td className={styles.sumBlue}>
                {teamMembers.reduce((s, p) => s + (p?.handicap || 0), 0)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─────────────────────────  포볼(UX는 스트로크와 동일)  ───────────────────────── */
function FourBallLikeStroke() {
  const {
    participants, participant,
    roomNames,
    assignFourballForOneAndPartner,
  } = useContext(PlayerContext);

  const [done, setDone]                 = useState(false);
  const [assignedRoom, setAssignedRoom] = useState(null);
  const [showTeam, setShowTeam]         = useState(false);
  const [teamMembers, setTeamMembers]   = useState([]);

  useEffect(() => {
    if (participant?.room != null && !done) {
      setAssignedRoom(participant.room);
      setDone(true);
    }
  }, [participant, done]);

  useEffect(() => {
    if (done && assignedRoom != null) {
      setTeamMembers(participants.filter(p => p.room === assignedRoom));
    }
  }, [done, assignedRoom, participants]);

  const getLabel = (num) =>
    Array.isArray(roomNames) && roomNames[num - 1]?.trim()
      ? roomNames[num - 1].trim()
      : `${num}번 방`;

  const handleAssign = async () => {
    if (!participant || done) return;
    try {
      const { roomNumber, partnerNickname } =
        await assignFourballForOneAndPartner(participant.id);

      alert(`${getLabel(roomNumber)}에 배정되었습니다.\n팀원을 선택하려면 확인을 눌러주세요.`);
      if (partnerNickname) {
        alert(`${participant.nickname}님은 ${partnerNickname}님을 선택했습니다.`);
      } else {
        alert('아직 매칭 가능한 팀원이 없어, 이후 자동/수동으로 매칭됩니다.');
      }

      setAssignedRoom(roomNumber);
      setDone(true);
    } catch (e) {
      console.error('[Fourball assign] error:', e);
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
            <tr>
              <td>{participant.nickname}</td>
              <td>{participant.handicap}</td>
            </tr>
            <tr className={styles.summaryRow}>
              <td>합계</td>
              <td className={styles.sumBlue}>{participant.handicap}</td>
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
                <tr key={i}>
                  <td>{p?.nickname || ''}</td>
                  <td>{p?.handicap ?? ''}</td>
                </tr>
              );
            })}
            <tr className={styles.summaryRow}>
              <td>합계</td>
              <td className={styles.sumBlue}>
                {teamMembers.reduce((s, p) => s + (p?.handicap || 0), 0)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

