// /src/player/screens/PlayerScoreInput.jsx
// 변경 요약
// - [FIX] 점수 입력칸에서 ± 버튼을 제거하고, 입력칸만 남김(기존 UI 복귀)
// - [ADD] 입력칸을 1초 이상 길게 누르면 자동으로 '−'(마이너스) 기호가 앞에 붙도록 Long-Press 제스처 추가
//         (iOS의 숫자패드에 '-' 키가 없는 상황 보완)
// - [FIX] 입력 type="text" + inputMode="decimal" + pattern 유지(안드로이드/아이폰 모두 안정적으로 '.' 가능)
// - [ADD] 길게 누르는 동안 시스템 컨텍스트 메뉴가 뜨지 않도록 onContextMenu 방지
// - 나머지 계산/합계/정렬/게이트/레이아웃 로직은 기존 그대로 유지

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { PlayerContext } from '../../contexts/PlayerContext';
import { EventContext } from '../../contexts/EventContext';
import styles from './PlayerScoreInput.module.css';

function normalizeGate(raw){
  if (!raw || typeof raw !== 'object') return { steps:{}, step1:{ teamConfirmEnabled:true } };
  const g = { ...raw };
  const steps = g.steps || {};
  const out = { steps:{}, step1:{ ...(g.step1 || {}) } };
  for (let i=1;i<=8;i+=1) out.steps[i] = steps[i] || 'enabled';
  if (typeof out.step1.teamConfirmEnabled !== 'boolean') out.step1.teamConfirmEnabled = true;
  return out;
}
function pickGateByMode(playerGate, mode){
  const isFour = (mode === 'fourball' || mode === 'agm');
  const nested = isFour ? playerGate?.fourball : playerGate?.stroke;
  const base = nested && typeof nested === 'object' ? nested : playerGate;
  return normalizeGate(base);
}
function tsToMillis(ts){
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1e6;
  return Number(ts) || 0;
}

const asArray = (v) => Array.isArray(v) ? v : [];
const toSafeParticipants = (arr) =>
  asArray(arr)
    .filter(Boolean)
    .map((p) => ({ ...p, id: p?.id ?? p?.pid ?? p?.uid ?? p?._id ?? null }))
    .filter((p) => p.id != null);

function orderByPair(list) {
  const slot = [null, null, null, null];
  const used = new Set();
  const asNum = (v) => Number(v ?? NaN);
  const half = Math.floor((list || []).length / 2) || 0;

  (list || [])
    .filter((p) => Number.isFinite(asNum(p?.id)) && asNum(p.id) < half)
    .forEach((p1) => {
      const id1 = asNum(p1.id);
      if (used.has(id1)) return;
      const p2 = (list || []).find((x) => String(x?.id) === String(p1?.partner));
      if (p2) {
        const pos = slot[0] ? 2 : 0;
        slot[pos] = p1;
        slot[pos + 1] = p2;
        used.add(id1); used.add(asNum(p2.id));
      }
    });

  (list || []).forEach((p) => {
    const id = asNum(p?.id);
    if (!used.has(id)) {
      const i = slot.findIndex((s) => s === null);
      if (i >= 0) { slot[i] = p; used.add(id); }
    }
  });

  for (let i = 0; i < 4; i += 1) {
    if (!slot[i]) slot[i] = { id: `empty-${i}`, nickname: '', handicap: '', score: null, __empty: true };
  }
  return slot.slice(0, 4);
}

