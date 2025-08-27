// src/player/screens/PlayerRoomTable.jsx
// ※ 기존 구조/포맷을 유지하면서 필요한 부분만 보완했습니다.
// - URL의 :eventId로 EventContext 강제 동기화(연동 문제 해결)
// - 슬롯 배치: 1조/2조 페어 → slot[0,1], slot[2,3] (STEP1/STEP8과 동일 규칙)
// - 표 캡처(JPG/PDF) 유지
// - 닉 중앙정렬: 열(td)에 폭을 부여하고 span은 width:100% + text-align:center

import React, { useContext, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import styles from './PlayerRoomTable.module.css';

import { EventContext } from '../../contexts/EventContext';

const MAX_PER_ROOM = 4;

/** 안전한 G핸디 추출(프로젝트마다 키가 다를 수 있어 공용) */
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

/** 닉네임 길이(한글 가중) → ch/폭 계산 기준치 */
function nickLen(s) {
  const str = String(s || '');
  const hasKo = /[가-힣]/.test(str);
  return Math.max(1, Math.min(40, hasKo ? Math.ceil(str.length * 1.2) : str.length));
}

/** ★ 슬롯 배치 규칙: 1조/2조 페어를 0,1 / 2,3 슬롯에 배치(ADMIN STEP8과 동일) */
function orderSlotsByPairs(roomArr = [], allParticipants = []) {
  const N = Array.isArray(allParticipants) ? allParticipants.length : 0;
  const half = Math.floor(N / 2) || 0;
  const slot = [null, null, null, null];
  const used = new Set();
  const asNum = (v) => Number(v ?? NaN);

  // 방 내 1조( id < half )와 그 짝(partner)을 찾아 쌍으로 보관
  const pairs = [];
  roomArr
    .filter((p) => Number.isFinite(asNum(p?.id)) && asNum(p.id) < half)
    .forEach((p1) => {
      const id1 = asNum(p1.id);
      if (used.has(id1)) return;
      const partner = roomArr.find(
        (x) => Number.isFinite(asNum(x?.id)) && asNum(x.id) === asNum(p1.partner)
      );
      if (partner && !used.has(asNum(partner.id))) {
        pairs.push([p1, partner]); // [1조, 2조]
        used.add(id1);
        used.add(asNum(partner.id));
      }
    });

  // pairs[0] → slot[0],slot[1] / pairs[1] → slot[2],slot[3]
  pairs.forEach((pair, idx) => {
    if (idx === 0) {
      slot[0] = pair[0];
      slot[1] = pair[1];
    } else if (idx === 1) {
      slot[2] = pair[0];
      slot[3] = pair[1];
    }
  });

  // 남은 인원은 빈 슬롯부터 채움
  roomArr.forEach((p) => {
    const pid = asNum(p?.id);
    if (!used.has(pid)) {
      const emptyIdx = slot.findIndex((x) => x === null);
      if (emptyIdx >= 0) {
        slot[emptyIdx] = p;
        used.add(pid);
      }
    }
  });

  while (slot.length < MAX_PER_ROOM) slot.push(null);
  return slot.slice(0, MAX_PER_ROOM);
}

/** 방별 4행 + 합계(정렬 제거, 슬롯 규칙 사용) */
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
    const ordered = orderSlotsByPairs(list, participants);
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
  const { eventId: ctxId, loadEvent, eventData } = useContext(EventContext) || {};

  /** ★ URL의 :eventId → 컨텍스트 강제 동기화 (연동 문제의 핵심) */
  useEffect(() => {
    if (paramId && paramId !== ctxId && typeof loadEvent === 'function') {
      loadEvent(paramId);
    }
  }, [paramId, ctxId, loadEvent]);

  /** Admin과 동일한 공통 필드만 사용 */
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
    () => (Array.isArray(eventData?.participants) ? eventData.participants : []),
    [eventData]
  );

  /** 숨김 방 (Admin publicView와 동기화) */
  const hiddenRooms = useMemo(() => {
    const pv = eventData?.publicView;
    const arr = Array.isArray(pv?.hiddenRooms) ? pv.hiddenRooms : [];
    return new Set(arr.map(Number).filter(Number.isFinite));
  }, [eventData]);

  /** 방 행렬 + 합계 */
  const { matrices: byRoom, sums: roomHandiSums } = useMemo(
    () => buildRoomMatrix(participants, roomNames),
    [participants, roomNames]
  );

  /** 최장 닉네임 길이 → 닉 칼럼 폭 계산용 */
  const maxNick = useMemo(() => {
    let m = 6;
    for (const arr of byRoom) for (const p of arr) if (p) m = Math.max(m, nickLen(p.nickname));
    return Math.max(6, Math.min(40, m));
  }, [byRoom]);

  /** 보이는 방 수(숨김 제외) → 테이블 최소폭 계산용 */
  const visibleCols = useMemo(
    () => roomNames.reduce((acc, _, i) => acc + (hiddenRooms.has(i) ? 0 : 1), 0),
    [roomNames, hiddenRooms]
  );

  const tableRef = useRef(null);

  /** 표만 캡처(JPG/PDF) */
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

  if (!roomNames.length) {
    return (
      <div className={styles.page}>
        <div className={styles.content}>
          <div className={styles.card}>
            <div className={styles.empty}>방 정보가 아직 없습니다.</div>
          </div>
          <div className={styles.footerNav}>
            <button className={`${styles.navBtn} ${styles.navPrev}`} onClick={() => navigate(-1)}>
              ← 이전
            </button>
            <button
              className={`${styles.navBtn} ${styles.navNext}`}
              onClick={() => navigate(`/player/home/${paramId}/3`)}
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

          {/* —— 실선 그리드 테이블 —— */}
          <div ref={tableRef} className={styles.tableWrap}>
            {/* eslint-disable-next-line no-useless-computed-key */}
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
                          {/* ▼ 닉 칼럼 헤더: 열 폭은 td/th가 들고, 텍스트는 가운데 */}
                          <th className={`${styles.subTh} ${styles.titleCell} ${styles.nickCol}`}>
                            닉네임
                          </th>
                          <th className={`${styles.subTh} ${styles.titleCell} ${styles.handHead}`}>
                            G핸디
                          </th>
                        </React.Fragment>
                      )
                  )}
                </tr>
              </thead>

              <tbody>
                {[0, 1, 2, 3].map((r) => (
                  <tr key={`r-${r}`}>
                    {roomNames.map(
                      (_, c) =>
                        !hiddenRooms.has(c) && (
                          <React.Fragment key={`c-${c}`}>
                            {/* ▼ 닉 칼럼: 셀(td)에 폭, span은 width:100% + text-align:center */}
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
                          <td className={`${styles.td} ${styles.totalLabel} ${styles.nickCell}`}>
                            합계
                          </td>
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

          {/* 카드 우하단: JPG=이전톤(회색), PDF=다음톤(블루) — 네비와 독립 */}
          <div className={styles.cardFooterRight}>
            <button className={`${styles.dlBtn} ${styles.btnPrev}`} onClick={() => saveAs('jpg')}>
              JPG로 저장
            </button>
            <button className={`${styles.dlBtn} ${styles.btnNext}`} onClick={() => saveAs('pdf')}>
              PDF로 저장
            </button>
          </div>
        </div>
      </div>

      {/* 하단 고정 네비 — STEP3와 동일(좌우 꽉 차게, 아이콘 탭 위) */}
      <div className={styles.footerNav}>
        <button className={`${styles.navBtn} ${styles.navPrev}`} onClick={() => navigate(-1)}>
          ← 이전
        </button>
        <button
          className={`${styles.navBtn} ${styles.navNext}`}
          onClick={() => navigate(`/player/home/${paramId}/3`)}
        >
          다음 →
        </button>
      </div>
    </div>
  );
}
