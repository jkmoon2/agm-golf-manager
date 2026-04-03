// /src/player/screens/PlayerRoomTable.jsx
// ※ 기존 레이아웃/스타일/버튼 문구는 100% 유지하고,
//    "다음" 버튼이 비활성일 때 시각/포인터도 확실히 막히도록 style/data-attr만 추가했습니다.

import React, { useContext, useMemo, useRef, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import styles from './PlayerRoomTable.module.css';
import { EventContext } from '../../contexts/EventContext';
import useEffectivePlayerEventData from '../hooks/useEffectivePlayerEventData';
// ★ patch: Firestore 실시간 구독 import는 반드시 최상단
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';


function getPlayerTabId(){
  try {
    if (!window.name || !window.name.startsWith('AGM_PLAYER_TAB_')) {
      window.name = `AGM_PLAYER_TAB_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    }
    return window.name;
  } catch {
    return 'AGM_PLAYER_TAB_FALLBACK';
  }
}
function playerStorageKey(eventId, key){
  return `agm:player:${getPlayerTabId()}:${eventId || 'noevent'}:${key}`;
}


function getEffectiveParticipants(eventData){
  const safeArr = (v) => (Array.isArray(v) ? v : []);
  const mode = (eventData?.mode === 'fourball' || eventData?.mode === 'agm') ? 'fourball' : 'stroke';
  const field = (mode === 'fourball') ? 'participantsFourball' : 'participantsStroke';
  const primary = safeArr(eventData?.[field]);
  const legacy = safeArr(eventData?.participants);
  if (!primary.length) {
    return legacy.map((p, i) => {
      const obj = (p && typeof p === 'object') ? p : {};
      const room = (obj?.room ?? obj?.roomNumber ?? null);
      return { ...obj, id: obj?.id ?? i, room, roomNumber: room };
    });
  }
  const map = new Map();
  legacy.forEach((p, i) => {
    const obj = (p && typeof p === 'object') ? p : {};
    const id = String(obj?.id ?? i);
    map.set(id, { ...(map.get(id) || {}), ...obj });
  });
  primary.forEach((p, i) => {
    const obj = (p && typeof p === 'object') ? p : {};
    const id = String(obj?.id ?? i);
    map.set(id, { ...(map.get(id) || {}), ...obj });
  });
  return Array.from(map.values()).map((p, i) => {
    const obj = (p && typeof p === 'object') ? p : {};
    const room = (obj?.room ?? obj?.roomNumber ?? null);
    return { ...obj, id: obj?.id ?? i, room, roomNumber: room };
  });
}

// ★ patch: gate helpers + ts
function normalizeGate(raw){
  if (!raw || typeof raw !== 'object') return { steps:{}, step1:{ teamConfirmEnabled:true } };
  const g = { ...raw }; const steps = g.steps || {};
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

const MAX_PER_ROOM = 4;

function getHandi(p) {
  if (!p || typeof p !== 'object') return 0;
  const keys = ['handicap', 'gHandicap', 'g_handicap', 'g-handicap', 'gh', 'gH', 'G핸디', 'g핸디'];
  for (const k of keys) {
    if (k in p) {
      const v = p[k];
      const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function nickLen(s) {
  const str = String(s || '');
  const hasKo = /[가-힣]/.test(str);
  return Math.max(1, Math.min(40, hasKo ? Math.ceil(str.length * 1.2) : str.length));
}

/** Admin publicView.hiddenRooms 보정(0/1 기반 자동판별 → index Set) */
function normalizeHiddenRooms(pv, roomCount, viewKey) {
  let arr = [];
  if (pv && Array.isArray(pv.hiddenRooms)) {
    arr = pv.hiddenRooms;
  } else if (pv && pv[viewKey] && Array.isArray(pv[viewKey].hiddenRooms)) {
    arr = pv[viewKey].hiddenRooms;
  }
  const nums = arr.map(Number).filter(Number.isFinite);
  if (!nums.length) return new Set();

  // 1-based로 보이는지 판별
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const looksOneBased =
    min >= 1 && max <= roomCount || nums.some(v => v === 1 || v === roomCount);

  const idxs = looksOneBased ? nums.map(v => v - 1) : nums.slice();
  const filtered = idxs.filter(i => i >= 0 && i < roomCount);
  return new Set(filtered);
}

/** 1조/2조 페어 슬롯 배치 (Admin STEP8과 동일 규칙: group 사용) */
function orderSlotsByPairs(roomArr = []) {
  const slot = [null, null, null, null];
  const used = new Set();

  const pairs = [];
  roomArr
    .filter(p => Number(p?.group) === 1)
    .forEach(p1 => {
      if (used.has(p1.id)) return;
      const partner = roomArr.find(x => x.id === p1.partner);
      if (partner && !used.has(partner.id)) {
        pairs.push([p1, partner]);
        used.add(p1.id);
        used.add(partner.id);
      }
    });

  pairs.forEach((pair, idx) => {
    if (idx === 0) { slot[0] = pair[0]; slot[1] = pair[1]; }
    else if (idx === 1) { slot[2] = pair[0]; slot[3] = pair[1]; }
  });

  roomArr.forEach(p => {
    if (!used.has(p.id)) {
      const empty = slot.findIndex(v => v === null);
      if (empty >= 0) { slot[empty] = p; used.add(p.id); }
    }
  });

  while (slot.length < MAX_PER_ROOM) slot.push(null);
  return slot.slice(0, MAX_PER_ROOM);
}

function buildRoomMatrix(participants, roomNames) {
  const map = new Map();
  for (let i = 1; i <= roomNames.length; i++) map.set(i, []);
  for (const p of participants || []) {
    const r = Number(p?.room);
    if (Number.isFinite(r) && map.has(r)) map.get(r).push(p);
  }
  const matrices = [];
  const sums = [];
  for (let i = 0; i < roomNames.length; i++) {
    const list = map.get(i + 1) || [];
    const ordered = orderSlotsByPairs(list);
    let sum = 0;
    for (const p of list) sum += getHandi(p);
    matrices.push(ordered);
    sums.push(sum);
  }
  return { matrices, sums };
}

export default function PlayerRoomTable() {
  const navigate = useNavigate();
  const { eventId: paramId } = useParams();
  const { eventId: ctxId, loadEvent } = useContext(EventContext) || {};
  const eventData = useEffectivePlayerEventData();

  // ★ patch: 실시간 게이트 구독 + 최신판 선택
  const [fallbackGate, setFallbackGate] = useState(null);
  const [fallbackAt, setFallbackAt] = useState(0);
  useEffect(() => {
    const id = paramId || ctxId;
    if (!id) return;
    const ref = doc(db, 'events', id);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      if (d?.playerGate) {
        setFallbackGate(d.playerGate);
        setFallbackAt(tsToMillis(d?.gateUpdatedAt));
      }
    });
    return unsub;
  }, [paramId, ctxId]);

  const latestGate = useMemo(() => {
    const mode = ((eventData?.mode === 'fourball' || eventData?.mode === 'agm') ? 'fourball' : 'stroke');
    const ctxG = pickGateByMode(eventData?.playerGate || {}, mode);
    const ctxAt = tsToMillis(eventData?.gateUpdatedAt);
    const fbG  = pickGateByMode(fallbackGate || {}, mode);
    const fbAt = fallbackAt;
    return (ctxAt >= fbAt) ? ctxG : fbG;
  }, [eventData?.playerGate, eventData?.gateUpdatedAt, eventData?.mode, fallbackGate, fallbackAt]);

  // ★ patch: 다음 단계(STEP3) 버튼 상태
  const nextDisabled = (latestGate?.steps?.[3] !== 'enabled');

  // URL의 :eventId -> 컨텍스트 동기화
  useEffect(() => {
    if (paramId && paramId !== ctxId && typeof loadEvent === 'function') {
      loadEvent(paramId);
    }
  }, [paramId, ctxId, loadEvent]);

  // myRoom을 항상 로컬스토리지에 반영
  useEffect(() => {
    const candidates = [
      eventData?.myRoom,
      eventData?.player?.room,
      eventData?.auth?.room,
      eventData?.currentRoom,
    ];
    const roomNo = candidates.map((v) => Number(v)).find((n) => Number.isFinite(n) && n >= 1);
    if (Number.isFinite(roomNo)) {
      try { localStorage.setItem(playerStorageKey(paramId, 'currentRoom'), String(roomNo)); } catch {}
    }
  }, [eventData?.myRoom, eventData?.player, eventData?.auth, eventData?.currentRoom, paramId]);

  const roomNames = useMemo(() => {
    if (Array.isArray(eventData?.roomNames) && eventData.roomNames.length) {
      return eventData.roomNames.map((v) => String(v ?? ''));
    }
    const cnt = Number(eventData?.roomCount || 0);
    return Number.isFinite(cnt) && cnt > 0
      ? Array.from({ length: cnt }, (_, i) => `${i + 1}번방`)
      : [];
  }, [eventData]);

  const participants = useMemo(
    () => getEffectiveParticipants(eventData),
    [eventData?.mode, eventData?.participants, eventData?.participantsStroke, eventData?.participantsFourball]
  );

  // Admin의 선택(숨김 방) 복원 – 루트/모드별/0·1기반 혼용 모두 흡수
  const hiddenRooms = useMemo(() => {
    const pvRaw = eventData?.publicView || {};
    const mode = (eventData?.mode === 'fourball' || eventData?.mode === 'agm') ? 'fourball' : 'stroke';
    return normalizeHiddenRooms(pvRaw, roomNames.length, mode);
  }, [eventData?.publicView, eventData?.mode, roomNames.length]);

  const { matrices: byRoom, sums: roomHandiSums } = useMemo(
    () => buildRoomMatrix(participants, roomNames),
    [participants, roomNames]
  );

  const maxNick = useMemo(() => {
    let m = 6;
    for (const arr of byRoom) for (const p of arr) if (p) m = Math.max(m, nickLen(p.nickname));
    return Math.max(6, Math.min(40, m));
  }, [byRoom]);

  const visibleCols = useMemo(
    () => roomNames.reduce((acc, _, i) => acc + (hiddenRooms.has(i) ? 0 : 1), 0),
    [roomNames, hiddenRooms]
  );

  const tableRef = useRef(null);

  async function saveAs(kind) {
    const t = tableRef.current;
    if (!t) return;
    const oFlow = t.style.overflow;
    const oW = t.style.width;
    t.style.overflow = 'visible';
    t.style.width = `${t.scrollWidth}px`;
    t.scrollLeft = 0;
    t.scrollTop = 0;

    const canvas = await html2canvas(t, {
      scale: 2,
      scrollX: 0,
      scrollY: 0,
      width: t.scrollWidth,
      height: t.scrollHeight,
      windowWidth: t.scrollWidth,
      windowHeight: t.scrollHeight,
      backgroundColor: '#ffffff',
      useCORS: true,
    });

    t.style.overflow = oFlow;
    t.style.width = oW;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    if (kind === 'jpg') {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `방배정표_${paramId}.jpg`;
      a.click();
    } else {
      const imgW = canvas.width;
      const imgH = canvas.height;
      const pdf = new jsPDF({ orientation: imgW > imgH ? 'l' : 'p', unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageW / imgW, pageH / imgH);
      const w = imgW * ratio;
      const h = imgH * ratio;
      const x = (pageW - w) / 2;
      const y = (pageH - h) / 2;
      pdf.addImage(dataUrl, 'JPEG', x, y, w, h);
      pdf.save(`방배정표_${paramId}.pdf`);
    }
  }

  // eslint-disable-next-line no-useless-computed-key
  const cssVars = { ['--nick-ch']: maxNick, ['--cols']: visibleCols };

  if (!roomNames.length) {
    return (
      <div className={styles.page}>
        <div className={styles.content}>
          <div className={styles.card}>
            <div className={styles.empty}>방 정보가 아직 없습니다.</div>
          </div>
          <div className={styles.footerNav}>
            {/* 이전: 명시적으로 1스텝 이동 */}
            <button className={`${styles.navBtn} ${styles.navPrev}`} onClick={() => navigate(`/player/home/${paramId}/1`)}>
              ← 이전
            </button>
            <button
              className={`${styles.navBtn} ${styles.navNext}`}
              onClick={() => {
                try {
                  const cands = [
                    eventData?.myRoom,
                    localStorage.getItem(playerStorageKey(paramId, 'currentRoom')),
                  ];
                  const roomNo = cands.map((v) => Number(v)).find((n) => Number.isFinite(n) && n >= 1);
                  if (Number.isFinite(roomNo)) {
                    localStorage.setItem(playerStorageKey(paramId, 'currentRoom'), String(roomNo));
                  }
                } catch {}
                if (!nextDisabled) navigate(`/player/home/${paramId}/3`);
              }}
              disabled={nextDisabled}
              aria-disabled={nextDisabled}
              data-disabled={nextDisabled ? '1' : '0'}
              style={nextDisabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
            >
              다음 →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>🏠 방배정표</div>
          </div>

          <div ref={tableRef} className={styles.tableWrap}>
            <table className={styles.roomTable} style={cssVars}>
              <thead>
                <tr>
                  {roomNames.map(
                    (name, i) =>
                      !hiddenRooms.has(i) && (
                        <th key={`h-${i}`} colSpan={2} className={styles.th}>
                          {name}
                        </th>
                      )
                  )}
                </tr>
                <tr>
                  {roomNames.map(
                    (_, i) =>
                      !hiddenRooms.has(i) && (
                        <React.Fragment key={`sub-${i}`}>
                          <th className={`${styles.subTh} ${styles.titleCell} ${styles.nickCol}`}>닉네임</th>
                          <th className={`${styles.subTh} ${styles.titleCell} ${styles.handHead}`}>G핸디</th>
                        </React.Fragment>
                      )
                  )}
                </tr>
              </thead>

              <tbody>
                {[0,1,2,3].map((r) => (
                  <tr key={`r-${r}`}>
                    {roomNames.map(
                      (_, c) =>
                        !hiddenRooms.has(c) && (
                          <React.Fragment key={`c-${c}`}>
                            <td className={`${styles.td} ${styles.nickCell}`}>
                              <span className={styles.nick}>
                                {byRoom[c] && byRoom[c][r]?.nickname ? byRoom[c][r].nickname : ''}
                              </span>
                            </td>
                            <td className={`${styles.td} ${styles.handCell}`}>
                              <span className={styles.hand}>
                                {byRoom[c] && byRoom[c][r] ? getHandi(byRoom[c][r]) : ''}
                              </span>
                            </td>
                          </React.Fragment>
                        )
                    )}
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr>
                  {roomNames.map(
                    (_, i) =>
                      !hiddenRooms.has(i) && (
                        <React.Fragment key={`t-${i}`}>
                          <td className={`${styles.td} ${styles.totalLabel} ${styles.nickCell}`}>합계</td>
                          <td className={`${styles.td} ${styles.totalValue}`}>
                            {Number.isFinite(roomHandiSums[i]) ? roomHandiSums[i] : 0}
                          </td>
                        </React.Fragment>
                      )
                  )}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className={styles.cardFooterRight}>
            <button className={`${styles.dlBtn} ${styles.btnPrev}`} onClick={() => saveAs('jpg')}>JPG로 저장</button>
            <button className={`${styles.dlBtn} ${styles.btnNext}`} onClick={() => saveAs('pdf')}>PDF로 저장</button>
          </div>
        </div>
      </div>

      <div className={styles.footerNav}>
        <button className={`${styles.navBtn} ${styles.navPrev}`} onClick={() => navigate(`/player/home/${paramId}/1`)}>
          ← 이전
        </button>
        <button
          className={`${styles.navBtn} ${styles.navNext}`}
          onClick={() => {
            try {
              const cands = [
                eventData?.myRoom,
                localStorage.getItem(playerStorageKey(paramId, 'currentRoom')),
              ];
              const roomNo = cands.map((v) => Number(v)).find((n) => Number.isFinite(n) && n >= 1);
              if (Number.isFinite(roomNo)) {
                localStorage.setItem(playerStorageKey(paramId, 'currentRoom'), String(roomNo));
              }
            } catch {}
            if (!nextDisabled) navigate(`/player/home/${paramId}/3`);
          }}
          disabled={nextDisabled}
          aria-disabled={nextDisabled}
          data-disabled={nextDisabled ? '1' : '0'}
          style={nextDisabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
        >
          다음 →
        </button>
      </div>
    </div>
  );
}
