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

// 포볼 A/B/A/B 고정: group===1 + partner 매칭 기반
function isFourballMode(mode){ return mode === 'fourball' || mode === 'agm'; }
function resolveFourballPairOrder(allParticipants, myRoom){
  // room 내 pair 구성 (1조 + partner(2조))
  const ps = toSafeParticipants(allParticipants);
  const roomPlayers = ps.filter((p) => String(p.room ?? '') === String(myRoom ?? ''));

  // group 1 기준으로 partnerId / partnerUid / partnerPid 등 다양한 키 대응
  const group1 = roomPlayers.filter((p) => String(p.group) === '1' || p.group === 1);
  const group2 = roomPlayers.filter((p) => String(p.group) === '2' || p.group === 2);

  const g2ById = new Map(group2.map((p) => [String(p.id), p]));
  const g2ByUid = new Map(group2.map((p) => [String(p.uid ?? p.id), p]));
  const g2ByPid = new Map(group2.map((p) => [String(p.pid ?? p.id), p]));
  const takeG2 = (ref) => g2ById.get(String(ref)) || g2ByUid.get(String(ref)) || g2ByPid.get(String(ref));

  const used = new Set();
  const pairs = [];

  group1.forEach((p) => {
    const pid = p.partnerId ?? p.partnerUid ?? p.partnerPid ?? p.partner ?? p.partnerRef;
    const mate = pid != null ? takeG2(pid) : null;
    if (mate && !used.has(String(mate.id))) {
      used.add(String(mate.id));
      pairs.push([p, mate]);
    } else {
      pairs.push([p, null]);
    }
  });

  // 남은 2조
  const remain2 = group2.filter((p) => !used.has(String(p.id)));

  // 방에 4명인 경우: A/B/A/B 고정
  // pairs를 2개 단위로 묶어서 [A1,B1,A2,B2] 형태로 반환
  const out = [];
  const pairList = pairs.slice();
  while (pairList.length) {
    const [a1, b1] = pairList.shift();
    const [a2, b2] = pairList.shift() || [null, null];

    if (a1) out.push(a1);
    if (b1) out.push(b1);
    else if (remain2.length) out.push(remain2.shift());

    if (a2) out.push(a2);
    if (b2) out.push(b2);
    else if (remain2.length) out.push(remain2.shift());
  }

  // 혹시 4명보다 많거나 적어도 안전하게
  // roomPlayers 중 빠진 사람을 뒤에 붙임
  const seen = new Set(out.map((p) => String(p.id)));
  roomPlayers.forEach((p) => {
    if (!seen.has(String(p.id))) out.push(p);
  });

  return out;
}

