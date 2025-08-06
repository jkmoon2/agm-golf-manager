// src/player/screens/PlayerRoomStatus.jsx

import React, { useContext, useMemo } from 'react';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './PlayerRoomStatus.module.css';

export default function PlayerRoomStatus() {
  const {
    participants,
    participant,
    mode
  } = useContext(PlayerContext);

  // 아직 배정 전
  if (!participant || participant.room == null) {
    return <p>아직 방 배정이 되지 않았습니다. STEP1에서 방 배정을 해주세요.</p>;
  }

  // 참가자가 속한 방 번호
  const myRoom = participant.room;

  // ── 스트로크 모드 ─────────────────────────────────────────
  if (mode === 'stroke') {
    // 내 방의 멤버들
    const members = useMemo(
      () => participants.filter(p => p.room === myRoom),
      [participants, myRoom]
    );

    // 최종 결과 계산 (점수/반땅/실제결과)
    const results = useMemo(() => {
      const scores = members.map(p => p.score || 0);
      const maxScore = Math.max(...scores);
      return members.map(p => {
        const bd = p.score === maxScore
          ? Math.floor(p.score / 2)
          : p.score || 0;
        const used = bd; // 스트로크 모드는 반땅 적용
        return {
          ...p,
          banddang: bd,
          result: used - p.handicap
        };
      });
    }, [members]);

    const totalHd = members.reduce((s,v)=>s+v.handicap, 0);
    const totalRs = results.reduce((s,v)=>s+v.result, 0);

    return (
      <div className={styles.container}>
        <h3>{myRoom}번 방 배정표</h3>
        <table className={styles.table}>
          <thead><tr><th>닉네임</th><th>G핸디</th></tr></thead>
          <tbody>
            {members.map(p => (
              <tr key={p.id}>
                <td>{p.nickname}</td>
                <td>{p.handicap}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td>합계</td><td>{totalHd}</td></tr>
          </tfoot>
        </table>

        <h3>최종결과표</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>닉네임</th>
              <th>G핸디</th>
              <th>반땅</th>
              <th>결과</th>
            </tr>
          </thead>
          <tbody>
            {results.map(r => (
              <tr key={r.id}>
                <td>{r.nickname}</td>
                <td>{r.handicap}</td>
                <td>{r.banddang}</td>
                <td>{r.result}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>합계</td>
              <td>{totalHd}</td>
              <td>{results.reduce((s,v)=>s+v.banddang,0)}</td>
              <td>{totalRs}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  // ── 포볼 모드 ───────────────────────────────────────────
  // 포볼은 두 명씩 짝을 만들어 반땅 로직 없이 점수-핸디 합산 → 내 방의 두 팀 결과를 각각 보여줍니다.
  const half = participants.length / 2;
  const byRoom = useMemo(() => {
    const roomArr = participants.filter(p => p.room === myRoom);
    // slot[0,1]=1조, slot[2,3]=2조 로 채움 (관리자 로직 재현)
    const slot = [null,null,null,null];
    const used = new Set();
    // 1조 파트너 pairing
    roomArr.filter(p=>p.id<half).forEach(p1=>{
      if (used.has(p1.id)) return;
      const p2 = roomArr.find(x=>x.id===p1.partner);
      if (p2 && !used.has(p2.id)) {
        slot[0] = p1; slot[1] = p2;
        used.add(p1.id); used.add(p2.id);
      }
    });
    // 나머지 채우기
    roomArr.forEach(p=>{
      if (!used.has(p.id)) {
        const idx = slot.findIndex(x=>x==null);
        if (idx>=0) { slot[idx]=p; used.add(p.id); }
      }
    });
    return slot.map(p=>p||{ nickname:'', handicap:0, score:0, partner:null });
  },[participants, myRoom, half]);

  const teamA = byRoom.slice(0,2);
  const teamB = byRoom.slice(2,4);

  const calc = arr => {
    const detail = arr.map((p,i)=>{
      const sc = p.score||0;
      return {
        ...p,
        result: sc - p.handicap
      };
    });
    const sumHd = detail.reduce((s,v)=>s+v.handicap,0);
    const sumRs = detail.reduce((s,v)=>s+v.result,0);
    return { detail, sumHd, sumRs };
  };
  const rA = calc(teamA), rB = calc(teamB);

  return (
    <div className={styles.container}>
      <h3>{myRoom}번 방 구성표 (포볼)</h3>
      <table className={styles.table}>
        <thead><tr><th>닉네임</th><th>G핸디</th></tr></thead>
        <tbody>
          {byRoom.map((p,i)=>(
            <tr key={i}>
              <td>{p.nickname}</td>
              <td>{p.handicap}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>팀 결과표</h3>
      <table className={styles.table}>
        <thead>
          <tr><th>팀</th><th>닉네임</th><th>G핸디</th><th>결과</th></tr>
        </thead>
        <tbody>
          <tr>
            <td rowSpan={2}>팀 A</td>
            <td>{teamA[0].nickname}</td>
            <td>{teamA[0].handicap}</td>
            <td>{rA.detail[0].result}</td>
          </tr>
          <tr>
            <td>{teamA[1].nickname}</td>
            <td>{teamA[1].handicap}</td>
            <td>{rA.detail[1].result}</td>
          </tr>
          <tr>
            <td colSpan={3}>합계</td>
            <td>{rA.sumRs}</td>
          </tr>

          <tr>
            <td rowSpan={2}>팀 B</td>
            <td>{teamB[0].nickname}</td>
            <td>{teamB[0].handicap}</td>
            <td>{rB.detail[0].result}</td>
          </tr>
          <tr>
            <td>{teamB[1].nickname}</td>
            <td>{teamB[1].handicap}</td>
            <td>{rB.detail[1].result}</td>
          </tr>
          <tr>
            <td colSpan={3}>합계</td>
            <td>{rB.sumRs}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