const toNumberOrNull = (v) => {
  if (v === '' || v == null) return null;
  if (v === '-' || v === '+') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function PlayerScoreInput() {
  const {
    eventId: ctxEventId,
    participants = [],
    participant,
    roomNames = [],
  } = useContext(PlayerContext);

  const { eventData } = useContext(EventContext) || {};
  const params = useParams();
  const routeEventId = params?.eventId || params?.id;
  const eventId = ctxEventId || routeEventId;

  const [fallbackGate, setFallbackGate] = useState(null);
  const [fallbackAt, setFallbackAt] = useState(0);

  useEffect(() => {
    if (!eventId) return;
    const ref = doc(db, 'events', eventId);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      if (d?.playerGate) {
        setFallbackGate(d.playerGate);
        setFallbackAt(tsToMillis(d?.gateUpdatedAt));
      }
    });
    return unsub;
  }, [eventId]);

  const latestGate = useMemo(() => {
    const mode = (eventData?.mode === 'fourball' ? 'fourball' : 'stroke');
    const ctxG = pickGateByMode(eventData?.playerGate || {}, mode);
    const ctxAt = tsToMillis(eventData?.gateUpdatedAt);
    const fbG   = pickGateByMode(fallbackGate || {}, mode);
    const fbAt  = fallbackAt;
    return (ctxAt >= fbAt) ? ctxG : fbG;
  }, [eventData?.playerGate, eventData?.gateUpdatedAt, eventData?.mode, fallbackGate, fallbackAt]);

  const nextDisabled = (latestGate?.steps?.[5] !== 'enabled');

  const myRoom = participant?.room ?? null;
  const roomLabel =
    myRoom && roomNames[myRoom - 1]?.trim()
      ? roomNames[myRoom - 1].trim()
      : myRoom
      ? `${myRoom}번방`
      : '';

  const roomPlayers = useMemo(
    () => (myRoom ? toSafeParticipants(participants).filter((p) => (p?.room ?? null) === myRoom) : []),
    [participants, myRoom]
  );
  const orderedRoomPlayers = useMemo(() => orderByPair(roomPlayers), [roomPlayers]);

  useEffect(() => {
    try {
      const a = orderedRoomPlayers;
      if (Array.isArray(a)) {
        const safe = a.filter((p) => !!p && typeof p === 'object' && p.id != null);
        Object.defineProperty(a, 'forEach', {
          configurable: true,
          writable: true,
          value: function (cb, thisArg) { return safe.forEach(cb, thisArg); }
        });
      }
    } catch {}
  }, [orderedRoomPlayers]);

  const paddedRows = useMemo(() => {
    const rows = [...orderedRoomPlayers];
    while (rows.length < 4) {
      rows.push({ id: `empty-${rows.length}`, nickname: '', handicap: '', score: null, __empty: true });
    }
    return rows;
  }, [orderedRoomPlayers]);

  const [draft, setDraft] = useState({});
  useEffect(() => {
    setDraft((prev) => {
      const next = { ...prev };
      orderedRoomPlayers.forEach((p) => {
        const key = String(p.id);
        if (next[key] === undefined) {
          const base = (p.score == null || p.score === 0) ? '' : String(p.score);
          next[key] = base;
        }
      });
      return next;
    });
  }, [orderedRoomPlayers]);

  const persistScore = async (pid, valueStr) => {
    if (!eventId) return;
    const newScore = toNumberOrNull(valueStr);

    const next = toSafeParticipants(participants).map((p) =>
      String(p?.id) === String(pid) ? { ...p, score: newScore } : p
    );

    const payload = (function sanitize(v) {
      if (Array.isArray(v)) return v.map(sanitize);
      if (v && typeof v === 'object') {
        const out = {};
        for (const k of Object.keys(v)) {
          const val = v[k];
          if (val === undefined) continue;
          if (typeof val === 'number' && Number.isNaN(val)) { out[k] = null; continue; }
          out[k] = sanitize(val);
        }
        return out;
      }
      if (typeof v === 'number' && Number.isNaN(v)) return null;
      return v;
    })({ participants: next });

    await setDoc(doc(db, 'events', eventId), payload, { merge: true });
  };

  const onChangeScore = (pid, val) => {
    // [FIX] '.', '-' 허용 + 중간 상태 유지(iOS에서 깜빡임 방지)
    const clean = String(val ?? '').replace(/[^\d\-+.]/g, '');
    setDraft((d) => ({ ...d, [String(pid)]: clean }));
    if (clean === '') persistScore(pid, '');
  };
  const onCommitScore = (pid) => persistScore(pid, draft[String(pid)]);

  // ===== [ADD] Long Press 로 '-' 자동 입력 =====
  const inputRefs = useRef({});              // 각 입력칸 ref
  const holdMapRef = useRef({});             // { [pid]: { timer, x, y, fired } }
  const LONG_PRESS_MS = 1000;                // 1초 이상 길게 눌렀을 때만 발동
  const MOVE_CANCEL_PX = 10;                 // 손가락이 크게 움직이면 롱프레스 취소

  const ensureMap = (pid) => {
    const key = String(pid);
    if (!holdMapRef.current[key]) holdMapRef.current[key] = { timer: null, x: 0, y: 0, fired: false };
    return holdMapRef.current[key];
  };

  const startHold = (pid, e) => {
    // iOS 컨텍스트 메뉴 방지
    if (e && typeof e.preventDefault === 'function') {
      // 입력 포커스는 유지해야 하므로 pointerdown의 기본동작은 막지 않음
    }
    const m = ensureMap(pid);
    m.fired = false;
    m.x = (e && 'clientX' in e) ? e.clientX : 0;
    m.y = (e && 'clientY' in e) ? e.clientY : 0;
    if (m.timer) clearTimeout(m.timer);
    m.timer = setTimeout(() => {
      m.fired = true;
      setDraft((d) => {
        const key = String(pid);
        const cur = String(d[key] ?? '');
        if (cur.startsWith('-')) return d; // 이미 음수면 그대로
        const next = { ...d, [key]: cur ? `-${cur}` : '-' };
        // 커서를 끝으로 이동 (시각적 부자연스러움 방지)
        requestAnimationFrame(() => {
          const el = inputRefs.current[key];
          if (el && typeof el.setSelectionRange === 'function') {
            const end = (next[key] || '').length;
            try { el.setSelectionRange(end, end); } catch {}
          }
          // (선택) 진동 피드백
          try { if (navigator.vibrate) navigator.vibrate(10); } catch {}
        });
        return next;
      });
    }, LONG_PRESS_MS);
  };
  const moveHold = (pid, e) => {
    const m = ensureMap(pid);
    if (!m.timer) return;
    const dx = Math.abs((e.clientX ?? 0) - (m.x ?? 0));
    const dy = Math.abs((e.clientY ?? 0) - (m.y ?? 0));
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
      clearTimeout(m.timer); m.timer = null;
    }
  };
  const endHold = (pid) => {
    const m = ensureMap(pid);
    if (m.timer) { clearTimeout(m.timer); m.timer = null; }
  };

  // 컨텍스트 메뉴(길게 눌렀을 때 뜨는 시스템 메뉴) 방지
  const preventContextMenu = (e) => { e.preventDefault(); };

  const totals = useMemo(() => {
    let sumH = 0, sumS = 0, sumR = 0;
    orderedRoomPlayers.forEach((p) => {
      const s = toNumberOrNull(draft[String(p.id)] ?? ((p.score == null) ? '' : p.score));
      const h = Number(p.handicap || 0);
      sumH += h;
      sumS += (s ?? 0);
      sumR += (s ?? 0) - h;
    });
    return { sumH, sumS, sumR };
  }, [orderedRoomPlayers, draft]);

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
                const raw =
                  draft[key] ?? (p.score == null ? '' : (p.score === 0 ? '' : String(p.score)));
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
                      {/* [FIX] 기존과 동일 UI(± 버튼 제거) + [ADD] Long-Press 제스처 */}
                      <input
                        // 숫자 입력 호환(기존과 동일한 시각/레이아웃)
                        type="text"                 // [FIX] Android/iOS 호환을 위해 text 유지
                        inputMode="decimal"         // [FIX] iOS에서 소수점 표시
                        pattern="[0-9.\\-+]*"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        className={styles.cellInput}
                        value={raw}
                        onChange={(e) => onChangeScore(p.id, e.target.value)}
                        onBlur={() => onCommitScore(p.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}

                        // [ADD] Long-Press 핸들러
                        onPointerDown={(e) => startHold(p.id, e)}
                        onPointerUp={() => endHold(p.id)}
                        onPointerCancel={() => endHold(p.id)}
                        onPointerLeave={() => endHold(p.id)}
                        onPointerMove={(e) => moveHold(p.id, e)}
                        onContextMenu={preventContextMenu} // 시스템 메뉴 억제

                        // 입력칸 ref (커서 위치 복구용)
                        ref={(el) => {
                          if (el) inputRefs.current[key] = el;
                          else delete inputRefs.current[key];
                        }}
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

      <div className={styles.footerNav}>
        <Link to={`/player/home/${eventId}/3`} className={`${styles.navBtn} ${styles.navPrev}`}>이전</Link>
        <Link
          to={nextDisabled ? '#' : `/player/home/${eventId}/5`}
          className={`${styles.navBtn} ${styles.navNext}`}
          onClick={(e)=>{ if (nextDisabled) { e.preventDefault(); e.stopPropagation(); } }}
          aria-disabled={nextDisabled}
          data-disabled={nextDisabled ? '1' : '0'}
          style={{ opacity: nextDisabled ? 0.5 : 1, pointerEvents: nextDisabled ? 'none' : 'auto' }}
          tabIndex={nextDisabled ? -1 : 0}
        >
          다음
        </Link>
      </div>
    </div>
  );
}