function toNumberOrNull(val){
  const s = String(val ?? '').trim();
  if (s === '' || s === '-' || s === '+' || s === '.' || s === '+.' || s === '-.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function PlayerScoreInput(){
  const { eventId } = useParams();
  const { participants: ctxParticipants, myRoom, participantId, isAuthed, mode } = useContext(PlayerContext);
  const { eventData, ensureMembership } = useContext(EventContext);

  const [scores, setScores] = useState({});
  const [draft, setDraft] = useState({});
  const [baseDraft, setBaseDraft] = useState({});
  const [hasEdited, setHasEdited] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // gate 체크(기존 흐름 유지)
  const gate = useMemo(() => pickGateByMode(eventData?.playerGate, mode), [eventData?.playerGate, mode]);
  const step4State = gate?.steps?.[4] || 'enabled';
  const isLocked = (step4State === 'locked' || step4State === 'disabled');

  // roomLabel
  const roomLabel = useMemo(() => {
    if (!myRoom) return '';
    const r = String(myRoom);
    return `${r}번 방`;
  }, [myRoom]);

  const allParticipants = useMemo(() => {
    // ctxParticipants 우선, 없으면 eventData.participants fallback
    const a = asArray(ctxParticipants);
    if (a.length) return a;
    return asArray(eventData?.participants);
  }, [ctxParticipants, eventData?.participants]);

  const orderedRoomPlayers = useMemo(() => {
    if (!myRoom) return [];
    const ps = toSafeParticipants(allParticipants);

    if (isFourballMode(mode)) {
      return resolveFourballPairOrder(ps, myRoom);
    }

    // 스트로크: 원래 정렬(조/slot/이름 등) 최대 유지
    const roomPlayers = ps.filter((p) => String(p.room ?? '') === String(myRoom ?? ''));
    // slot 있으면 slot 기준, 아니면 group->nickname
    return roomPlayers.slice().sort((a,b) => {
      const sa = Number(a.slot ?? 9999);
      const sb = Number(b.slot ?? 9999);
      if (sa !== sb) return sa - sb;
      const ga = Number(a.group ?? 9999);
      const gb = Number(b.group ?? 9999);
      if (ga !== gb) return ga - gb;
      return String(a.nickname ?? '').localeCompare(String(b.nickname ?? ''), 'ko');
    });
  }, [allParticipants, myRoom, mode]);

  const paddedRows = useMemo(() => {
    const arr = orderedRoomPlayers.slice();
    while (arr.length < 4) arr.push({ __empty: true, id: `empty-${arr.length}` });
    return arr;
  }, [orderedRoomPlayers]);

  // step4(점수) 저장/표시: scores 컬렉션 사용
  useEffect(() => {
    if (!eventId || !myRoom || !isAuthed) return;

    const colRef = collection(db, 'events', eventId, 'scores');
    const unsub = onSnapshot(colRef, (snap) => {
      const next = {};
      snap.forEach((d) => {
        const data = d.data() || {};
        // 내 방만
        if (String(data.room ?? '') !== String(myRoom ?? '')) return;
        next[String(d.id)] = data;
      });
      setScores(next);
    }, (e) => {
      console.error('scores onSnapshot failed', e);
    });

    return () => unsub();
  }, [eventId, myRoom, isAuthed]);

  // 초기 draft 세팅(점수 스냅샷)
  useEffect(() => {
    if (!myRoom) return;
    const next = {};
    orderedRoomPlayers.forEach((p) => {
      const key = String(p.id);
      const s = scores[key]?.score;
      next[key] = (s === null || s === undefined) ? '' : String(s);
    });
    setDraft(next);
    setBaseDraft(next);
    setHasEdited(false);
    setIsReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRoom, orderedRoomPlayers.map((p)=>String(p.id)).join('|'), Object.keys(scores).join('|')]);

  const nextDisabled = useMemo(() => {
    // 잠금이면 다음(혹은 저장) 제어는 기존 정책 유지
    if (!isReady) return true;
    if (isLocked) return false;
    return false;
  }, [isReady, isLocked]);

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
    setHasEdited(true);
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
      setHasEdited(false);

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
  // ✅ Android(특히 크롬) 터치 시 미세 떨림/스크롤로 move가 쉽게 발생해
  // 기존 10px 기준이면 롱프레스 타이머가 자주 취소되는 케이스가 있어 여유 폭을 둠
  const TOUCH_MOVE_CANCEL_PX = 18;

  const getPoint = (e) => {
    // Pointer/Mouse
    if (e && typeof e.clientX === 'number' && typeof e.clientY === 'number') {
      return { x: e.clientX, y: e.clientY, pointerType: e.pointerType };
    }
    // Touch
    const t = e?.touches?.[0] || e?.changedTouches?.[0] || null;
    if (t) {
      return { x: t.clientX ?? 0, y: t.clientY ?? 0, pointerType: 'touch' };
    }
    return { x: 0, y: 0, pointerType: e?.pointerType };
  };

  const ensureMap = (pid) => {
    const key = String(pid);
    if (!holdMapRef.current[key]) holdMapRef.current[key] = { timer: null, x: 0, y: 0, fired: false, lastStartAt: 0, pointerType: null };
    return holdMapRef.current[key];
  };
  const startHold = (pid, e) => {
    const m = ensureMap(pid);
    // ✅ [PATCH] Android에서 input long-press 중 cancel이 나도 '-'가 안정적으로 입력되도록
    // 시작 시 입력칸을 확실히 focus(브라우저 제스처/선택 상태 안정화)
    const __el = inputRefs.current[String(pid)];
    try {
      if (__el && document.activeElement !== __el) __el.focus({ preventScroll: true });
    } catch {
      try { if (__el && document.activeElement !== __el) __el.focus(); } catch {}
    }
    // 일부 브라우저(특히 Android)에서 pointer/touch 이벤트가 거의 동시에 발생하는 경우가 있어 중복 시작을 방지
    const now = Date.now();
    if (m.lastStartAt && now - m.lastStartAt < 50) return;
    m.lastStartAt = now;
    m.fired = false;
    const pt = getPoint(e);
    m.pointerType = pt.pointerType || null;
    m.x = pt.x;
    m.y = pt.y;
    if (m.timer) clearTimeout(m.timer);
    m.timer = setTimeout(() => {
      m.fired = true;
      m.timer = null; // ✅ [PATCH] fired 이후 move/cancel에서 타이머가 잘못 취소되지 않게
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
      setHasEdited(true);
    }, LONG_PRESS_MS);
  };
  const moveHold = (pid, e) => {
    const m = ensureMap(pid);
    if (!m.timer) return;
    const pt = getPoint(e);
    const dx = Math.abs((pt.x ?? 0) - (m.x ?? 0));
    const dy = Math.abs((pt.y ?? 0) - (m.y ?? 0));
    const cancelPx = (m.pointerType === 'touch' || pt.pointerType === 'touch') ? TOUCH_MOVE_CANCEL_PX : MOVE_CANCEL_PX;
    if (dx > cancelPx || dy > cancelPx) { clearTimeout(m.timer); m.timer = null; }
  };
  const endHold = (pid) => {
    const m = ensureMap(pid);
    if (m.timer) { clearTimeout(m.timer); m.timer = null; }
  };

  const cancelHold = (pid, e) => {
    const m = ensureMap(pid);
    const pt = getPoint(e);
    const isTouch = (m.pointerType === 'touch' || pt.pointerType === 'touch');
    // ✅ [PATCH] Android Chrome은 long-press 중 touchcancel/pointercancel이 종종 발생함
    // 그때 endHold로 타이머를 지워버리면 '-'가 안 뜨므로, 터치 cancel은(미발생 시) 무시
    if (isTouch && !m.fired) return;
    endHold(pid);
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

  // 드래프트 미준비 시 항상 비활성(초기 깜빡임 제거)
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
                        // ✅ Android 일부 기기에서 input에 PointerEvent가 안정적으로 안 들어오거나
                        // 롱프레스 도중 pointercancel이 발생하는 케이스가 있어 touch/mouse 백업도 함께 둠
                        onPointerDown={(e) => startHold(p.id, e)}
                        onPointerUp={() => endHold(p.id)}
                        onPointerCancel={(e) => cancelHold(p.id, e)}
                        onPointerLeave={() => endHold(p.id)}
                        onPointerMove={(e) => moveHold(p.id, e)}
                        onTouchStart={(e) => startHold(p.id, e)}
                        onTouchEnd={() => endHold(p.id)}
                        onTouchCancel={(e) => cancelHold(p.id, e)}
                        onTouchMove={(e) => moveHold(p.id, e)}
                        onMouseDown={(e) => startHold(p.id, e)}
                        onMouseUp={() => endHold(p.id)}
                        onMouseLeave={() => endHold(p.id)}
                        onMouseMove={(e) => moveHold(p.id, e)}
                        onContextMenu={preventContextMenu}
                        style={{ touchAction: 'manipulation' }}
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
            : { boxShadow: '0 0 0 2px rgba(59,130,246,.35) inset, 0 2px 6px rgba(0,0,0,.05)', fontWeight: 600 }
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
