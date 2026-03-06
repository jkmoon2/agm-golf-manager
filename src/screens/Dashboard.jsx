// /src/screens/Dashboard.jsx

import React, { useMemo, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Dashboard.module.css';
import { EventContext } from '../contexts/EventContext';
import { db } from '../firebase';
import {
  collection, getDocs, doc, getDoc, updateDoc,
  onSnapshot,
} from 'firebase/firestore';

export default function Dashboard() {
  const preservedTitle = <h2 className={styles.visuallyHidden}>대시보드 화면</h2>;

  const navigate = useNavigate();
  const ctx = useContext(EventContext) || {};
  const { eventId: ctxEventId, eventData: ctxEventData, updatePublicView: ctxUpdatePublicView } = ctx;

  // ──────────────────────────────────
  // 이벤트 목록(실시간)
  // ──────────────────────────────────
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'events'),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => String(b.dateStart || '').localeCompare(String(a.dateStart || '')));
        setEvents(list);
      },
      async (e) => {
        console.warn('[Dashboard] events snapshot failed:', e);
        try {
          const s = await getDocs(collection(db, 'events'));
          const list = s.docs.map(d => ({ id: d.id, ...d.data() }));
          list.sort((a, b) => String(b.dateStart || '').localeCompare(String(a.dateStart || '')));
          setEvents(list);
        } catch (ee) { console.warn('[Dashboard] events fallback failed:', ee); }
      }
    );
    return () => unsub();
  }, []);

  // 선택된 이벤트
  const [selectedId, setSelectedId] = useState(ctxEventId || '');
  useEffect(() => { if (ctxEventId && !selectedId) setSelectedId(ctxEventId); }, [ctxEventId, selectedId]);

  // ──────────────────────────────────
  // 선택 이벤트 문서 + 서브컬렉션(실시간)
  // ──────────────────────────────────
  const [selectedData, setSelectedData] = useState(ctxEventData || null);

  // 참가자/상태/방/점수(실시간) - 필요할 때만 값이 들어오도록 null 기본값
  const [participantsLive, setParticipantsLive]   = useState(null); // events/{id}/participants
  const [playersLive, setPlayersLive]             = useState(null); // events/{id}/players
  const [playerStatesLive, setPlayerStatesLive]   = useState(null); // events/{id}/playerStates
  const [roomsLive, setRoomsLive]                 = useState(null); // events/{id}/rooms
  const [fourballRoomsLive, setFourballRoomsLive] = useState(null); // events/{id}/fourballRooms
  const [eventInputsLive, setEventInputsLive]     = useState(null); // events/{id}/eventInputs

  useEffect(() => {
    const targetId = selectedId || ctxEventId;
    let unsubDoc = null, unsubParts = null, unsubPlayers = null, unsubPStates = null, unsubRooms = null, unsub4Rooms = null, unsubInputs = null;
    let mounted = true;
    const safeSet = (setter, v) => { if (mounted) setter(v); };

    if (targetId) {
      unsubDoc = onSnapshot(
        doc(db, 'events', targetId),
        (ds) => safeSet(setSelectedData, ds.exists() ? ds.data() : null),
        async (e) => {
          console.warn('[Dashboard] event snapshot failed:', e);
          try {
            const d = await getDoc(doc(db, 'events', targetId));
            safeSet(setSelectedData, d.exists() ? d.data() : null);
          } catch (ee) { console.warn('[Dashboard] event fallback failed:', ee); }
        }
      );

      try {
        unsubParts = onSnapshot(
          collection(db, 'events', targetId, 'participants'),
          (snap) => {
            const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            safeSet(setParticipantsLive, arr);
          },
          () => safeSet(setParticipantsLive, null)
        );
      } catch {}

      try {
        unsubPlayers = onSnapshot(
          collection(db, 'events', targetId, 'players'),
          (snap) => {
            const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            safeSet(setPlayersLive, arr);
          },
          () => safeSet(setPlayersLive, null)
        );
      } catch {}

      try {
        unsubPStates = onSnapshot(
          collection(db, 'events', targetId, 'playerStates'),
          (snap) => {
            const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            safeSet(setPlayerStatesLive, arr);
          },
          () => safeSet(setPlayerStatesLive, null)
        );
      } catch {}

      try {
        unsubRooms = onSnapshot(
          collection(db, 'events', targetId, 'rooms'),
          (snap) => {
            const arr = snap.docs.map(d => ({ rid: d.id, ...d.data() }));
            safeSet(setRoomsLive, arr);
          },
          () => safeSet(setRoomsLive, null)
        );
      } catch {}

      try {
        unsub4Rooms = onSnapshot(
          collection(db, 'events', targetId, 'fourballRooms'),
          (snap) => {
            const arr = snap.docs.map(d => ({ rid: d.id, ...d.data() }));
            safeSet(setFourballRoomsLive, arr);
          },
          () => safeSet(setFourballRoomsLive, null)
        );
      } catch {}

      try {
        unsubInputs = onSnapshot(
          collection(db, 'events', targetId, 'eventInputs'),
          (snap) => {
            const map = {};
            snap.docs.forEach(d => { map[d.id] = d.data(); });
            safeSet(setEventInputsLive, map);
          },
          () => safeSet(setEventInputsLive, null)
        );
      } catch {}
    } else {
      safeSet(setSelectedData, ctxEventData || null);
      safeSet(setParticipantsLive, null);
      safeSet(setPlayersLive, null);
      safeSet(setPlayerStatesLive, null);
      safeSet(setRoomsLive, null);
      safeSet(setFourballRoomsLive, null);
      safeSet(setEventInputsLive, null);
    }

    return () => {
      mounted = false;
      if (unsubDoc)      unsubDoc();
      if (unsubParts)    unsubParts();
      if (unsubPlayers)  unsubPlayers();
      if (unsubPStates)  unsubPStates();
      if (unsubRooms)    unsubRooms();
      if (unsub4Rooms)   unsub4Rooms();
      if (unsubInputs)   unsubInputs();
    };
  }, [selectedId, ctxEventId, ctxEventData]);

  // ──────────────────────────────────
  // 파생값(문서 기본값 + 실시간 병합)
  // ──────────────────────────────────
  const mode         = selectedData?.mode || 'stroke';
  const title        = selectedData?.title || 'Untitled Event';
  const roomCount    = Number(selectedData?.roomCount) || 0;
  const roomNames    = Array.isArray(selectedData?.roomNames) ? selectedData.roomNames : [];
  const roomsEffective = useMemo(
    () => (mode === 'fourball' && Array.isArray(fourballRoomsLive) && fourballRoomsLive.length
      ? fourballRoomsLive
      : roomsLive),
    [mode, fourballRoomsLive, roomsLive]
  );
  const participantsFromDoc = Array.isArray(selectedData?.participants) ? selectedData.participants : []; // 업로드 총원
  const pv           = selectedData?.publicView || {};
  const hiddenRooms  = Array.isArray(pv.hiddenRooms) ? pv.hiddenRooms.map(Number) : [];
  const showScore    = (pv.visibleMetrics?.score ?? pv.score ?? true);
  const showBand     = (pv.visibleMetrics?.banddang ?? pv.banddang ?? true);

  // === 방 이름/번호 → 배열 인덱스 매핑
  const parseRoomNo = (v) => {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[^\d]/g, ''); // "5번방" → "5"
    return s ? Number(s) : NaN;
  };
  const roomNoToIndex = (no) => {
    if (!Array.isArray(roomNames) || roomNames.length === 0) return NaN;
    const target = parseRoomNo(no);
    if (Number.isNaN(target)) return NaN;
    for (let i = 0; i < roomNames.length; i++) {
      const n = parseRoomNo(roomNames[i]);
      if (n === target) return i;
    }
    return NaN;
  };

  // [A] 참가자 실시간 소스 통합(우선순위: participantsLive > playersLive > playerStatesLive)
  const livePeople = useMemo(() => {
    if (Array.isArray(participantsLive) && participantsLive.length) return participantsLive;
    if (Array.isArray(playersLive) && playersLive.length)           return playersLive;
    if (Array.isArray(playerStatesLive) && playerStatesLive.length) return playerStatesLive;
    return null;
  }, [participantsLive, playersLive, playerStatesLive]);

  // [B] 참가자 병합
  const participants = useMemo(() => {
    const base = participantsFromDoc || [];
    const live = livePeople;
    if (!live || base.length === 0) return base.length ? base : (live || []);
    const liveMap = new Map(
      live.map(p => [String(p.id ?? p.uid ?? p.userId ?? p.code ?? ''), p])
    );
    const merged = base.map(p => {
      const key = String(p.id ?? p.uid ?? p.userId ?? p.code ?? '');
      const ov  = liveMap.get(key);
      return ov ? { ...p, ...ov } : p;
    });
    live.forEach(lp => {
      const key = String(lp.id ?? lp.uid ?? lp.userId ?? lp.code ?? '');
      const found = base.find(p => String(p.id ?? p.uid ?? p.userId ?? p.code ?? '') === key);
      if (!found) merged.push(lp);
    });
    return merged;
  }, [participantsFromDoc, livePeople]);

  // [C] eventInputs 병합(점수)
  const eventInputs = useMemo(() => {
    const base = (selectedData?.eventInputs && typeof selectedData.eventInputs === 'object') ? selectedData.eventInputs : {};
    if (eventInputsLive && typeof eventInputsLive === 'object') return { ...base, ...eventInputsLive };
    return base;
  }, [selectedData, eventInputsLive]);

  // ===== 진행률 계산 =====

  // ★ Strict check-in: “코드입장/체크인” 만 인정 ==========================
  const idOf = (p) => String(p?.id ?? p?.uid ?? p?.userId ?? p?.code ?? '');

  // 실시간 서브컬렉션에서 들어온 사용자 중, 코드입장/체크인 신호가 있는 uid 모음
  const checkedInSet = useMemo(() => {
    const set = new Set();
    const srcs = [participantsLive, playersLive, playerStatesLive].filter(Array.isArray);
    srcs.forEach(arr => {
      arr.forEach(p => {
        const hasCodeJoin =
          p?.codeEntered === true || p?.entered === true || p?.checkedIn === true ||
          !!p?.enterCodeAt || !!p?.enteredAt || !!p?.joinedAt || !!p?.checkedInAt;
        if (hasCodeJoin) set.add(idOf(p));
      });
    });
    return set;
  }, [participantsLive, playersLive, playerStatesLive]);

  // 참가자 배열 기준으로, 본인 필드나 checkedInSet에 해당하면 “참석”
  const checkedInCount = useMemo(() => {
    return participants.reduce((n, p) => {
      const hasCodeJoin =
        p?.codeEntered === true || p?.entered === true || p?.checkedIn === true ||
        !!p?.enterCodeAt || !!p?.enteredAt || !!p?.joinedAt || !!p?.checkedInAt;
      return n + ((hasCodeJoin || checkedInSet.has(idOf(p))) ? 1 : 0);
    }, 0);
  }, [participants, checkedInSet]);
  // =====================================================================

  // 이벤트 내 person 대상 종목
  const activeEvents = useMemo(
    () => Array.isArray(selectedData?.events)
      ? selectedData.events.filter(ev => ev?.enabled !== false)
      : [],
    [selectedData]
  );
  const personEvents = useMemo(
    () => activeEvents.filter(ev => String(ev?.target || 'person') === 'person'),
    [activeEvents]
  );
  const attemptsOf = (ev) => {
    const n = ev?.inputMode === 'accumulate' ? Number(ev?.attempts ?? 4) : 1;
    return Math.max(1, Math.min(n, 20));
  };

  // 배정 판정(기존 유지)
  const isCommittedAssignment = (p) => {
    const byIndex = Number.isFinite(Number(p?.roomIndex));
    const byNo    = Number.isFinite(Number(p?.roomNo));
    const byRaw   = Number.isFinite(Number(p?.room));
    const hasRoom = byIndex || byNo || byRaw;
    const flagged =
      p?.assigned === true ||
      ['self','admin'].includes(String(p?.assignmentState || '').toLowerCase()) ||
      ['self','admin'].includes(String(p?.assignSource || '').toLowerCase()) ||
      p?.confirmed === true ||
      p?.roomLocked === true || p?.finalized === true || p?.roomCommitted === true;
    return flagged || (hasRoom && flagged);
  };

  // 총원(분모) = 업로드 인원
  const totalParticipants = useMemo(
    () => participantsFromDoc.length || participants.length || 0,
    [participantsFromDoc.length, participants.length]
  );

  // 점수입력: “사람 수” 기준
  const hasAnyScore = (pid) => {
    for (const ev of personEvents) {
      const attempts = attemptsOf(ev);
      const slot = eventInputs?.[ev.id]?.person || {};
      const rec  = slot?.[pid];
      if (attempts === 1) {
        const v = (rec && typeof rec === 'object' && 'value' in rec) ? rec.value : rec;
        if (v !== '' && v != null && !Number.isNaN(Number(v))) return true;
      } else {
        const arr = (rec && typeof rec === 'object' && Array.isArray(rec.values)) ? rec.values : [];
        for (let i = 0; i < attempts; i++) {
          const v = arr[i];
          if (v !== '' && v != null && !Number.isNaN(Number(v))) return true;
        }
      }
    }
    return false;
  };
  const scoreFilledPeople = useMemo(
    () => participants.reduce((acc, p) => acc + (hasAnyScore(String(p.id)) ? 1 : 0), 0),
    [participants, personEvents, eventInputs]
  );

  // 방 멤버 추출
  const extractMembers = (roomDoc) => {
    let arr = roomDoc?.members || roomDoc?.players || roomDoc?.list || roomDoc?.team || roomDoc?.people;
    if (Array.isArray(arr)) return arr;
    const m = [];
    const tryPush = (x) => { if (!x) return; if (typeof x === 'object') m.push(x); else m.push({ id: x }); };
    if (roomDoc?.a || roomDoc?.b) { tryPush(roomDoc.a); tryPush(roomDoc.b); }
    if (roomDoc?.p1 || roomDoc?.p2) { tryPush(roomDoc.p1); tryPush(roomDoc.p2); }
    if (m.length) return m;
    return [];
  };

  // [D] rooms 기반 “배정 인원 수” (실시간)
  const assignedCountFromRooms = useMemo(() => {
    if (!Array.isArray(roomsEffective) || roomsEffective.length === 0) return null;
    const seen = new Set();
    roomsEffective.forEach(r => {
      extractMembers(r).forEach(m => {
        const pid = typeof m === 'object'
          ? String(m.id ?? m.uid ?? m.userId ?? m.code ?? '')
          : String(m);
        if (pid) seen.add(pid);
      });
    });
    return seen.size;
  }, [roomsEffective]);

  const assignedList = useMemo(
    () => participants.filter(isCommittedAssignment),
    [participants]
  );
  const assignedCount = useMemo(
    () => (assignedCountFromRooms ?? assignedList.length),
    [assignedCountFromRooms, assignedList.length]
  );

  // [E] byRoom(방별 구성)
  const byRoom = useMemo(() => {
    const arr = Array.from({ length: roomCount }, () => []);
    const pIndex = new Map(
      participants.map(p => [String(p.id ?? p.uid ?? p.userId ?? p.code ?? ''), p])
    );

    if (Array.isArray(roomsEffective) && roomsEffective.length) {
      roomsEffective.forEach(r => {
        let idx = NaN;
        const i1 = Number(r.index ?? r.order);
        if (Number.isFinite(i1)) idx = i1 - 1;
        if (Number.isNaN(idx)) {
          const no = parseRoomNo(r.roomNo ?? r.room ?? r.name ?? r.rid);
          const j = roomNoToIndex(no);
          if (Number.isFinite(j)) idx = j;
        }
        if (!Number.isFinite(idx) || idx < 0 || idx >= arr.length) return;

        const members = extractMembers(r);
        members.forEach(m => {
          if (typeof m === 'object') {
            const pid  = String(m.id ?? m.uid ?? m.userId ?? m.code ?? '');
            const base = pIndex.get(pid) || {};
            arr[idx].push({
              ...base,
              handicap: Number(m.handicap ?? base.handicap ?? 0),
              score:    Number(m.score    ?? base.score    ?? 0),
            });
          } else {
            const pid  = String(m);
            const base = pIndex.get(pid) || {};
            arr[idx].push(base);
          }
        });
      });
      return arr;
    }

    participants.forEach(p => {
      if (!isCommittedAssignment(p)) return;
      let idx = NaN;
      const ri = Number(p?.roomIndex);
      if (Number.isFinite(ri)) {
        idx = (ri >= 1 && ri <= roomCount) ? (ri - 1) : ((ri >= 0 && ri < roomCount) ? ri : NaN);
      }
      if (!Number.isFinite(idx)) {
        const no = parseRoomNo(p?.roomNo ?? p?.room ?? p?.roomLabel);
        const j  = roomNoToIndex(no);
        if (Number.isFinite(j)) idx = j;
      }
      if (!Number.isFinite(idx) || idx < 0 || idx >= arr.length) return;
      arr[idx].push(p);
    });
    return arr;
  }, [roomCount, roomsEffective, participants, roomNames]);

  // 방별 G핸디 합계
  const roomHandiSum = useMemo(
    () => byRoom.map(list => list.reduce((s, p) => s + (Number(p?.handicap) || 0), 0)),
    [byRoom]
  );
  const maxHandiSum = Math.max(1, ...roomHandiSum);

  // 같은 조 중복 배정 감지(기존 유지)
  const roomHasGroupDup = useMemo(() => {
    return byRoom.map(list => {
      const cnt = {};
      list.forEach(p => { const g = String(p?.group ?? ''); cnt[g] = (cnt[g] || 0) + 1; });
      return Object.values(cnt).some(n => n > 1);
    });
  }, [byRoom]);

  // 방별 결과 합 & 순위(기존 유지)
  const resultByRoom = useMemo(() => {
    return byRoom.map(roomArr => {
      const filled = Array.from({ length: 4 }, (_, i) => roomArr[i] || { handicap: 0, score: 0 });
      let maxIdx = 0, maxVal = -Infinity;
      filled.forEach((p, i) => { const sc = Number(p?.score) || 0; if (sc > maxVal) { maxVal = sc; maxIdx = i; } });
      let sumHd = 0, sumRs = 0;
      filled.forEach((p, i) => {
        const hd = Number(p?.handicap) || 0;
        const sc = Number(p?.score) || 0;
        const bd = (i === maxIdx) ? Math.floor(sc / 2) : sc;
        const used = showScore ? (showBand ? bd : sc) : bd;
        const rs = used - hd;
        sumHd += hd; sumRs += rs;
      });
      return { sumHandicap: sumHd, sumResult: sumRs };
    });
  }, [byRoom, showScore, showBand]);

  const rankMap = useMemo(() => {
    const arr = resultByRoom
      .map((r, i) => ({ idx: i, tot: r.sumResult, hd: r.sumHandicap }))
      .filter(x => !hiddenRooms.includes(x.idx))
      .sort((a, b) => a.tot - b.tot || a.hd - b.hd);
    const map = {}; arr.forEach((x, i) => { map[x.idx] = i + 1; });
    return map;
  }, [resultByRoom, hiddenRooms]);

  // KPI
  const participantsProgress = useMemo(
    () => ({ checkedIn: checkedInCount, total: totalParticipants }),
    [checkedInCount, totalParticipants]
  );
  const scoreProgress = useMemo(
    () => ({ filled: scoreFilledPeople, total: Math.max(1, totalParticipants) }),
    [scoreFilledPeople, totalParticipants]
  );

  // 포볼 팀결성: 분모=총원의 절반 (JSX에서 즉시 계산)
  const pairCount = useMemo(() => {
    if (mode !== 'fourball') return 0;
    const seen = new Set();
    if (Array.isArray(roomsEffective) && roomsEffective.length) {
      roomsEffective.forEach(r => {
        extractMembers(r).forEach(m => {
          const pid = typeof m === 'object'
            ? String(m.id ?? m.uid ?? m.userId ?? m.code ?? '')
            : String(m);
          const partner = typeof m === 'object' ? m.partner : undefined;
          if (pid && partner != null) {
            const a = String(pid), b = String(partner);
            const key = a < b ? `${a}:${b}` : `${b}:${a}`;
            seen.add(key);
          }
        });
      });
      return seen.size;
    }
    participants.forEach(p => {
      if (p?.partner != null) {
        const a = String(p.id), b = String(p.partner);
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        seen.add(key);
      }
    });
    return seen.size;
  }, [roomsEffective, participants, mode]);

  // publicView 갱신(기존 유지)
  const writePublicView = async (patch) => {
    const targetId = selectedId || ctxEventId;
    if (!targetId) return;
    if (ctxUpdatePublicView && targetId === ctxEventId) { await ctxUpdatePublicView(patch); return; }
    const prev = selectedData?.publicView || {};
    const next = { ...prev, ...patch };
    try {
      await updateDoc(doc(db, 'events', targetId), { publicView: next });
      setSelectedData(d => ({ ...(d || {}), publicView: next }));
    } catch (e) { console.warn('[Dashboard] publicView update failed:', e); }
  };

  const toggleHiddenRoom = async (idx) => {
    const set = new Set(hiddenRooms);
    set.has(idx) ? set.delete(idx) : set.add(idx);
    const next = Array.from(set).sort((a, b) => a - b);
    await writePublicView({ hiddenRooms: next });
  };
  const toggleMetric = async (key) => {
    const next = { score: key === 'score' ? !showScore : showScore, banddang: key === 'banddang' ? !showBand : showBand };
    await writePublicView({ visibleMetrics: next, ...next });
  };

  const goStep = (n) => navigate(`/admin/home/${n}`);

  return (
    <div className={styles.page}>
      {preservedTitle}

      {/* 상단: 대회 선택 + 모드 뱃지 */}
      <div className={styles.topRow}>
        <div className={styles.selectWrap} title={title}>
          <select
            className={styles.select}
            value={selectedId || ctxEventId || ''}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {(selectedId || ctxEventId) && !events.find(ev => ev.id === (selectedId || ctxEventId)) && (
              <option value={selectedId || ctxEventId}>
                {title} ({selectedId || ctxEventId})
              </option>
            )}
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.title || ev.id}
              </option>
            ))}
          </select>
        </div>
        <span className={`${styles.modeBadge} ${mode === 'fourball' ? styles.fourball : styles.stroke}`}>
          {mode === 'fourball' ? 'AGM 포볼' : '스트로크'}
        </span>
      </div>

      {/* 메타 정보 */}
      <div className={styles.metaStrip}>
        <div className={`${styles.metaItem} ${styles.metaLeft}`}>
          <b>ID</b>
          <span title={selectedId || ctxEventId || '-'}>
            {selectedId || ctxEventId || '-'}
          </span>
        </div>
        <div className={`${styles.metaItem} ${styles.metaCenter}`}>
          <b>기간</b>
          <span title={`${selectedData?.dateStart || '-'} ~ ${selectedData?.dateEnd || '-'}`}>
            {selectedData?.dateStart || '-'} ~ {selectedData?.dateEnd || '-'}
          </span>
        </div>
        <div className={`${styles.metaItem} ${styles.metaRight}`}>
          <b>방 수</b>
          <span title={String(roomCount)}>{roomCount}</span>
        </div>
      </div>

      {/* KPI */}
      <section className={styles.kpiGrid}>
        <KpiCard label="참가자"  value={checkedInCount}    total={totalParticipants} />
        <KpiCard label="방배정"  value={assignedCount}     total={totalParticipants || 1} />
        <KpiCard label="점수입력" value={scoreFilledPeople} total={Math.max(1, totalParticipants)} />
        {mode === 'fourball' && (
          <KpiCard
            label="팀결성"
            value={pairCount}
            total={Math.max(1, Math.floor((totalParticipants || 0) / 2))}
          />
        )}
      </section>

      {/* 표시 옵션(공유 뷰) */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>표시 옵션(공유 뷰)</div>
        <div className={styles.flexRow}>
          <div className={styles.toggleGroup}>
            <span className={styles.toggleLabel}>항목</span>
            <button className={`${styles.pill} ${showScore ? styles.on : ''}`} onClick={() => toggleMetric('score')}>점수</button>
            <button className={`${styles.pill} ${showBand ? styles.on : ''}`} onClick={() => toggleMetric('banddang')}>반땅</button>
          </div>
          <div className={styles.toggleGroup}>
            <span className={styles.toggleLabel}>방 숨김</span>
            {Array.from({ length: roomCount }, (_, i) => (
              <button
                key={i}
                className={`${styles.pill} ${hiddenRooms.includes(i) ? '' : styles.on}`}
                onClick={() => toggleHiddenRoom(i)}
                title={String(roomNames[i] ?? `${i + 1}번방`)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 방별 배정 현황 */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>방별 배정 현황</div>
        <ul className={styles.assignList}>
          {byRoom.map((list, i) => {
            const count = list.length;
            const pct = Math.max(0, Math.min(1, count / 4));
            return (
              <li key={i} className={styles.assignRow}>
                <div className={styles.assignLabel}>{String(roomNames[i] ?? `${i + 1}번방`)}</div>
                <div className={styles.assignTrack}>
                  <div className={styles.assignFill} style={{ width: `${Math.round(pct * 100)}%` }} />
                </div>
                <div className={styles.assignVal}>{count} / 4</div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 방별 G핸디 합계 */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>방별 G핸디 합계</div>
        <ul className={styles.bars}>
          {roomHandiSum.map((sum, i) => {
            const width = `${Math.round((sum / maxHandiSum) * 100)}%`;
            const hidden = hiddenRooms.includes(i);
            return (
              <li key={i} className={`${styles.barRow} ${hidden ? styles.dim : ''}`}>
                <div className={styles.barLabel}>
                  {String(roomNames[i] ?? `${i + 1}번방`)}
                  {roomHasGroupDup[i] && <span className={styles.warnDot} title="같은 조 중복 배정 감지" />}
                </div>
                <div className={styles.barTrack}><div className={styles.barFill} style={{ width }} /></div>
                <div className={styles.barValue} style={{ color: 'blue' }}>{sum}</div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 방별 결과 합 & 순위 */}
      <section className={styles.panel}>
        <div className={styles.panelHead}>방별 결과 합 & 순위</div>
        <table className={styles.miniTable}>
          <thead>
            <tr>
              <th>방</th>
              <th>G핸디 합</th>
              <th>결과 합</th>
              <th>순위</th>
            </tr>
          </thead>
          <tbody>
            {resultByRoom.map((r, i) => {
              if (hiddenRooms.includes(i)) return null;
              return (
                <tr key={i}>
                  <td>{String(roomNames[i] ?? `${i + 1}번방`)}</td>
                  <td style={{ color: 'blue' }}>{r.sumHandicap}</td>
                  <td style={{ color: 'red' }}>{r.sumResult}</td>
                  <td className={styles.rankCell}><span className={styles.rankBadge}>{rankMap[i] ?? '-'}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* 빠른 이동 */}
      <section className={styles.quick}>
        <button className={styles.quickBtn} onClick={() => goStep(4)}>참가자 업로드(STEP4)</button>
        <button className={styles.quickBtn} onClick={() => goStep(mode === 'fourball' ? 7 : 5)}>
          방배정 {mode === 'fourball' ? '(STEP7)' : '(STEP5)'}
        </button>
        <button className={styles.quickBtn} onClick={() => goStep(mode === 'fourball' ? 8 : 6)}>
          결과표 {mode === 'fourball' ? '(STEP8)' : '(STEP6)'}
        </button>
      </section>
    </div>
  );
}

/* 내부 컴포넌트: KPI 카드 */
function KpiCard({ label, value, total }) {
  const pct = Math.max(0, Math.min(1, total ? value / total : 0));
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>{label}</div>
      <Donut percent={pct} />
      <div className={styles.cardValue}><b>{value}</b> / {total || 0}</div>
    </div>
  );
}

function Donut({ percent = 0 }) {
  const size = 64, stroke = 8, r = (size - stroke) / 2;
  const c = 2 * Math.PI * r, dash = c * percent;
  return (
    <svg width={size} height={size} className={styles.donut}>
      <circle cx={size/2} cy={size/2} r={r} stroke="#eee" strokeWidth={stroke} fill="none" />
      <circle
        cx={size/2}
        cy={size/2}
        r={r}
        stroke="#4f46e5"
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className={styles.donutText}
      >
        {Math.round(percent * 100)}%
      </text>
    </svg>
  );
}
