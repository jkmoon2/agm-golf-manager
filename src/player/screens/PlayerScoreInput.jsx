// /src/player/screens/PlayerScoreInput.jsx
// 변경 요약
// 1) '0'을 입력했을 때도 다시 들어오면 그대로 "0"이 보이도록 처리
//    - draft 초기화 및 raw fallback에서 (p.score === 0) 를 더 이상 공백으로 바꾸지 않음
//    - 나머지 로직/레이아웃은 그대로 유지

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { PlayerContext } from '../../contexts/PlayerContext';
import styles from './PlayerScoreInput.module.css';

// ★ patch: 1조+2조 한 팀(슬롯0·1), 1조+2조 한 팀(슬롯2·3) 순으로 정렬
function orderByPair(list) {
  const slot = [null, null, null, null];
  const used = new Set();
  const asNum = (v) => Number(v ?? NaN);
  const half = Math.floor((list || []).length / 2) || 0;

  // id < half 를 1조로 보고 partner와 짝지음
  (list || [])
    .filter((p) => Number.isFinite(asNum(p?.id)) && asNum(p.id) < half)
    .forEach((p1) => {
      const id1 = asNum(p1.id);
      if (used.has(id1)) return;
      const p2 = (list || []).find((x) => String(x?.id) === String(p1?.partner));
      if (p2) {
        const pos = slot[0] ? 2 : 0;
        slot[pos] = p1; slot[pos + 1] = p2;
        used.add(id1); used.add(asNum(p2.id));
      }
    });

  // 남은 사람은 순서대로 채움
  (list || []).forEach((p) => {
    const id = asNum(p?.id);
    if (!used.has(id)) {
      const i = slot.findIndex((s) => s === null);
      if (i >= 0) { slot[i] = p; used.add(id); }
    }
  });

  while (slot.length < 4) slot.push({ id: `empty-${slot.length}`, nickname: '', handicap: '', score: null, __empty: true });
  return slot.slice(0, 4);
}
const toNumberOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  if (v === '-' || v === '+') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function PlayerScoreInput() {
  const { eventId: ctxEventId, participants = [], participant, roomNames = [] } =
    useContext(PlayerContext);
  const { id: routeEventId } = useParams();
  const eventId = ctxEventId || routeEventId;

  const myRoom = participant?.room ?? null;
  const roomLabel =
    myRoom && roomNames[myRoom - 1]?.trim()
      ? roomNames[myRoom - 1].trim()
      : myRoom
      ? `${myRoom}번방`
      : '';

  const roomPlayers = useMemo(
    () => (myRoom ? participants.filter((p) => (p?.room ?? null) === myRoom) : []),
    [participants, myRoom]
  );

  // ★ patch: 페어 순서 고정 배열
  const orderedRoomPlayers = useMemo(() => orderByPair(roomPlayers), [roomPlayers]);

  // 4행 고정(공란 패딩)
  const paddedRows = useMemo(() => { /* ★ patch: orderedRoomPlayers 기반 */
    const rows = [...orderedRoomPlayers];
    while (rows.length < 4) {
      rows.push({ id: `empty-${rows.length}`, nickname: '', handicap: '', score: null, __empty: true });
    }
    return rows;
  }, [orderedRoomPlayers]);

  // 표시상 0 → '' 로 바꾸던 기존 로직을 제거 (0은 그대로 "0" 표기)
  const [draft, setDraft] = useState({});
  useEffect(() => {
    setDraft((prev) => {
      const next = { ...prev };
      orderedRoomPlayers.forEach((p) => {
        const key = String(p.id);
        if (next[key] === undefined) {
          // ✅ 0도 그대로 문자열 "0"로 초기화 (이전: 0이면 ''로 비움)
          next[key] = (p.score == null) ? '' : String(p.score);
        }
      });
      return next;
    });
  }, [orderedRoomPlayers]);

  // 저장
  const persistScore = async (pid, valueStr) => {
    if (!eventId) return;
    const newScore = toNumberOrNull(valueStr); // '' → null
    const next = participants.map((p) =>
      String(p.id) === String(pid) ? { ...p, score: newScore } : p
    );
    await setDoc(doc(db, 'events', eventId), { participants: next }, { merge: true });
  };

  const onChangeScore = (pid, val) => {
    const clean = val.replace(/[^\d\-+]/g, '');
    setDraft((d) => ({ ...d, [String(pid)]: clean }));
    if (clean === '') persistScore(pid, ''); // “한 번에 삭제”
  };
  const onCommitScore = (pid) => persistScore(pid, draft[String(pid)]);

  // 합계(표시는 ''여도 계산은 0)
  const totals = useMemo(() => {
    let sumH = 0, sumS = 0, sumR = 0;
    orderedRoomPlayers.forEach((p) => {
      const s = toNumberOrNull(draft[String(p.id)] ?? ((p.score == null) ? '' : p.score));
      const h = Number(p.handicap || 0);
      sumH += h;
      sumS += s ?? 0;
      sumR += (s ?? 0) - h;
    });
    return { sumH, sumS, sumR };
  }, [roomPlayers, draft]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {roomLabel && <div className={styles.roomTitle}>{roomLabel}</div>}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <colgroup>
              <col style={{ width: '35%' }} />
              <col style={{ width: '21.666%' }} />
              <col style={{ width: '21.666%' }} />
              <col style={{ width: '21.666%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className={styles.th}>닉네임</th>
                <th className={styles.th}>G핸디</th>
                <th className={styles.th}>점수</th>
                <th className={styles.th}>결과</th>
              </tr>
            </thead>
            <tbody>
              {paddedRows.map((p) => {
                if (p.__empty) {
                  return (
                    <tr key={p.id}>
                      <td className={`${styles.td} ${styles.nickCell}`} />
                      <td className={styles.td} />
                      <td className={`${styles.td} ${styles.scoreTd}`} />
                      <td className={`${styles.td} ${styles.resultTd}`} />
                    </tr>
                  );
                }

                const key = String(p.id);
                // ✅ 0도 표시: (p.score == null)인 경우만 ''
                const raw = draft[key] ?? ((p.score == null) ? '' : String(p.score));
                const s = toNumberOrNull(raw);
                const h = Number(p.handicap || 0);
                const r = (s ?? 0) - h;

                return (
                  <tr key={p.id}>
                    <td className={`${styles.td} ${styles.nickCell}`}>
                      <span className={styles.nick}>{p.nickname}</span>
                    </td>
                    <td className={styles.td}>
                      <span>{p.handicap}</span>
                    </td>
                    <td className={`${styles.td} ${styles.scoreTd}`}>
                      <input
                        inputMode="numeric"
                        className={styles.cellInput}
                        placeholder="입력"
                        value={raw}
                        onChange={(e) => onChangeScore(p.id, e.target.value)}
                        onBlur={() => onCommitScore(p.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      />
                    </td>
                    <td className={`${styles.td} ${styles.resultTd}`}>
                      <span className={styles.resultRed}>{r}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${styles.td} ${styles.totalLabel}`}>합계</td>
                <td className={`${styles.td} ${styles.totalBlack}`}>{totals.sumH}</td>
                <td className={`${styles.td} ${styles.totalBlue}`}>{totals.sumS}</td>
                <td className={`${styles.td} ${styles.totalRed}`}>{totals.sumR}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 하단 네비: 텍스트는 '이전' / '다음'만, 화살표는 CSS 의사요소에서 그립니다. */}
      <div className={styles.footerNav}>
        <Link to={`/player/home/${eventId}/3`} className={`${styles.navBtn} ${styles.navPrev}`}>이전</Link>
        <Link to={`/player/home/${eventId}/5`} className={`${styles.navBtn} ${styles.navNext}`}>다음</Link>
      </div>
    </div>
  );
}
