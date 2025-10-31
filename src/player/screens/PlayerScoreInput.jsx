// /src/player/screens/PlayerScoreInput.jsx

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, setDoc, onSnapshot, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../firebase';
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

// 규칙 통과(memberships) 보조
async function ensureMembership(eventId, myRoom) {
  try {
    const uid = auth?.currentUser?.uid || null;
    if (!uid || !eventId || !myRoom) return;
    const ref = doc(db, 'events', eventId, 'memberships', uid);
    await setDoc(ref, { room: myRoom }, { merge: true });
  } catch (e) {
    console.warn('ensureMembership failed', e);
  }
}

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

  useEffect(() => {
    if (eventId && myRoom) { ensureMembership(eventId, myRoom); }
  }, [eventId, myRoom]);

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

  // 실시간 점수 맵 { [pid]: score }
  const [scoresMap, setScoresMap] = useState({});
  useEffect(() => {
    if (!eventId) return;
    const colRef = collection(db, 'events', eventId, 'scores');
    const unsub = onSnapshot(colRef, (snap) => {
      const m = {};
      snap.forEach((d) => {
        const data = d.data() || {};
        m[String(d.id)] = data.score == null ? null : data.score;
      });
      setScoresMap(m);
    });
    return unsub;
  }, [eventId]);

  // ★ 기준 스냅샷 & 현재 입력
  const [baseDraft, setBaseDraft] = useState({});
  const [draft, setDraft] = useState({});
  const bootstrappedRef = useRef(false); // 최초 1회 플래그
  const [hasEdited, setHasEdited] = useState(false); // ★ 입력 발생 여부

  // 기준 스냅샷 생성
  useEffect(() => {
    const base = {};
    orderedRoomPlayers.forEach((p) => {
      const key = String(p.id);
      const baseScore = (scoresMap[key] != null ? scoresMap[key] : p.score);
      base[key] = (baseScore == null || baseScore === 0) ? '' : String(baseScore);
    });
    setBaseDraft(base);

    // ★ fix: 재진입/저장 직후(hasEdited=false)에는 저장된 값을 드래프트로 동기화
    if (!bootstrappedRef.current || !hasEdited) {
      setDraft(base);
      bootstrappedRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedRoomPlayers, scoresMap, hasEdited]);

  // Dirty 계산
  const isReady = useMemo(
    () => Object.keys(baseDraft).length > 0 && orderedRoomPlayers.length > 0,
    [baseDraft, orderedRoomPlayers.length]
  );
  const isDirty = useMemo(() => {
    const keys = Object.keys(baseDraft);
    if (!keys.length) return false;
    for (const k of keys) {
      if ((draft[k] ?? '') !== (baseDraft[k] ?? '')) return true;
    }
    return false;
  }, [baseDraft, draft]);

  const onChangeScore = (pid, val) => {
    const clean = String(val ?? '').replace(/[^\d\-+.]/g, '');
    setDraft((d) => ({ ...d, [String(pid)]: clean }));
    setHasEdited(true); // ★ fix: 실제 편집 표시
  };

  const saveScoresDraft = async () => {
    if (!eventId) return;
    try{
      await ensureMembership(eventId, myRoom);
      const ops = [];

      orderedRoomPlayers.forEach((p) => {
        const key = String(p.id);
        const raw = draft[key];
        const before = baseDraft[key] ?? '';
        if (raw === undefined || String(raw) === String(before)) return;

        const newScore = toNumberOrNull(raw);
        const ref = doc(db, 'events', eventId, 'scores', key);
        ops.push(setDoc(ref, { room: myRoom, score: newScore, updatedAt: serverTimestamp() }, { merge: true }));
      });

      await Promise.all(ops);

      // 저장 후 스냅샷 승격 → dirty 해제
      setBaseDraft((prev) => {
        const next = { ...prev };
        orderedRoomPlayers.forEach((p) => {
          const key = String(p.id);
          if (draft[key] !== undefined) next[key] = draft[key] ?? '';
        });
        return next;
      });
      setHasEdited(false); // ★ fix: 저장 완료 → 편집 플래그 리셋

      alert('저장되었습니다.');
    }catch(e){
      console.error('saveScoresDraft failed', e);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const inputRefs = useRef({});
  const holdMapRef = useRef({});
  const LONG_PRESS_MS = 1000;
  const MOVE_CANCEL_PX = 10;

  const ensureMap = (pid) => {
    const key = String(pid);
    if (!holdMapRef.current[key]) holdMapRef.current[key] = { timer: null, x: 0, y: 0, fired: false };
    return holdMapRef.current[key];
  };
  const startHold = (pid, e) => {
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
        if (cur.startsWith('-')) return d;
        const next = { ...d, [key]: cur ? `-${cur}` : '-' };
        requestAnimationFrame(() => {
          const el = inputRefs.current[key];
          if (el && typeof el.setSelectionRange === 'function') {
            const end = (next[key] || '').length;
            try { el.setSelectionRange(end, end); } catch {}
          }
          try { if (navigator.vibrate) navigator.vibrate(10); } catch {}
        });
        return next;
      });
      setHasEdited(true); // ★ fix: 길게 눌러 부호 변경도 편집으로 간주
    }, LONG_PRESS_MS);
  };
  const moveHold = (pid, e) => {
    const m = ensureMap(pid);
    if (!m.timer) return;
    const dx = Math.abs((e.clientX ?? 0) - (m.x ?? 0));
    const dy = Math.abs((e.clientY ?? 0) - (m.y ?? 0));
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) { clearTimeout(m.timer); m.timer = null; }
  };
  const endHold = (pid) => {
    const m = ensureMap(pid);
    if (m.timer) { clearTimeout(m.timer); m.timer = null; }
  };
  const preventContextMenu = (e) => { e.preventDefault(); };

  const totals = useMemo(() => {
    let sumH = 0, sumS = 0, sumR = 0;
    orderedRoomPlayers.forEach((p) => {
      const key = String(p.id);
      const s = toNumberOrNull(draft[key]);
      const h = Number(p.handicap || 0);
      sumH += h;
      sumS += (s ?? 0);
      sumR += (s ?? 0) - h;
    });
    return { sumH, sumS, sumR };
  }, [orderedRoomPlayers, draft]);

  // ★ fix: 드래프트 미준비 시 항상 비활성(초기 깜빡임 제거)
  const hasDraftKeys = Object.keys(draft).length > 0;
  const saveDisabled = !(isReady && hasDraftKeys && (isDirty || hasEdited));

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
                const raw = draft[key] ?? '';
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
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9.+\\-]*"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        className={styles.cellInput}
                        value={raw}
                        onChange={(e) => onChangeScore(p.id, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        onPointerDown={(e) => startHold(p.id, e)}
                        onPointerUp={() => endHold(p.id)}
                        onPointerCancel={() => endHold(p.id)}
                        onPointerLeave={() => endHold(p.id)}
                        onPointerMove={(e) => moveHold(p.id, e)}
                        onContextMenu={preventContextMenu}
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

        <button
          className={`${styles.navBtn}`}
          onClick={saveScoresDraft}
          disabled={saveDisabled}
          aria-disabled={saveDisabled}
          style={saveDisabled
            ? { opacity: 0.5, pointerEvents: 'none' }
            : { boxShadow: '0 0 0 2px rgba(59,130,246,.35) inset', fontWeight: 600 }
          }
        >
          저장
        </button>

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
