// src/player/screens/PlayerRoomStatus.jsx

import React, { useContext, useMemo } from 'react';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './PlayerRoomStatus.module.css';
import { getAssignmentPartnerId, getAssignmentRoom } from '../../utils/assignmentCompat';

/**
 * 참가자 STEP2
 * - 스트로크: Admin STEP6(방배정표/최종결과표)와 동일한 계산 방식으로, "내 방"만 단일 표로 표시
 * - 포볼   : Admin STEP8(방배정표/최종결과표/팀결과표)와 동일한 정렬·합산 로직으로, "내 방"만 표시
 *
 * 주의:
 * - roomNames: PlayerContext에서 제공(관리자 STEP2 방이름 우선, 없으면 "N번 방")
 * - id/partner 타입이 문자열/숫자 혼재 가능 → 비교 시 String(...) 통일
 * - 표는 항상 4행이 보이도록 빈 칸도 동일한 높이/테두리로 렌더링
 */
export default function PlayerRoomStatus() {
  const {
    participants = [],
    participant,
    mode = 'stroke',
    roomNames = [],
  } = useContext(PlayerContext);

  const myRoom = getAssignmentRoom(participant);

  if (!participant || myRoom == null) {
    return <p>아직 방 배정이 되지 않았습니다. STEP1에서 방 배정을 해주세요.</p>;
  }

  // room/roomNumber 호환값은 위에서 계산한 myRoom을 사용
  const labelOf = (num) =>
    (Array.isArray(roomNames) && roomNames[num - 1]?.trim())
      ? roomNames[num - 1].trim()
      : `${num}번 방`;

  // ─────────────────────────────────────────────
  // 공통 유틸
  // ─────────────────────────────────────────────
  const MAX_PER_ROOM = 4;

  const membersInMyRoom = useMemo(() => {
    return participants.filter(p => Number(getAssignmentRoom(p)) === Number(myRoom));
  }, [participants, myRoom]);

  // 빈칸을 포함해 4칸으로 맞춘 배열
  const pad4 = (arr, filler = { nickname: '', handicap: 0, score: 0 }) =>
    Array.from({ length: MAX_PER_ROOM }, (_, i) => arr[i] ?? filler);

  // ─────────────────────────────────────────────
  // 스트로크 모드 (Admin STEP6 계산/표현 그대로)
  // ─────────────────────────────────────────────
  if (mode === 'stroke') {
    // 방배정표용 데이터(닉네임/G핸디), 4칸 채우기
    const allocRows = pad4(membersInMyRoom.map(p => ({
      nickname: p.nickname ?? '',
      handicap: p.handicap ?? 0,
    })), { nickname: '', handicap: 0 });

    // 최종결과표 계산 (반땅 대상: 방 내 최대 점수자 1명)
    const strokeResult = useMemo(() => {
      const filled = pad4(membersInMyRoom);
      // 최대 점수 인덱스
      let maxIdx = 0, maxVal = -Infinity;
      filled.forEach((p, i) => {
        const sc = p?.score ?? 0;
        if (sc > maxVal) { maxVal = sc; maxIdx = i; }
      });

      let sumHd = 0, sumSc = 0, sumBd = 0, sumRs = 0;
      const detail = filled.map((p, i) => {
        const hd = p?.handicap ?? 0;
        const sc = p?.score ?? 0;
        const bd = (i === maxIdx) ? Math.floor(sc / 2) : sc; // 반땅
        const rs = bd - hd;
        sumHd += hd;
        sumSc += sc;
        sumBd += bd;
        sumRs += rs;
        return {
          id: p?.id,
          nickname: p?.nickname ?? '',
          handicap: hd,
          score: sc,
          banddang: bd,
          result: rs,
        };
      });
      return { detail, sumHandicap: sumHd, sumScore: sumSc, sumBanddang: sumBd, sumResult: sumRs };
    }, [membersInMyRoom]);

    const sumHdAlloc = membersInMyRoom.reduce((s, p) => s + (p?.handicap ?? 0), 0);

    return (
      <div className={styles.container}>
        {/* 방배정표 */}
        <h3 className={styles.sectionTitle}>🏠 {labelOf(myRoom)} 방배정표</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.header}>닉네임</th>
              <th className={styles.header}>G핸디</th>
            </tr>
          </thead>
          <tbody>
            {allocRows.map((row, i) => (
              <tr key={`alloc-${i}`} className={styles.fixedRow}>
                <td className={styles.cell}>{row.nickname}</td>
                <td className={styles.cell} style={{ color: 'blue' }}>{row.handicap}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className={styles.footerLabel}>합계</td>
              <td className={styles.footerValue} style={{ color: 'blue' }}>{sumHdAlloc}</td>
            </tr>
          </tfoot>
        </table>

        {/* 최종결과표 */}
        <h3 className={styles.sectionTitle}>📊 최종결과표</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.header}>닉네임</th>
              <th className={styles.header}>G핸디</th>
              <th className={styles.header}>점수</th>
              <th className={styles.header}>반땅</th>
              <th className={styles.header}>결과</th>
            </tr>
          </thead>
          <tbody>
            {strokeResult.detail.map((r, i) => (
              <tr key={`res-${r.id ?? i}`} className={styles.fixedRow}>
                <td className={styles.cell}>{r.nickname}</td>
                <td className={styles.cell}>{r.handicap}</td>
                <td className={styles.cell}>{r.score}</td>
                <td className={styles.cell} style={{ color: 'blue' }}>{r.banddang}</td>
                <td className={styles.cell} style={{ color: 'red' }}>{r.result}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className={styles.footerLabel}>합계</td>
              <td className={styles.footerValue}>{strokeResult.sumHandicap}</td>
              <td className={styles.footerValue}>{strokeResult.sumScore}</td>
              <td className={styles.footerBanddang}>{strokeResult.sumBanddang}</td>
              <td className={styles.footerResult}>{strokeResult.sumResult}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // 포볼 모드 (Admin STEP8 정렬/합산 그대로)
  // ─────────────────────────────────────────────

  // 1조/2조 구분은 “참가자 배열 절반 기준” 규칙을 그대로 사용
  // (id가 문자열일 수 있으므로 Number(...)로 비교하거나, 그룹값을 쓰는 구조라면 그룹 기반으로 바꿔도 OK)
  const half = Math.floor(participants.length / 2);

  // 내 방 멤버들 → slot[0..3] 채우기 (1조 짝 먼저 배치)
  const ordered4 = useMemo(() => {
    const roomArr = membersInMyRoom;
    const slot = [null, null, null, null];
    const used = new Set(); // String(id)

    // ① 1조(p.id < half) → partner 짝 찾아 pair로 먼저 배치
    const pairs = [];
    roomArr
      .filter(p => Number(p.id) < half)
      .forEach(p1 => {
        const p1id = String(p1.id);
        if (used.has(p1id)) return;
        const partnerId = getAssignmentPartnerId(p1);
        const partner = partnerId ? roomArr.find(x => String(x.id) === String(partnerId)) : null;
        if (partner && !used.has(String(partner.id))) {
          pairs.push([p1, partner]);
          used.add(p1id);
          used.add(String(partner.id));
        }
      });

    // pairs[0] → slot[0],slot[1], pairs[1] → slot[2],slot[3]
    pairs.forEach((pair, idx) => {
      if (idx === 0) {
        slot[0] = pair[0];
        slot[1] = pair[1];
      } else if (idx === 1) {
        slot[2] = pair[0];
        slot[3] = pair[1];
      }
    });

    // ② 나머지 멤버들 순서대로 빈칸 채우기
    roomArr.forEach(p => {
      const pid = String(p.id);
      if (!used.has(pid)) {
        const empty = slot.findIndex(x => x == null);
        if (empty >= 0) {
          slot[empty] = p;
          used.add(pid);
        }
      }
    });

    // 빈칸을 기본객체로 채워 4칸 보장
    return pad4(slot.map(p => p || { nickname: '', handicap: 0, score: 0 }));
  }, [membersInMyRoom, half]);

  // 방배정표 합계(핸디)
  const sumHdAllocFB = ordered4.reduce((s, p) => s + (p?.handicap ?? 0), 0);

  // 최종결과표(포볼): 반땅 없음, 개인 결과 = 점수 - 핸디
  const fbResult = useMemo(() => {
    const detail = ordered4.map(p => {
      const hd = p?.handicap ?? 0;
      const sc = p?.score ?? 0;
      return {
        id: p?.id,
        nickname: p?.nickname ?? '',
        handicap: hd,
        score: sc,
        result: sc - hd,
      };
    });
    const sumHd = detail.reduce((s, v) => s + v.handicap, 0);
    const sumSc = detail.reduce((s, v) => s + v.score, 0);
    const sumRs = detail.reduce((s, v) => s + v.result, 0);
    return { detail, sumHandicap: sumHd, sumScore: sumSc, sumResult: sumRs };
  }, [ordered4]);

  // 팀결과표: [0,1]=A팀, [2,3]=B팀
  const teamA = ordered4.slice(0, 2);
  const teamB = ordered4.slice(2, 4);
  const calcTeam = (team) => {
    const d0 = team[0], d1 = team[1];
    const r0 = (d0?.score ?? 0) - (d0?.handicap ?? 0);
    const r1 = (d1?.score ?? 0) - (d1?.handicap ?? 0);
    return {
      members: team,
      sumResult: r0 + r1,
      sumHandicap: (d0?.handicap ?? 0) + (d1?.handicap ?? 0),
      rows: [
        { n: d0?.nickname ?? '', h: d0?.handicap ?? 0, s: d0?.score ?? 0, r: r0 },
        { n: d1?.nickname ?? '', h: d1?.handicap ?? 0, s: d1?.score ?? 0, r: r1 },
      ]
    };
  };
  const tA = calcTeam(teamA);
  const tB = calcTeam(teamB);

  return (
    <div className={styles.container}>
      {/* 방배정표 */}
      <h3 className={styles.sectionTitle}>🏠 {labelOf(myRoom)} 방배정표 (포볼)</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.header}>닉네임</th>
            <th className={styles.header}>G핸디</th>
          </tr>
        </thead>
        <tbody>
          {ordered4.map((p, i) => (
            <tr key={`fb-alloc-${i}`} className={styles.fixedRow}>
              <td className={styles.cell}>{p.nickname}</td>
              <td className={styles.cell} style={{ color: 'blue' }}>{p.handicap}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className={styles.footerLabel}>합계</td>
            <td className={styles.footerValue} style={{ color: 'blue' }}>{sumHdAllocFB}</td>
          </tr>
        </tfoot>
      </table>

      {/* 최종결과표 */}
      <h3 className={styles.sectionTitle}>📊 최종결과표</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.header}>닉네임</th>
            <th className={styles.header}>G핸디</th>
            <th className={styles.header}>점수</th>
            <th className={styles.header}>결과</th>
          </tr>
        </thead>
        <tbody>
          {fbResult.detail.map((r, i) => (
            <tr key={`fb-res-${r.id ?? i}`} className={styles.fixedRow}>
              <td className={styles.cell}>{r.nickname}</td>
              <td className={styles.cell}>{r.handicap}</td>
              <td className={styles.cell} style={{ color: 'blue' }}>{r.score}</td>
              <td className={styles.cell} style={{ color: 'red' }}>{r.result}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className={styles.footerLabel}>합계</td>
            <td className={styles.footerValue}>{fbResult.sumHandicap}</td>
            <td className={styles.footerValue}>{fbResult.sumScore}</td>
            <td className={styles.footerResult}>{fbResult.sumResult}</td>
          </tr>
        </tfoot>
      </table>

      {/* 팀결과표 */}
      <h3 className={styles.sectionTitle}>📋 팀결과표</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.header}>팀</th>
            <th className={styles.header}>닉네임</th>
            <th className={styles.header}>G핸디</th>
            <th className={styles.header}>점수</th>
            <th className={styles.header}>결과</th>
            <th className={styles.header}>총점</th>
          </tr>
        </thead>
        <tbody>
          {/* 팀 A */}
          <tr className={styles.fixedRow}>
            <td rowSpan={2} className={styles.cell}>팀 A</td>
            <td className={styles.cell}>{tA.rows[0].n}</td>
            <td className={styles.cell}>{tA.rows[0].h}</td>
            <td className={styles.cell} style={{ color: 'blue' }}>{tA.rows[0].s}</td>
            <td className={styles.cell} style={{ color: 'red' }}>{tA.rows[0].r}</td>
            <td rowSpan={2} className={styles.footerResult}>{tA.sumResult}</td>
          </tr>
          <tr className={styles.fixedRow}>
            <td className={styles.cell}>{tA.rows[1].n}</td>
            <td className={styles.cell}>{tA.rows[1].h}</td>
            <td className={styles.cell} style={{ color: 'blue' }}>{tA.rows[1].s}</td>
            <td className={styles.cell} style={{ color: 'red' }}>{tA.rows[1].r}</td>
          </tr>

          {/* 팀 B */}
          <tr className={styles.fixedRow}>
            <td rowSpan={2} className={styles.cell}>팀 B</td>
            <td className={styles.cell}>{tB.rows[0].n}</td>
            <td className={styles.cell}>{tB.rows[0].h}</td>
            <td className={styles.cell} style={{ color: 'blue' }}>{tB.rows[0].s}</td>
            <td className={styles.cell} style={{ color: 'red' }}>{tB.rows[0].r}</td>
            <td rowSpan={2} className={styles.footerResult}>{tB.sumResult}</td>
          </tr>
          <tr className={styles.fixedRow}>
            <td className={styles.cell}>{tB.rows[1].n}</td>
            <td className={styles.cell}>{tB.rows[1].h}</td>
            <td className={styles.cell} style={{ color: 'blue' }}>{tB.rows[1].s}</td>
            <td className={styles.cell} style={{ color: 'red' }}>{tB.rows[1].r}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
