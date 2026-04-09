// /src/screens/EventManager.jsx
// - 햄버거 메뉴 flip(하단 아이템은 위로 열기) + 카드 overflow 보정
// - 누적 칸수 2~20 허용(5~N 가능) + 4칸 기준 폭 고정, 5칸↑ 가로 스크롤
// - '입력 초기화', '빠른 입력(관리자)' 메뉴 추가
// - 새 템플릿 range-convert-bonus(보너스) 추가 + 편집/집계 지원
// - 미리보기 점수 표시는 소수점 '두 자리까지만' 포맷

import React, { useContext, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { EventContext } from '../contexts/EventContext';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp, deleteField, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { broadcastEventSync } from '../utils/crossTabEventSync';
import css from './EventManager.module.css';
import { TEMPLATE_REGISTRY, getTemplateByType, getTemplateHelp, templateUi } from '../eventTemplates/registry';
import GroupBattleEditor from '../eventTemplates/groupBattle/GroupBattleEditor';
import GroupBattlePreview from '../eventTemplates/groupBattle/GroupBattlePreview';
import GroupBattleHandicapEditor from '../eventTemplates/groupBattle/GroupBattleHandicapEditor';
import HoleRankForceEditor from '../eventTemplates/holeRankForce/HoleRankForceEditor';
import HoleRankForcePreview from '../eventTemplates/holeRankForce/HoleRankForcePreview';
import BingoEditor from '../eventTemplates/bingo/BingoEditor';
import BingoSelectionMonitor from '../eventTemplates/bingo/BingoSelectionMonitor';
import GroupRoomHoleBattleEditor from '../eventTemplates/groupRoomHoleBattle/GroupRoomHoleBattleEditor';
import GroupRoomHoleBattlePreview from '../eventTemplates/groupRoomHoleBattle/GroupRoomHoleBattlePreview';
import GroupRoomHoleBattleMonitor from '../eventTemplates/groupRoomHoleBattle/GroupRoomHoleBattleMonitor';
import PickLineupEditor from '../eventTemplates/pickLineup/PickLineupEditor';
import PickLineupPreview from '../eventTemplates/pickLineup/PickLineupPreview';
import PickLineupSelectionMonitor from '../eventTemplates/pickLineup/PickLineupSelectionMonitor';
import { computeHoleRankForce } from '../events/holeRankForce';
import { buildBingoRoomRowsFromPersonRows, computeBingo, normalizeBingoSelectedHoles } from '../events/bingo';
import { normalizeBattleType, normalizeGroupRoomHoleBattleParams } from '../events/groupRoomHoleBattle';


const uid = () => Math.random().toString(36).slice(2, 10);

// 참가자 객체에서 '조' 값을 폭넓게 추출(팀 계산용)
function getPairNo(p){
  const cand = p?.pair ?? p?.pairNo ?? p?.pairNumber ?? p?.jo ?? p?.groupNo ?? p?.teamPair ?? p?.pairIndex;
  const n = Number(cand);
  if (Number.isFinite(n)) return n;               // 1 또는 2 예상
  const ord = Number(p?.order ?? p?.orderInRoom ?? p?.seat ?? p?.index);
  if (Number.isFinite(ord)) return ord % 2 === 1 ? 1 : 2; // 홀=1조, 짝=2조 추정
  return NaN;
}

function getPreviewGroupNo(p) {
  const cand = p?.group ?? p?.groupNo ?? p?.groupNumber ?? p?.jo ?? p?.joNo ?? p?.groupIndex;
  const n = Number(cand);
  return Number.isFinite(n) ? n : NaN;
}

function buildJoRoomRows(personRowsBase = [], participants = [], roomCount = 0, roomNames = [], rankOrder = 'desc') {
  const byId = new Map((participants || []).map((p) => [String(p?.id), p]));
  const groupBuckets = new Map();

  (personRowsBase || []).forEach((row) => {
    const src = byId.get(String(row?.id)) || {};
    const groupNo = getPreviewGroupNo(src);
    const roomNo = Number(src?.room ?? row?.room ?? NaN);
    if (!Number.isFinite(groupNo) || !Number.isFinite(roomNo) || roomNo < 1) return;
    const safe = {
      id: row?.id,
      name: String(row?.name ?? src?.nickname ?? ''),
      room: roomNo,
      group: groupNo,
      score: Number(row?.score ?? 0),
      handicap: Number(src?.handicap ?? 0),
    };
    if (!groupBuckets.has(groupNo)) groupBuckets.set(groupNo, []);
    groupBuckets.get(groupNo).push(safe);
  });

  const roomMap = new Map(
    Array.from({ length: Math.max(0, Number(roomCount) || 0) }, (_, i) => {
      const roomNo = i + 1;
      return [roomNo, {
        room: roomNo,
        name: roomNames[roomNo - 1]?.trim() || `${roomNo}번방`,
        score: 0,
        detail: [],
      }];
    })
  );

  const sortDir = rankOrder === 'asc' ? 1 : -1; // asc=조↓(낮은 점수 우선), desc=조↑(높은 점수 우선)

  Array.from(groupBuckets.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([groupNo, rows]) => {
      const ordered = [...rows].sort((a, b) => {
        if (a.score !== b.score) return sortDir * (a.score - b.score);
        if (a.handicap !== b.handicap) return a.handicap - b.handicap;
        if (a.room !== b.room) return a.room - b.room;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
      });
      const maxPoint = ordered.length;
      let prevScore = null;
      let currentRank = 0;
      ordered.forEach((row, idx) => {
        if (idx === 0) {
          currentRank = 1;
          prevScore = row.score;
        } else if (row.score !== prevScore) {
          currentRank = idx + 1;
          prevScore = row.score;
        }
        const converted = Math.max(1, maxPoint - currentRank + 1);
        const bucket = roomMap.get(row.room);
        if (!bucket) return;
        bucket.score += converted;
        bucket.detail.push({
          id: row.id,
          name: row.name,
          group: groupNo,
          rawScore: row.score,
          rank: currentRank,
          converted,
        });
      });
    });

  const rows = Array.from(roomMap.values());
  rows.forEach((row) => {
    row.detail.sort((a, b) => {
      if (a.group !== b.group) return a.group - b.group;
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (b.converted !== a.converted) return b.converted - a.converted;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
    });
  });
  rows.sort((a, b) => b.score - a.score || a.room - b.room);
  return rows;
}

// ★ 전역 confirm을 직접 쓰지 않는 안전 래퍼(ESLint 경고 대응)
function askConfirm(message){
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm(message);
  }
  return true;
}

// 소수점 2자리까지만 표기(불필요한 0/점 제거)
const fmt2 = (x) => {
  const n = Number(x ?? 0);
  if (!Number.isFinite(n)) return '0';
  const s = n.toFixed(2);
  return s.replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');
};

function isValidBingoParams(params) {
  return normalizeBingoSelectedHoles(params?.selectedHoles).length === 16;
}

function getBingoCountText(params) {
  const holeCount = normalizeBingoSelectedHoles(params?.selectedHoles).length;
  const zoneCount = Array.isArray(params?.specialZones) ? params.specialZones.length : 0;
  const scoreHoleCount = Number(params?.scoreHoleCount) === 16 ? 16 : 18;
  const prefix = scoreHoleCount === 18 ? '18홀 입력' : '16홀 입력';
  return zoneCount ? `${prefix} · ${holeCount}홀 · SZ ${zoneCount}` : `${prefix} · ${holeCount}홀`;
}



function isValidGroupRoomHoleBattleParams(params) {
  const safe = normalizeGroupRoomHoleBattleParams(params);
  if (!Array.isArray(safe.selectedHoles) || safe.selectedHoles.length < 1) return false;
  if (!Number.isFinite(Number(safe.pickCount)) || Number(safe.pickCount) < 1) return false;
  if (!Number.isFinite(Number(safe.maxPerParticipant)) || Number(safe.maxPerParticipant) < 1) return false;
  if (safe.mode === 'group') {
    return Array.isArray(safe.groups) && safe.groups.some((g) => Array.isArray(g.memberIds) && g.memberIds.length > 0);
  }
  if (safe.mode === 'person') {
    return Array.isArray(safe.personIds) && safe.personIds.length > 0;
  }
  return true;
}



function getGroupRoomHoleBattleMetaText(params) {
  const safe = normalizeGroupRoomHoleBattleParams(params);
  const holeCount = Array.isArray(safe.selectedHoles) ? safe.selectedHoles.length : 0;
  const pickCount = Number.isFinite(Number(safe.pickCount)) ? `${Number(safe.pickCount)}명` : '미설정';
  const maxCount = Number.isFinite(Number(safe.maxPerParticipant)) ? `최대 ${Number(safe.maxPerParticipant)}회` : '미설정';
  const battleType = normalizeBattleType(safe.battleType);
  const battleText = battleType === 'matchplay' ? '매치플레이' : battleType === 'fourball' ? '매치(포볼)' : '스트로크';
  const modeText = safe.mode === 'room' ? '방' : safe.mode === 'person' ? '개인' : '그룹';
  const extra = safe.mode === 'person'
    ? ` · ${Array.isArray(safe.personIds) ? safe.personIds.length : 0}명`
    : safe.mode === 'group'
      ? ` · ${Array.isArray(safe.groups) ? safe.groups.length : 0}개 그룹`
      : '';
  return `${battleText} · ${modeText}${extra} · ${holeCount}홀 · ${pickCount} · ${maxCount}`;
}


function getClientPoint(evt){
  const touch = evt?.touches?.[0] || evt?.changedTouches?.[0] || null;
  if (touch) return { clientX: Number(touch.clientX || 0), clientY: Number(touch.clientY || 0) };
  return { clientX: Number(evt?.clientX || 0), clientY: Number(evt?.clientY || 0) };
}

const TOUCH_LONG_PRESS_MS = 420;
const MOUSE_LONG_PRESS_MS = 280;
const TOUCH_CANCEL_PX = 24;
const MOUSE_CANCEL_PX = 12;


export default function EventManager() {
  const { allEvents = [], eventId, eventData, loadEvent, updateEventImmediate, overlayScoresToParticipants } = useContext(EventContext) || {};

  /* ── 대회 연동 ───────────────────────────────────────── */
  const [selectedEvId, setSelectedEvId] = useState(eventId || '');
  const onLinkTournament = async () => {
    if (!selectedEvId) { alert('대회를 선택하세요.'); return; }
    await loadEvent(selectedEvId);
  };

  /* ── 새 이벤트 만들기 ─────────────────────────────────── */
  const eventsOfSelected = useMemo(() => Array.isArray(eventData?.events) ? eventData.events : [], [eventData]);

  const [dragEvents, setDragEvents] = useState(null);
  const [dragEventId, setDragEventId] = useState('');
  const [monitorId, setMonitorId] = useState(null);
  const [bingoMonitorId, setBingoMonitorId] = useState(null);
  const [groupRoomHoleMonitorId, setGroupRoomHoleMonitorId] = useState(null);
  const [bingoMonitorMode, setBingoMonitorMode] = useState('status');
  const listItemRefs = useRef({});
  const reorderPressRef = useRef({ timer:null, active:false, eventId:'', startX:0, startY:0, mode:'' });
  const reorderTouchCleanupRef = useRef(null);
  const reorderMouseCleanupRef = useRef(null);
  const suppressMenuClickRef = useRef(false);
  const dragEventIdRef = useRef('');
  const dragEventsRef = useRef(null);
  const dragOverIdRef = useRef('');
  const dragStartYRef = useRef(0);
  const dragTranslateRafRef = useRef(null);
  const dragIndexRef = useRef(-1);
  const [dragLiftOn, setDragLiftOn] = useState(false);
  const [dragTranslateY, setDragTranslateY] = useState(0);
  const orderedEvents = dragEvents || eventsOfSelected;

  const [form, setForm] = useState({
    title: '',
    template: 'raw-number',
    inputMode: 'refresh',     // refresh | accumulate
    attempts: 4,
    paramsJson: JSON.stringify(getTemplateByType('raw-number').defaultParams, null, 2),
  });
  const [paramOpen, setParamOpen] = useState(false);
  const uiCreate = templateUi(form.template);

  useEffect(() => {
    dragEventIdRef.current = String(dragEventId || '');
  }, [dragEventId]);

  useEffect(() => {
    dragEventsRef.current = Array.isArray(dragEvents) ? dragEvents : null;
  }, [dragEvents]);


// ────────────────────────────────────────────────────────────────
// 그룹/개인 대결(template: group-battle) 전용 폼 상태
const GB_DEFAULT = {
  mode: 'group',        // group | single
  metric: 'result',     // score | result
  groups: [
    { name: '그룹1', memberIds: [] },
    { name: '그룹2', memberIds: [] },
  ],
  memberIds: [],
};
const [gbMode, setGbMode] = useState(GB_DEFAULT.mode);
const [gbMetric, setGbMetric] = useState(GB_DEFAULT.metric);
const [gbGroups, setGbGroups] = useState(GB_DEFAULT.groups);
const [gbMemberIds, setGbMemberIds] = useState(GB_DEFAULT.memberIds);

const resetGroupBattleForm = () => {
  setGbMode(GB_DEFAULT.mode);
  setGbMetric(GB_DEFAULT.metric);
  setGbGroups(GB_DEFAULT.groups);
  setGbMemberIds(GB_DEFAULT.memberIds);
}; // 기본 닫힘

  // ★ patch: 칸수 삭제-재입력 가능하도록 텍스트 상태 병행
  const [attemptsText, setAttemptsText] = useState('');

  const onTemplateChange = (t) => {
    const def = getTemplateByType(t);


// group-battle 선택 시 전용 폼을 기본값으로 초기화
if (t === 'group-battle') {
  resetGroupBattleForm();
}
    setForm(s => ({ ...s, template: t, paramsJson: JSON.stringify(def?.defaultParams || {}, null, 2) }));
  };

  const getParams = () => { try { return JSON.parse(form.paramsJson || '{}'); } catch { return {}; } };
  const params = getParams();
  // ★ patch: attemptsText 초기화
  useEffect(()=>{ setAttemptsText(String(form.attempts||4)); }, [form.attempts]);
  const setParams = (updater) => {
    const next = typeof updater === 'function' ? updater(getParams()) : updater;
    setForm(s => ({ ...s, paramsJson: JSON.stringify(next, null, 2) }));
  };

  // 숫자×계수
  const onFactorChange = (v) => setParams(p => ({ ...p, factor: Number(v || 0), aggregator: p.aggregator || 'sum' }));

  // 숫자 범위→점수
  const onRangeChange = (idx, key, v) => {
    const table = Array.isArray(params.table) ? [...params.table] : [];
    const row = { ...(table[idx] || { min: '', max: '', score: 0 }) };
    if (key === 'min' || 'max') row[key] = v === '' ? '' : Number(v);
    if (key === 'score') row[key] = Number(v || 0);
    table[idx] = row;
    setParams({ ...params, table, aggregator: params.aggregator || 'sum' });
  };
  const addRangeRow    = () => setParams(p => ({ ...p, table: [ ...(Array.isArray(p.table) ? p.table : []), { min: '', max: '', score: 0 } ], aggregator: p.aggregator || 'sum' }));
  const removeRangeRow = (idx) => setParams(p => { const t = [ ...(Array.isArray(p.table) ? p.table : []) ]; t.splice(idx, 1); return { ...p, table: t }; });

  // 보너스 편집(UI 간단 버전: 라벨/점수 리스트)
  const onBonusChange = (idx, key, v) => {
    const bonus = Array.isArray(params.bonus) ? [...params.bonus] : [];
    const row = { ...(bonus[idx] || { label:'', score:0 }) };
    row[key] = key === 'score' ? Number(v || 0) : String(v || '');
    bonus[idx] = row;
    setParams({ ...params, bonus, aggregator: params.aggregator || 'sum' });
  };
  const addBonusRow    = () => setParams(p => ({ ...p, bonus: [ ...(Array.isArray(p.bonus) ? p.bonus : []), { label:'파', score:1 } ] }));
  const removeBonusRow = (idx) => setParams(p => { const t = [ ...(Array.isArray(p.bonus) ? p.bonus : []) ]; t.splice(idx,1); return { ...p, bonus:t }; });

  const addEvent = async () => {
    try {

// ── group-battle 전용 생성(전용 폼 상태 → params) ───────────
if (form.template === 'group-battle') {
  const params = {
    mode: gbMode === 'single' ? 'single' : 'group',
    metric: gbMetric === 'score' ? 'score' : 'result',
  };
  if (params.mode === 'group') {
    params.groups = (Array.isArray(gbGroups) ? gbGroups : []).map((g, gi) => ({
      name: String(g?.name ?? `그룹${gi + 1}`).trim() || `그룹${gi + 1}`,
      memberIds: Array.isArray(g?.memberIds) ? g.memberIds.map(String) : [],
    }));
  } else {
    params.memberIds = Array.isArray(gbMemberIds) ? gbMemberIds.map(String) : [];
  }

  const item = {
    id: uid(),
    title: form.title.trim() || '이벤트',
    template: 'group-battle',
    params,
    enabled: true,
    // 기본 오름차순(낮은 점수 승)
    rankOrder: 'asc',
    target: 'group',
  };

  const list = [...eventsOfSelected, item];
  await updateEventImmediate({ events: list }, false);

  // 폼 리셋(기존 톤 유지)
  setForm({
    title: '',
    template: 'raw-number',
    inputMode: 'refresh',
    attempts: 4,
    paramsJson: JSON.stringify(getTemplateByType('raw-number').defaultParams, null, 2),
  });
  resetGroupBattleForm();
  setParamOpen(false);
  alert('이벤트가 생성되었습니다.');
  return;
}
      const parsed = JSON.parse(form.paramsJson || '{}');
      if (form.template === 'bingo' && !isValidBingoParams(parsed)) {
        alert('빙고 이벤트는 18홀 중 16홀을 선택해야 합니다.');
        return;
      }
      if (form.template === 'group-room-hole-battle' && !isValidGroupRoomHoleBattleParams(parsed)) {
        alert('그룹/방/개인 홀별 지목전은 사용 홀, 참가자 조건을 모두 설정하고, 그룹 모드는 그룹 멤버, 개인 모드는 참가자를 1명 이상 선택해야 합니다.');
        return;
      }
      const isBingo = form.template === 'bingo';
      const isGroupRoomHoleBattle = form.template === 'group-room-hole-battle';
      const battleMode = isGroupRoomHoleBattle ? normalizeGroupRoomHoleBattleParams(parsed).mode : 'group';
      const item = {
        id: uid(),
        title: form.title.trim() || '이벤트',
        template: form.template,
        params: parsed,
        target: isBingo ? 'room' : (isGroupRoomHoleBattle ? (battleMode === 'room' ? 'room' : battleMode === 'person' ? 'person' : 'group') : 'person'),
        rankOrder: isBingo ? 'desc' : (isGroupRoomHoleBattle ? 'asc' : 'asc'),
        inputMode: (form.template === 'hole-rank-force' || form.template === 'bingo') ? 'accumulate' : form.inputMode,                // refresh | accumulate
        attempts: (form.template === 'hole-rank-force' || form.template === 'bingo') ? 18 : Number(form.attempts || 4),     // 누적 칸수
        enabled: true,
      };
      const list = [...eventsOfSelected, item];
      await updateEventImmediate({ events: list }, false);
      setForm({
        title: '',
        template: 'raw-number',
        inputMode: 'refresh',
        attempts: 4,
        paramsJson: JSON.stringify(getTemplateByType('raw-number').defaultParams, null, 2),
      });
      setParamOpen(false);
      alert('이벤트가 생성되었습니다.');
    } catch {
      alert('파라미터(JSON)가 올바르지 않습니다.');
    }
  };

  /* ── 목록 햄버거 메뉴 ─────────────────────────────────── */
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuUpId, setMenuUpId] = useState(null); // ★ 아래 공간 부족시 위로 열기
  const menuRef = useRef(null);
  useEffect(() => {
    const onClick = (e) => {
      if (!menuRef.current) { setOpenMenuId(null); setMenuUpId(null); return; }
      if (!menuRef.current.contains(e.target)) { setOpenMenuId(null); setMenuUpId(null); }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const openMenuFromButton = (ev, btnEl) => {
    const id = (openMenuId === ev.id) ? null : ev.id;
    setOpenMenuId(id);
    setTimeout(() => {
      try {
        const btnRect = btnEl?.getBoundingClientRect?.();
        const spaceBelow = window.innerHeight - (btnRect?.bottom || 0);
        const NEED = 200; // 메뉴 높이 대략치
        setMenuUpId(spaceBelow < NEED ? ev.id : null);
      } catch {
        setMenuUpId(null);
      }
    }, 0);
  };

  function detachTouchReorderListeners() {
    const cleanup = reorderTouchCleanupRef.current;
    if (typeof cleanup === 'function') cleanup();
    reorderTouchCleanupRef.current = null;
  }

  function detachMouseReorderListeners() {
    const cleanup = reorderMouseCleanupRef.current;
    if (typeof cleanup === 'function') cleanup();
    reorderMouseCleanupRef.current = null;
  }

  function clearReorderSession() {
    const state = reorderPressRef.current || {};
    if (state.timer) {
      clearTimeout(state.timer);
    }
    detachTouchReorderListeners();
    detachMouseReorderListeners();
    reorderPressRef.current = { timer:null, active:false, eventId:'', startX:0, startY:0, mode:'' };
    dragEventIdRef.current = '';
    dragEventsRef.current = null;
    dragOverIdRef.current = '';
    dragIndexRef.current = -1;
    if (dragTranslateRafRef.current) {
      cancelAnimationFrame(dragTranslateRafRef.current);
      dragTranslateRafRef.current = null;
    }
    setDragEventId('');
    setDragEvents(null);
    setDragLiftOn(false);
    setDragTranslateY(0);
    try {
      document.body.style.userSelect = '';
      document.body.style.touchAction = '';
      document.body.style.webkitUserSelect = '';
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.overscrollBehavior = '';
    } catch {}
  }

  const finalizeReorder = useCallback(async () => {
    const nextList = Array.isArray(dragEventsRef.current) ? dragEventsRef.current : null;
    const changed = !!nextList && nextList.length === eventsOfSelected.length
      && nextList.some((item, idx) => String(item?.id) !== String(eventsOfSelected[idx]?.id));

    clearReorderSession();

    if (changed) {
      await updateEventImmediate({ events: nextList }, false);
    }
  }, [eventsOfSelected, updateEventImmediate]);

  const updateDragOrderByPoint = (clientY) => {
    const activeEventId = String(dragEventIdRef.current || reorderPressRef.current?.eventId || '');
    if (!activeEventId) return;
    const currentList = Array.isArray(dragEventsRef.current) ? dragEventsRef.current : eventsOfSelected;
    const activeItem = currentList.find((item) => String(item?.id) === activeEventId);
    if (!activeItem) return;

    const passiveList = currentList.filter((item) => String(item?.id) !== activeEventId);
    let nextIndex = passiveList.length;

    for (let i = 0; i < passiveList.length; i += 1) {
      const passiveId = String(passiveList[i]?.id || '');
      const el = listItemRefs.current?.[passiveId];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const pivotY = rect.top + (rect.height / 2);
      if (Number(clientY || 0) < pivotY) {
        nextIndex = i;
        break;
      }
    }

    if (dragIndexRef.current === nextIndex) return;

    const next = [...passiveList];
    next.splice(nextIndex, 0, activeItem);
    const changed = next.length === currentList.length
      && next.some((item, idx) => String(item?.id) !== String(currentList[idx]?.id));
    if (!changed) {
      dragIndexRef.current = nextIndex;
      return;
    }

    dragIndexRef.current = nextIndex;
    dragOverIdRef.current = String(passiveList[nextIndex]?.id || passiveList[nextIndex - 1]?.id || '');
    dragEventsRef.current = next;
    setDragEvents(next);
  };

  const applyDragTranslate = (clientY) => {
    const nextY = Number(clientY || 0) - Number(dragStartYRef.current || 0);
    if (dragTranslateRafRef.current) cancelAnimationFrame(dragTranslateRafRef.current);
    dragTranslateRafRef.current = requestAnimationFrame(() => {
      setDragTranslateY(nextY);
      dragTranslateRafRef.current = null;
    });
  };

  const activateReorder = useCallback((ev) => {
    suppressMenuClickRef.current = true;
    const currentState = reorderPressRef.current || {};
    dragStartYRef.current = Number(currentState.startY || 0);
    reorderPressRef.current = {
      ...(currentState || {}),
      timer: null,
      active: true,
      eventId: ev.id,
    };
    dragEventIdRef.current = String(ev.id || '');
    dragOverIdRef.current = '';
    setDragEventId(ev.id);
    setDragLiftOn(true);
    setDragTranslateY(0);
    const seeded = eventsOfSelected.slice();
    dragIndexRef.current = seeded.findIndex((item) => String(item?.id) === String(ev.id));
    dragEventsRef.current = seeded;
    setDragEvents(seeded);
    try {
      document.body.style.userSelect = 'none';
      document.body.style.touchAction = 'none';
      document.body.style.webkitUserSelect = 'none';
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'contain';
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'contain';
    } catch {}
  }, [eventsOfSelected]);

  const startTouchReorder = useCallback((ev, rawEvent) => {
    rawEvent.stopPropagation();
    if (typeof rawEvent.preventDefault === 'function' && rawEvent.cancelable !== false) rawEvent.preventDefault();
    const touch = rawEvent.touches?.[0];
    if (!touch) return;
    clearReorderSession();
    suppressMenuClickRef.current = false;
    setOpenMenuId(null);
    setMenuUpId(null);

    const touchId = touch.identifier;
    reorderPressRef.current = {
      timer: setTimeout(() => activateReorder(ev), TOUCH_LONG_PRESS_MS),
      active: false,
      eventId: ev.id,
      startX: Number(touch.clientX || 0),
      startY: Number(touch.clientY || 0),
      mode: 'touch',
      touchId,
    };

    const readTouch = (evt) => {
      const allTouches = [...Array.from(evt.touches || []), ...Array.from(evt.changedTouches || [])];
      return allTouches.find((item) => item.identifier === touchId) || allTouches[0] || null;
    };

    const handleTouchMove = (moveEvt) => {
      const state = reorderPressRef.current || {};
      const currentTouch = readTouch(moveEvt);
      if (!currentTouch) return;
      const dx = Math.abs(Number(currentTouch.clientX || 0) - Number(state.startX || 0));
      const dy = Math.abs(Number(currentTouch.clientY || 0) - Number(state.startY || 0));

      if (!state.active) {
        if (dx > TOUCH_CANCEL_PX || dy > TOUCH_CANCEL_PX) {
          if (state.timer) {
            clearTimeout(state.timer);
            reorderPressRef.current = { ...(state || {}), timer: null };
          }
        }
        return;
      }

      if (typeof moveEvt.preventDefault === 'function' && moveEvt.cancelable !== false) moveEvt.preventDefault();
      setDragLiftOn(true);
      applyDragTranslate(Number(currentTouch.clientY || 0));
      updateDragOrderByPoint(Number(currentTouch.clientY || 0));
    };

    const handleTouchEnd = async () => {
      const state = reorderPressRef.current || {};
      if (state.timer) {
        clearTimeout(state.timer);
        reorderPressRef.current = { ...(state || {}), timer: null };
      }
      if (state.active) {
        suppressMenuClickRef.current = true;
        await finalizeReorder();
      } else {
        clearReorderSession();
      }
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: false, capture: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: false, capture: true });
    reorderTouchCleanupRef.current = () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [activateReorder, applyDragTranslate, finalizeReorder]);

  const startMouseReorder = useCallback((ev, rawEvent) => {
    rawEvent.stopPropagation();
    if (typeof rawEvent.button === 'number' && rawEvent.button !== 0) return;
    clearReorderSession();
    suppressMenuClickRef.current = false;
    setOpenMenuId(null);
    setMenuUpId(null);

    reorderPressRef.current = {
      timer: setTimeout(() => activateReorder(ev), MOUSE_LONG_PRESS_MS),
      active: false,
      eventId: ev.id,
      startX: Number(rawEvent.clientX || 0),
      startY: Number(rawEvent.clientY || 0),
      mode: 'mouse',
    };

    const handleMouseMove = (moveEvt) => {
      const state = reorderPressRef.current || {};
      const dx = Math.abs(Number(moveEvt.clientX || 0) - Number(state.startX || 0));
      const dy = Math.abs(Number(moveEvt.clientY || 0) - Number(state.startY || 0));
      if (!state.active) {
        if (dx > MOUSE_CANCEL_PX || dy > MOUSE_CANCEL_PX) {
          if (state.timer) {
            clearTimeout(state.timer);
            reorderPressRef.current = { ...(state || {}), timer: null };
          }
        }
        return;
      }
      if (typeof moveEvt.preventDefault === 'function') moveEvt.preventDefault();
      setDragLiftOn(true);
      applyDragTranslate(Number(moveEvt.clientY || 0));
      updateDragOrderByPoint(Number(moveEvt.clientY || 0));
    };

    const handleMouseEnd = async () => {
      const state = reorderPressRef.current || {};
      if (state.timer) {
        clearTimeout(state.timer);
        reorderPressRef.current = { ...(state || {}), timer: null };
      }
      if (state.active) {
        suppressMenuClickRef.current = true;
        await finalizeReorder();
      } else {
        clearReorderSession();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseEnd);
    reorderMouseCleanupRef.current = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseEnd);
    };
  }, [activateReorder, applyDragTranslate, finalizeReorder]);

  const onMoreTouchStart = (ev, e) => {
    startTouchReorder(ev, e);
  };

  const onMoreMouseDown = (ev, e) => {
    startMouseReorder(ev, e);
  };

  useEffect(() => () => {
    clearReorderSession();
  }, []);


  const toggleEnable = async (ev) => {
    const next = eventsOfSelected.map(e => e.id === ev.id ? { ...e, enabled: !e.enabled } : e);
    await updateEventImmediate({ events: next }, false);
    setOpenMenuId(null); setMenuUpId(null);
    setEditAttemptsText(String(Number(ev.attempts||4)));
  };

  const removeEvent = async (ev) => {
    if (!askConfirm('삭제하시겠어요?')) return;
    const next = eventsOfSelected.filter(e => e.id !== ev.id);
    await updateEventImmediate({ events: next }, false);
    setOpenMenuId(null); setMenuUpId(null);
    setEditAttemptsText(String(Number(ev.attempts||4)));
  };

  // ★ 입력 초기화(해당 이벤트의 person/room/team 입력을 비움)
  const clearInputs = async (ev) => {
    if (!askConfirm('이 이벤트의 입력값을 모두 초기화할까요?')) return;
    const evId = String(ev?.id || '');
    const all = { ...(eventData?.eventInputs || {}) };
    delete all[evId];
    const resetToken = Date.now();

    try {
      if (eventId) {
        await updateDoc(doc(db, 'events', eventId), {
          [`eventInputs.${evId}`]: deleteField(),
          [`eventInputResets.${evId}`]: resetToken,
          inputsUpdatedAt: serverTimestamp(),
        });
        try {
          await deleteDoc(doc(db, 'events', eventId, 'eventInputs', evId));
        } catch (subErr) {
          console.warn('[clearInputs] subcollection cleanup failed:', subErr);
        }
      }
    } catch (e) {
      console.warn('[clearInputs] remote patch failed:', e);
    }

    await updateEventImmediate({ eventInputs: all, eventInputResets: { ...((eventData?.eventInputResets)||{}), [evId]: resetToken }, inputsUpdatedAt: Date.now() }, false);
    try { broadcastEventSync(eventId, { reason: 'clearInputs' }); } catch {}
    setOpenMenuId(null); setMenuUpId(null);
    setEditAttemptsText(String(Number(ev.attempts||4)));
  };

  /* ── 수정 인라인 폼 ───────────────────────────────────── */
  const [editId, setEditId] = useState(null);
  // ★ patch: 수정폼 칸수 텍스트 상태
  const [editAttemptsText, setEditAttemptsText] = useState('');
  const [editForm, setEditForm] = useState(null);

// ────────────────────────────────────────────────────────────────
// 그룹/개인 대결(template: group-battle) - 수정용 상태
const [editGbMode, setEditGbMode] = useState(GB_DEFAULT.mode);
const [editGbMetric, setEditGbMetric] = useState(GB_DEFAULT.metric);
const [editGbGroups, setEditGbGroups] = useState(GB_DEFAULT.groups);
const [editGbMemberIds, setEditGbMemberIds] = useState(GB_DEFAULT.memberIds);

const resetEditGroupBattle = (params) => {
  const p = params && typeof params === 'object' ? params : {};
  setEditGbMode(p.mode === 'single' ? 'single' : 'group');
  setEditGbMetric(p.metric === 'score' ? 'score' : 'result');
  setEditGbGroups(Array.isArray(p.groups) && p.groups.length
    ? p.groups.map((g, gi) => ({
        name: String(g?.name ?? `그룹${gi+1}`),
        memberIds: Array.isArray(g?.memberIds) ? g.memberIds.map(String) : [],
      }))
    : GB_DEFAULT.groups
  );
  setEditGbMemberIds(Array.isArray(p.memberIds) ? p.memberIds.map(String) : []);
};
  const [editParamOpen, setEditParamOpen] = useState(false); // 기본 닫힘

  const uiEdit = editForm ? templateUi(editForm.template) : {};


  const openEdit = (ev) => {
    setEditId(ev.id);
    setEditForm({
      id: ev.id,
      title: ev.title,
      template: ev.template,
      inputMode: ev.inputMode || 'refresh',
      attempts: Number(ev.attempts || 4),
      paramsJson: JSON.stringify(ev.params || {}, null, 2),
    });
    setEditParamOpen(false);

    if (ev?.template === 'group-battle') {
      resetEditGroupBattle(ev?.params || {});
    }
    setOpenMenuId(null); setMenuUpId(null);
    setEditAttemptsText(String(Number(ev.attempts||4)));
  };

  const editParams = useMemo(() => { try { return JSON.parse(editForm?.paramsJson || '{}'); } catch { return {}; } }, [editForm]);
  const setEditParams = (updater) => {
    setEditForm(s => {
      if (!s) return s;
      const next = typeof updater === 'function' ? updater(editParams) : updater;
      return { ...s, paramsJson: JSON.stringify(next || {},  null, 2) };
    });
  };
  const onEditFactorChange = (v) => setEditParams(p => ({ ...p, factor: Number(v || 0), aggregator: p.aggregator || 'sum' }));
  const onEditRangeChange  = (i, k, v) => {
    const t = Array.isArray(editParams.table) ? [...editParams.table] : [];
    const r = { ...(t[i] || { min: '', max: '', score: 0 }) };
    if (k === 'min' || k === 'max') r[k] = v === '' ? '' : Number(v);
    if (k === 'score') r[k] = Number(v || 0);
    t[i] = r;
    setEditParams({ ...editParams, table: t, aggregator: editParams.aggregator || 'sum' });
  };
  const addEditRangeRow    = () => setEditParams(p => ({ ...p, table: [ ...(Array.isArray(p.table) ? p.table : []), { min: '', max: '', score: 0 } ], aggregator: p.aggregator || 'sum' }));
  const removeEditRangeRow = (i) => setEditParams(p => { const t = [ ...(Array.isArray(p.table) ? p.table : []) ]; t.splice(i, 1); return { ...p, table: t }; });

  const onEditBonusChange = (i, k, v) => {
    const b = Array.isArray(editParams.bonus) ? [...editParams.bonus] : [];
    const row = { ...(b[i] || { label:'', score:0 }) };
    row[k] = k === 'score' ? Number(v || 0) : String(v || '');
    b[i] = row;
    setEditParams({ ...editParams, bonus: b, aggregator: editParams.aggregator || 'sum' });
  };
  const addEditBonusRow = () => setEditParams(p => ({ ...p, bonus: [ ...(Array.isArray(p.bonus) ? p.bonus : []), { label:'파', score:1 } ] }));
  const removeEditBonusRow = (i) => setEditParams(p => { const b = [ ...(Array.isArray(p.bonus) ? p.bonus : []) ]; b.splice(i,1); return { ...p, bonus:b }; });

  const applyEdit = async () => {
    try {

// ── group-battle 전용 저장(전용 폼 상태 → params) ───────────
if (editForm?.template === 'group-battle') {
  const params = {
    mode: editGbMode === 'single' ? 'single' : 'group',
    metric: editGbMetric === 'score' ? 'score' : 'result',
  };
  if (params.mode === 'group') {
    params.groups = (Array.isArray(editGbGroups) ? editGbGroups : []).map((g, gi) => ({
      name: String(g?.name ?? `그룹${gi + 1}`).trim() || `그룹${gi + 1}`,
      memberIds: Array.isArray(g?.memberIds) ? g.memberIds.map(String) : [],
    }));
  } else {
    params.memberIds = Array.isArray(editGbMemberIds) ? editGbMemberIds.map(String) : [];
  }

  const next = eventsOfSelected.map(e =>
    e.id === editId ? { ...e, title: editForm.title.trim() || e.title, template: 'group-battle', params } : e
  );
  await updateEventImmediate({ events: next }, false);
  setEditId(null);
  setEditForm(null);
  setEditParamOpen(false);
  alert('저장되었습니다.');
  return;
}
      const parsed = JSON.parse(editForm.paramsJson || '{}');
      if (editForm.template === 'bingo' && !isValidBingoParams(parsed)) {
        alert('빙고 이벤트는 18홀 중 16홀을 선택해야 합니다.');
        return;
      }
      if (editForm.template === 'group-room-hole-battle' && !isValidGroupRoomHoleBattleParams(parsed)) {
        alert('그룹/방/개인 홀별 지목전은 사용 홀, 참가자 조건을 모두 설정하고, 그룹 모드는 그룹 멤버, 개인 모드는 참가자를 1명 이상 선택해야 합니다.');
        return;
      }
      const isBingoEdit = editForm.template === 'bingo';
      const isGroupRoomHoleBattleEdit = editForm.template === 'group-room-hole-battle';
      const battleModeEdit = isGroupRoomHoleBattleEdit ? normalizeGroupRoomHoleBattleParams(parsed).mode : 'group';
      const next = eventsOfSelected.map(e => e.id === editId ? {
        ...e,
        title: editForm.title.trim() || e.title,
        template: editForm.template,
        params: parsed,
        target: isBingoEdit ? 'room' : (isGroupRoomHoleBattleEdit ? (battleModeEdit === 'room' ? 'room' : battleModeEdit === 'person' ? 'person' : 'group') : e.target),
        rankOrder: isBingoEdit ? 'desc' : (isGroupRoomHoleBattleEdit ? 'asc' : e.rankOrder),
        inputMode: (editForm.template === 'hole-rank-force' || editForm.template === 'bingo') ? 'accumulate' : editForm.inputMode,
        attempts: (editForm.template === 'hole-rank-force' || editForm.template === 'bingo') ? 18 : Number(editForm.attempts || 4),
      } : e);
      await updateEventImmediate({ events: next }, false);
      setEditId(null);
      setEditForm(null);
      setEditParamOpen(false);
    } catch {
      alert('파라미터(JSON)가 올바르지 않습니다.');
    }
  };

  /* ── 미리보기(계산) ───────────────────────────────────── */
  const [viewTab, setViewTab] = useState('person'); // person | room | team | group | jo
  const [viewOrder, setViewOrder] = useState('asc');
  const sign = viewOrder === 'desc' ? -1 : 1;

  const compute = (def, raw) => {
    const arr = Array.isArray(raw) ? raw
      : (raw && typeof raw === 'object' && Array.isArray(raw.values) ? raw.values : [raw]);
    const t = def?.template || 'raw-number';
    const p = def?.params || {};
    const bonusRows = Array.isArray(p.bonus) ? p.bonus : [];
    const bonusMap  = bonusRows.reduce((m, r) => (r?.label ? (m[r.label] = Number(r.score||0), m) : m), {});

    const scoreOfAt = (n, i) => {
      const v = Number(n ?? 0);
      let base = v;
      if (t === 'raw-number') base = v;
      else if (t === 'number-convert') base = Math.round(v * Number(p.factor ?? 1));
      else if (t === 'range-convert' || t === 'range-convert-bonus') {
        const tb = Array.isArray(p.table) ? p.table : [];
        let hit = 0;
        for (const r of tb) {
          const okMin = r.min === '' || r.min == null || v >= Number(r.min);
          const okMax = r.max === '' || r.max == null || v <= Number(r.max);
          if (okMin && okMax) { hit = Number(r.score ?? 0); break; }
        }
        base = hit;
      }
      if (t === 'range-convert-bonus') {
        const tag = (raw && typeof raw === 'object' && Array.isArray(raw.bonus)) ? raw.bonus[i] : (raw && typeof raw === 'object' ? raw.bonus : undefined);
        const bonus = bonusMap[String(tag || '')] || 0;
        return base + bonus;
      }
      return base;
    };

    return arr.map((n, i) => scoreOfAt(n, i)).reduce((a, b) => a + b, 0);
  };
  const aggregate = (arr = []) => arr.map(Number).filter(Number.isFinite).reduce((a, b) => a + b, 0);

  const participantsBase = Array.isArray(eventData?.participants) ? eventData.participants : [];
  const participants = (typeof overlayScoresToParticipants === 'function') ? overlayScoresToParticipants(participantsBase) : participantsBase;
  const roomCount    = Number(eventData?.roomCount || 0);
  const roomNames    = (Array.isArray(eventData?.roomNames) && eventData.roomNames.length)
    ? eventData.roomNames : Array.from({ length: roomCount }, (_, i) => `${i + 1}번방`);
  const inputsAll    = eventData?.eventInputs || {};

  const [previewId, setPreviewId] = useState(eventsOfSelected[0]?.id || '');
  useEffect(() => { if (eventsOfSelected.length && !previewId) setPreviewId(eventsOfSelected[0].id); }, [eventsOfSelected, previewId]);
  const previewDef = useMemo(() => eventsOfSelected.find(e => e.id === previewId) || null, [eventsOfSelected, previewId]);

  // ★ 미리보기 컨트롤 값 ↔ 이벤트 설정 양방향 동기화
  useEffect(() => {
    if (previewDef) {
      setViewTab(previewDef.target || 'person');
      setViewOrder(previewDef.rankOrder || 'asc');
    }
  }, [previewDef]);

  const persistPreviewConfig = (tab, order) => {
    if (!previewDef) return;
    const next = eventsOfSelected.map(e =>
      e.id === previewDef.id
        ? { ...e, target: (tab ?? (previewDef.target || 'person')), rankOrder: (order ?? (previewDef.rankOrder || 'asc')) }
        : e
    );
    updateEventImmediate({ events: next }, false);
  };

  const perP = inputsAll?.[previewId]?.person || {};
  const perR = inputsAll?.[previewId]?.room   || {};
  const perT = inputsAll?.[previewId]?.team   || {};

  const holeRankForcePreview = useMemo(() => {
    if (!previewDef || previewDef.template !== 'hole-rank-force') return null;
    return computeHoleRankForce(previewDef, participants, inputsAll, { roomNames, roomCount });
  }, [previewDef, participants, inputsAll, roomNames, roomCount]);

  const bingoPreview = useMemo(() => {
    if (!previewDef || previewDef.template !== 'bingo') return null;
    return computeBingo(previewDef, participants, inputsAll, { roomNames, roomCount });
  }, [previewDef, participants, inputsAll, roomNames, roomCount]);

  const personRowsBase = useMemo(() => {
    if (!previewDef) return [];
    if (previewDef.template === 'hole-rank-force') {
      return Array.isArray(holeRankForcePreview?.personRows)
        ? holeRankForcePreview.personRows.map((r) => ({ id: r.id, name: r.name, room: r.room, score: r.value }))
        : [];
    }
    if (previewDef.template === 'bingo') {
      return Array.isArray(bingoPreview?.personRows)
        ? bingoPreview.personRows.map((r) => ({ id: r.id, name: r.name, room: r.room, score: r.value }))
        : [];
    }
    return participants.map((p) => ({ id: p.id, name: p.nickname, room: p.room, score: compute(previewDef, perP[p.id]) }));
  }, [participants, perP, previewDef, holeRankForcePreview, bingoPreview]);

  const personRows = useMemo(() => {
    const rows = [...personRowsBase];
    rows.sort((a, b) => sign * (a.score - b.score));
    return rows;
  }, [personRowsBase, sign]);

  const roomRows = useMemo(() => {
    if (!previewDef) return [];
    if (previewDef.template === 'hole-rank-force') {
      const arr = Array.isArray(holeRankForcePreview?.roomRows)
        ? holeRankForcePreview.roomRows.map((r) => ({ room: r.room, name: r.name, score: r.value }))
        : [];
      arr.sort((a, b) => sign * (a.score - b.score));
      return arr;
    }
    if (previewDef.template === 'bingo') {
      const baseRows = Array.isArray(bingoPreview?.personRows)
        ? bingoPreview.personRows.map((r) => ({ id: r.id, room: r.room, value: r.value, name: r.name }))
        : [];
      const arr = buildBingoRoomRowsFromPersonRows(baseRows, roomCount, roomNames)
        .map((r) => ({ room: r.room, name: r.name, score: r.value }));
      arr.sort((a, b) => sign * (a.score - b.score));
      return arr;
    }
    const arr = [];
    for (let r = 1; r <= roomCount; r++) {
      const ppl = participants.filter(p => p.room === r);
      if (perR[r] != null) arr.push({ room: r, name: roomNames[r - 1], score: compute(previewDef, perR[r]) });
      else arr.push({ room: r, name: roomNames[r - 1], score: aggregate(ppl.map(p => compute(previewDef, perP[p.id]))) });
    }
    arr.sort((a, b) => sign * (a.score - b.score));
    return arr;
  }, [participants, perP, perR, previewDef, roomCount, roomNames, sign, holeRankForcePreview, bingoPreview]);

  // 팀(포볼) 계산: 1조/2조 기준으로 A/B팀 구성
  const teamRows = useMemo(() => {
    if (!previewDef) return [];
    if (previewDef.template === 'hole-rank-force') {
      const rows = Array.isArray(holeRankForcePreview?.teamRows)
        ? holeRankForcePreview.teamRows.map((t) => ({ key: t.key, label: t.label, score: t.value }))
        : [];
      rows.sort((a, b) => sign * (a.score - b.score));
      return rows;
    }
    if (previewDef.template === 'bingo') {
      const rows = Array.isArray(bingoPreview?.teamRows)
        ? bingoPreview.teamRows.map((t) => ({ key: t.key, label: t.label, score: t.value }))
        : [];
      rows.sort((a, b) => sign * (a.score - b.score));
      return rows;
    }
    const rows = [];
    for (let r = 1; r <= roomCount; r++) {
      const ppl = participants.filter(p => p.room === r);
      const pair1 = []; const pair2 = [];
      ppl.forEach(m => {
        const pr = getPairNo(m);
        if (pr === 2) pair2.push(m);
        else pair1.push(m); // 1 또는 NaN → 일단 1조로
      });
      const teams = [
        { key: `${r}-A`, label: `${roomNames[r - 1]} A팀`, members: pair1.slice(0,2) },
        { key: `${r}-B`, label: `${roomNames[r - 1]} B팀`, members: pair2.slice(0,2) },
      ];
      teams.forEach(t => {
        if (perT[t.key] != null) rows.push({ key: t.key, label: t.label, score: compute(previewDef, perT[t.key]) });
        else rows.push({ key: t.key, label: t.label, score: aggregate(t.members.map(m => compute(previewDef, perP[m?.id]))) });
      });
    }
    rows.sort((a, b) => sign * (a.score - b.score));
    return rows;
  }, [participants, perP, perT, previewDef, roomCount, roomNames, sign, holeRankForcePreview, bingoPreview]);


  const joRoomRows = useMemo(() => {
    if (!previewDef) return [];
    return buildJoRoomRows(personRowsBase, participants, roomCount, roomNames, viewOrder);
  }, [previewDef, personRowsBase, participants, roomCount, roomNames, viewOrder]);

  /* ── 이벤트 불러오기(다른 대회에서) ───────────────────── */
  const [importFromId, setImportFromId] = useState('');
  const [importList, setImportList] = useState([]);
  const loadImportList = async (id) => {
    if (!id) { setImportList([]); return; }
    try {
      const snap = await getDoc(doc(db, 'events', id));
      const data = snap.data() || {};
      const arr  = Array.isArray(data.events) ? data.events : [];
      setImportList(arr.map(ev => ({ ...ev, _checked: false })));
    } catch (e) {
      setImportList([]);
    }
  };
  const toggleImportCheck = (idx) => setImportList(list => { const n = [...list]; n[idx] = { ...n[idx], _checked: !n[idx]._checked }; return n; });
  const doImport = async () => {
    const picked = importList.filter(x => x._checked);
    if (!picked.length) { alert('가져올 이벤트를 선택하세요.'); return; }
    const cloned = picked.map(ev => ({ ...ev, id: uid(), enabled: true }));
    const list = [...eventsOfSelected, ...cloned];
    await updateEventImmediate({ events: list }, false);
    alert(`${picked.length}개의 이벤트를 불러왔습니다.`);
    setImportFromId(''); setImportList([]);
  };

  const formatMeta = (ev) => {
    if (ev?.template === 'group-battle') {
      const m = ev?.params?.mode === 'single' ? '개인선택' : '그룹';
      const metric = ev?.params?.metric === 'score' ? '점수' : '결과';
      return `group-battle · ${m} · ${metric}`;
    }
    if (ev?.template === 'hole-rank-force') {
      const holes = Array.isArray(ev?.params?.selectedHoles) && ev.params.selectedHoles.length ? ev.params.selectedHoles.length : 18;
      const slots = Array.isArray(ev?.params?.selectedSlots) && ev.params.selectedSlots.length ? ev.params.selectedSlots.length : 4;
      return `hole-rank-force · ${holes}홀 · 참가자${slots}명`;
    }
    if (ev?.template === 'pick-lineup') {
      const mode = ev?.params?.mode === 'jo' ? '조' : '개인';
      if (mode === '개인') {
        const count = Math.max(1, Math.min(4, Number(ev?.params?.pickCount || 1)));
        return `pick-lineup · 개인 · ${count}명 선택`;
      }
      const openGroups = Array.isArray(ev?.params?.openGroups) && ev.params.openGroups.length
        ? ev.params.openGroups.map((g) => `${g}조`).join(', ')
        : '1조';
      const lastHalf = ev?.params?.lastPlaceHalf ? ' · 꼴등반띵' : '';
      return `pick-lineup · 조 · ${openGroups}${lastHalf}`;
    }
    if (ev?.template === 'bingo') {
      return `bingo · ${getBingoCountText(ev?.params)}`;
    }
    if (ev?.template === 'group-room-hole-battle') {
      return `group-room-hole-battle · ${getGroupRoomHoleBattleMetaText(ev?.params)}`;
    }
    const t = ev.template === 'raw-number' ? 'raw-number'
      : ev.template === 'range-convert' ? 'range'
      : ev.template === 'range-convert-bonus' ? 'range+bonus'
      : 'number-convert';
    const mode = ev.inputMode === 'accumulate' ? `누적(${ev.attempts || 4})` : '갱신';
    return `${t} · ${mode}`;
  };



  /* ── group-battle: 이벤트 전용 G핸디(오버라이드) 수정 ───────────── */
  const [handicapEditId, setHandicapEditId] = useState(null);

  const openHandicapEditor = (ev) => {
    if (!ev || (ev.template !== 'group-battle' && ev.template !== 'pick-lineup')) return;
    setHandicapEditId(ev.id);
    setOpenMenuId(null);
    setMenuUpId(null);
  };

  const closeHandicapEditor = () => {
    setHandicapEditId(null);
  };

  const handicapEditEvent = useMemo(() => {
    if (!handicapEditId) return null;
    return (eventsOfSelected || []).find(e => e.id === handicapEditId) || null;
  }, [eventsOfSelected, handicapEditId]);

  const pickLineupMonitorEvent = useMemo(() => {
    if (!monitorId) return null;
    return (eventsOfSelected || []).find((e) => e.id === monitorId) || null;
  }, [eventsOfSelected, monitorId]);

  const bingoMonitorEvent = useMemo(() => {
    if (!bingoMonitorId) return null;
    return (eventsOfSelected || []).find((e) => e.id === bingoMonitorId) || null;
  }, [eventsOfSelected, bingoMonitorId]);

  const groupRoomHoleMonitorEvent = useMemo(() => {
    if (!groupRoomHoleMonitorId) return null;
    return (eventsOfSelected || []).find((e) => e.id === groupRoomHoleMonitorId) || null;
  }, [eventsOfSelected, groupRoomHoleMonitorId]);

  const saveHandicapOverrides = async (overridesMap) => {
    if (!handicapEditEvent) return;
    const safe = (overridesMap && typeof overridesMap === 'object') ? overridesMap : {};
    const next = (eventsOfSelected || []).map(e => {
      if (e.id !== handicapEditEvent.id) return e;
      const params = { ...(e.params || {}), handicapOverrides: safe };
      return { ...e, params };
    });
    await updateEventImmediate({ events: next }, false);
  };

  const togglePickLineupLock = async (locked) => {
    if (!pickLineupMonitorEvent) return;
    const next = (eventsOfSelected || []).map((e) => {
      if (e.id !== pickLineupMonitorEvent.id) return e;
      const params = { ...(e.params || {}), selectionLocked: !!locked };
      return { ...e, params };
    });
    await updateEventImmediate({ events: next }, false);
  };

  const toggleBingoInputLock = async (locked) => {
    if (!bingoMonitorEvent) return;
    const next = (eventsOfSelected || []).map((e) => {
      if (e.id !== bingoMonitorEvent.id) return e;
      const params = { ...(e.params || {}), inputLocked: !!locked };
      return { ...e, params };
    });
    await updateEventImmediate({ events: next }, false);
  };

  const toggleGroupRoomHoleLock = async (locked) => {
    if (!groupRoomHoleMonitorEvent) return;
    const next = (eventsOfSelected || []).map((e) => {
      if (e.id !== groupRoomHoleMonitorEvent.id) return e;
      const params = { ...(e.params || {}), selectionLocked: !!locked };
      return { ...e, params };
    });
    await updateEventImmediate({ events: next }, false);
  };
  /* ── 관리자 빠른 입력 ─────────────────────────────────── */
  const [quickId, setQuickId] = useState(null);
  const [quickTarget, setQuickTarget] = useState('person'); // person|room|team
  const [quickKey, setQuickKey] = useState('');
  const [quickValues, setQuickValues] = useState(['']);
  // ★ patch: 보너스 선택값(누적일 때 각 칸용)
  const [quickBonus, setQuickBonus] = useState(['']);

  /* ★ patch: 빠른입력 선택 대상 변경/실시간 데이터 반영하여 값/보너스 프리필 */
  useEffect(()=>{
    if (!quickId || !quickKey) return;
    const ev = eventsOfSelected.find(e=>e.id===quickId);
    if (!ev) return;
    const N = Math.max(2, Math.min(Number(ev.attempts || 4), 20));
    const slotAll = (eventData?.eventInputs || {})[ev.id] || {};
    if (quickTarget === 'person') {
      const rec = (slotAll.person || {})[quickKey];
      if (ev.inputMode === 'accumulate') {
        const vals = Array.from({length:N}, (_,i)=> (rec && rec.values ? (rec.values[i] ?? '') : ''));
        const bons = Array.from({length:N}, (_,i)=> (rec && rec.bonus ? (rec.bonus[i] ?? '') : ''));
        setQuickValues(vals.map(v => (v===null? '' : String(v))));
        setQuickBonus(bons.map(v => (v==null? '' : String(v))));
      } else {
        const v = (rec==null ? '' : String(rec));
        setQuickValues([v==='null'?'':v]);
        setQuickBonus(['']);
      }
    } else if (quickTarget === 'room') {
      const v = ((slotAll.room || {})[Number(quickKey)] ?? '');
      setQuickValues([v===null?'':String(v)]);
      setQuickBonus(['']);
    } else {
      const v = ((slotAll.team || {})[String(quickKey)] ?? '');
      setQuickValues([v===null?'':String(v)]);
      setQuickBonus(['']);
    }
  }, [quickId, quickKey, quickTarget, eventData]);

  const buildTeamKeys = (ev) => {
    const keys = [];
    for (let r=1; r<=roomCount; r+=1) {
      keys.push({ key:`${r}-A`, label:`${roomNames[r-1]} A팀` });
      keys.push({ key:`${r}-B`, label:`${roomNames[r-1]} B팀` });
    }
    return keys;
  };

  const openQuick = (ev) => {
    setQuickId(ev.id);
    setQuickTarget('person');
    setQuickKey('');
    const N = Math.max(2, Math.min(Number(ev.attempts || 4), 20));
    setQuickValues(Array.from({length: N}, () => ''));
    setQuickBonus(Array.from({length: N}, () => ''));
    setOpenMenuId(null); setMenuUpId(null);
    setEditAttemptsText(String(Number(ev.attempts||4)));
  };
  const applyQuick = async (ev) => {
    if (!quickKey) { alert('대상을 선택하세요.'); return; }
    const all = { ...(eventData?.eventInputs || {}) };
    const slot = { ...(all[ev.id] || {}) };

    if (quickTarget === 'person') {
      const person = { ...(slot.person || {}) };
      const N = Math.max(2, Math.min(Number(ev.attempts || 4), 20));
      if (ev.inputMode === 'accumulate') {
        const obj = { values: Array.from({length:N}, (_,i)=> {
          const v = quickValues[i];
          return (v===''||v==null) ? '' : Number(v);
        }) };
        if (ev.template === 'range-convert-bonus') {
          obj.bonus = Array.from({length:N}, (_,i)=> quickBonus[i] ?? '');
        }
        person[quickKey] = obj;
      } else {
        person[quickKey] = (quickValues[0]===''||quickValues[0]==null) ? '' : Number(quickValues[0]);
      }
      slot.person = person;
    } else if (quickTarget === 'room') {
      const room = { ...(slot.room || {}) };
      room[Number(quickKey)] = Number(quickValues[0] || 0);
      slot.room = room;
    } else { // team
      const team = { ...(slot.team || {}) };
      team[String(quickKey)] = Number(quickValues[0] || 0);
      slot.team = team;
    }

    all[ev.id] = slot;
    // ★★★ 핵심 보완: 실시간 반영 트리거 타임스탬프 추가
    await updateEventImmediate({ eventInputs: all, inputsUpdatedAt: Date.now() }, false);
    try { broadcastEventSync(eventId, { reason: 'applyQuick' }); } catch {}
    // ★★★ Firestore에도 부분 업데이트 + 트리거 필드
    try {
      if (eventId) {
        await updateDoc(doc(db, 'events', eventId), {
          [`eventInputs.${ev.id}`]: slot,
          inputsUpdatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.warn('[applyQuick] remote patch failed:', e);
    }
    setQuickId(null);
  };

  return (
    <div className={css.page} style={{ minHeight: '100dvh' }}>
      <div className={css.scrollArea} style={{ WebkitOverflowScrolling: 'touch', overflowY: 'auto', touchAction: 'pan-y' }}>
        <div className={css.grid}>

          {/* 대회 선택/연동 */}
          <section className={css.card}>
            <h4 className={css.cardTitle}>대회 선택/연동</h4>
            <div className={`${css.row} ${css.rowJustify}`}>
              <select className={`${css.select} ${css.selectGrow}`} value={selectedEvId} onChange={e => setSelectedEvId(e.target.value)}>
                <option value="">대회 선택</option>
                {allEvents.map(ev => <option key={ev.id} value={ev.id}>{ev.title || ev.id}</option>)}
              </select>
              <button className={css.btn} onClick={onLinkTournament}>연동</button>
            </div>
            <p className={css.muted}>현재 연동: <b>{eventData?.title || eventId || '-'}</b></p>
          </section>

          {/* 새 이벤트 만들기 */}
          <section className={css.card}>
            <h4 className={css.cardTitle}>새 이벤트 만들기</h4>
            <div className={css.form}>
              <label className={css.label}>템플릿
                <select className={css.select} value={form.template} onChange={e => onTemplateChange(e.target.value)}>
                  {TEMPLATE_REGISTRY.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                </select>
              </label>
              {form.template !== 'hole-rank-force' && form.template !== 'pick-lineup' && form.template !== 'bingo' && form.template !== 'group-room-hole-battle' && (
                <p className={css.help}>{getTemplateHelp(form.template)}</p>
              )}


{form.template === 'group-battle' && (
  <GroupBattleEditor
    variant="create"
    participants={participants}
    value={{
      mode: gbMode,
      metric: gbMetric,
      groups: gbGroups,
      memberIds: gbMemberIds,
    }}
    onChange={(next) => {
      if (!next) return;
      if (typeof next.mode === 'string') setGbMode(next.mode);
      if (typeof next.metric === 'string') setGbMetric(next.metric);
      if (Array.isArray(next.groups)) setGbGroups(next.groups);
      if (Array.isArray(next.memberIds)) setGbMemberIds(next.memberIds);
    }}
  />
)}

{form.template === 'hole-rank-force' && (
  <HoleRankForceEditor
    variant="create"
    value={params}
    onChange={(next) => setParams(next)}
  />
)}

{form.template === 'bingo' && (
  <BingoEditor
    variant="create"
    value={params}
    onChange={(next) => setParams(next)}
  />
)}

{form.template === 'group-room-hole-battle' && (
  <GroupRoomHoleBattleEditor
    participants={participants}
    roomNames={roomNames}
    roomCount={roomCount}
    value={params}
    onChange={(next) => setParams(next)}
  />
)}

{form.template === 'pick-lineup' && (
  <PickLineupEditor
    participants={participants}
    value={params}
    onChange={(next) => setParams(next)}
  />
)}
              {uiCreate.factor && (
                <div className={css.row}>
                  <label className={css.labelGrow}>계수(factor)
                    <input className={css.input} type="number" step="0.1" value={params.factor ?? 1}
                      onChange={e => onFactorChange(e.target.value)} />
                  </label>
                </div>
              )}

              {uiCreate.rangeTable && (
                <div className={css.rangeBox}>
                  <div className={css.rangeHead}>
                    <span>범위 편집기</span>
                    <button type="button" className={css.btn} onClick={addRangeRow}>+ 구간 추가</button>
                  </div>
                  <div className={css.rangeTable}>
                    <div className={css.rangeRowHead}>
                      <span>최소값</span><span>최대값</span><span>점수</span><span></span>
                    </div>
                    {(params.table || []).map((row, idx) => (
                      <div key={idx} className={css.rangeRow}>
                        <input className={`${css.input} ${css.center}`} type="number" step="0.01" placeholder="예: 0"
                          value={row.min ?? ''} onChange={e => onRangeChange(idx, 'min', e.target.value)} />
                        <input className={`${css.input} ${css.center}`} type="number" step="0.01" placeholder="예: 0.5"
                          value={row.max ?? ''} onChange={e => onRangeChange(idx, 'max', e.target.value)} />
                        <input className={`${css.input} ${css.center}`} type="number" step="1" placeholder="예: 3"
                          value={row.score ?? 0} onChange={e => onRangeChange(idx, 'score', e.target.value)} />
                        <button className={css.btnDanger} type="button" onClick={() => removeRangeRow(idx)}>삭제</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {uiCreate.bonusTable && (
                <div className={css.rangeBox} style={{ marginTop: 8 }}>
                  <div className={css.rangeHead}>
                    <span>보너스 항목</span>
                    <button type="button" className={css.btn} onClick={addBonusRow}>+ 항목 추가</button>
                  </div>
                  <div className={css.rangeTable}>
                    <div className={css.rangeRowHead}>
                      <span>라벨</span><span>점수</span><span></span><span></span>
                    </div>
                    {(params.bonus || []).map((row, idx) => (
                      <div key={idx} className={css.rangeRow} style={{ gridTemplateColumns:'1fr 1fr 60px 0' }}>
                        <input className={css.input} placeholder="예: 파" value={row.label ?? ''} onChange={e => onBonusChange(idx, 'label', e.target.value)} />
                        <input className={`${css.input} ${css.center}`} type="number" step="1" placeholder="예: 1" value={row.score ?? 0} onChange={e => onBonusChange(idx, 'score', e.target.value)} />
                        <button className={css.btnDanger} type="button" onClick={() => removeBonusRow(idx)}>삭제</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <label className={css.label}>제목
                <input className={css.input} value={form.title} onChange={e => setForm(s => ({ ...s, title: e.target.value }))} />
              </label>



              {uiCreate.inputMode && (
                <>
              <div className={css.row}>
                <label className={css.labelGrow}>입력방식
                  <select className={css.select} value={form.inputMode} onChange={e => setForm(s => ({ ...s, inputMode: e.target.value }))}>
                    <option value="refresh">갱신(1칸)</option>
                    <option value="accumulate">누적(여러 칸)</option>
                  </select>
                </label>
                {form.inputMode === 'accumulate' && (
                  <label className={css.labelGrow}>칸 수
                    {/* ★ 2~20까지 허용(5~N 가능) */}
                    <input className={css.input} type="text" inputMode="numeric" pattern="[0-9]*" value={attemptsText}
                      onChange={e => setAttemptsText(e.target.value)}
                      onBlur={()=>{ const n = parseInt(attemptsText,10); const safe = Number.isFinite(n) ? Math.max(2, Math.min(20, n)) : (form.attempts||4); setForm(s=>({ ...s, attempts: safe })); setAttemptsText(String(safe)); }}
                      placeholder={String(form.attempts||4)} />
                  </label>
                )}
              </div>

              {uiCreate.paramsJson && (
              <div className={css.collapse}>
                <button type="button" className={css.collapseBtn} onClick={() => setParamOpen(o => !o)}>
                  파라미터(JSON) {paramOpen ? '접기' : '열기'}
                </button>
                {paramOpen && (
                  <label className={css.label} style={{ marginTop: 8 }}>
                    <textarea className={css.textarea} rows={8}
                      value={form.paramsJson} onChange={e => setForm(s => ({ ...s, paramsJson: e.target.value }))} />
                  </label>
                )}
              </div>
              )}

                </>
              )}

              <button className={css.btnPrimary} onClick={addEvent}>이벤트 생성</button>
            </div>
          </section>

          {/* 이벤트 불러오기 */}
          <section className={css.card}>
            <h4 className={css.cardTitle}>이벤트 불러오기</h4>
            <div className={css.form}>
              <label className={css.label}>대회 선택(원본)
                <select className={css.select} value={importFromId}
                  onChange={e => { setImportFromId(e.target.value); loadImportList(e.target.value); }}>
                  <option value="">대회 선택</option>
                  {allEvents.filter(ev => ev.id !== eventId).map(ev => <option key={ev.id} value={ev.id}>{ev.title || ev.id}</option>)}
                </select>
              </label>

              {!!importFromId && (
                <div className={css.importList}>
                  {(importList || []).map((ev, idx) => (
                    <label key={idx} className={css.importItem}>
                      <input type="checkbox" checked={!!ev._checked} onChange={() => toggleImportCheck(idx)} />
                      <span className={css.importInfo}>
                        <span className={css.importTitle}>{ev.title}</span>
                        <span className={css.importMeta}>· {formatMeta(ev)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className={css.row}>
                <button className={css.btn} onClick={() => loadImportList(importFromId)}>새로고침</button>
                <button className={css.btnPrimary} onClick={doImport}>선택 이벤트 가져오기</button>
              </div>
            </div>
          </section>

          {/* 이벤트 목록 */}
          <section className={css.card}>
            <h4 className={css.cardTitle}>이벤트 목록</h4>

            {!eventsOfSelected.length && <div className={css.empty}>등록된 이벤트가 없습니다.</div>}

            {orderedEvents.map((ev) => (
              <div
                key={ev.id}
                data-event-id={ev.id}
                className={css.listItem}
                ref={(el) => {
                  if (el) listItemRefs.current[ev.id] = el;
                  else delete listItemRefs.current[ev.id];
                }}
                style={dragEventId === ev.id ? { opacity: 0.99, borderColor: '#8bb6ff', background: '#f8fbff', transform: dragLiftOn ? `translateY(${dragTranslateY}px) scale(1.012)` : 'none', boxShadow: dragLiftOn ? '0 16px 34px rgba(37,99,235,.18)' : undefined, zIndex: dragLiftOn ? 40 : undefined, position: dragLiftOn ? 'relative' : undefined, transition: dragLiftOn ? 'none' : undefined, willChange: dragLiftOn ? 'transform' : undefined } : undefined}
              >
                <div className={css.listHead}>
                  <div className={css.listTitle}><b>{ev.title}</b></div>
                  <div className={css.headRight}>
                    <span className={ev.enabled ? css.badgeOn : css.badgeOff}>{ev.enabled ? '사용' : '숨김'}</span>
                    <div className={css.moreWrap} ref={menuRef}>
                      <button
                        className={`${css.moreBtn} ${dragEventId === ev.id ? css.moreBtnDragging : ''}`}
                        onTouchStart={(e) => onMoreTouchStart(ev, e)}
                        onMouseDown={(e) => onMoreMouseDown(ev, e)}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (suppressMenuClickRef.current) {
                            suppressMenuClickRef.current = false;
                            return;
                          }
                          if (dragEventIdRef.current) {
                            clearReorderSession();
                          }
                          openMenuFromButton(ev, e.currentTarget);
                        }}
                        title="길게 눌러 순서 이동"
                      >
                        ⋮
                      </button>
                      {openMenuId === ev.id && (
                        <div className={`${css.menu} ${menuUpId===ev.id ? css.menuUp : ''}`} onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => toggleEnable(ev)}>{ev.enabled ? '숨기기' : '사용'}</button>
                          <button onClick={() => openEdit(ev)}>수정</button>
                          {ev?.template === 'group-battle' || ev?.template === 'pick-lineup' ? (
                            <>
                              <button onClick={() => openHandicapEditor(ev)}>G핸디 수정</button>
                              {ev?.template === 'pick-lineup' && (
                                <button
                                  onClick={() => {
                                    setMonitorId(ev.id);
                                    setOpenMenuId(null);
                                    setMenuUpId(null);
                                  }}
                                >
                                  선택 현황/마감
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              {ev?.template === 'bingo' && (
                                <>
                                  <button
                                    onClick={() => {
                                      setBingoMonitorId(ev.id);
                                      setBingoMonitorMode('status');
                                      setOpenMenuId(null);
                                      setMenuUpId(null);
                                    }}
                                  >
                                    입력 현황/마감
                                  </button>
                                  <button
                                    onClick={() => {
                                      setBingoMonitorId(ev.id);
                                      setBingoMonitorMode('special');
                                      setOpenMenuId(null);
                                      setMenuUpId(null);
                                    }}
                                  >
                                    Special Zone 현황
                                  </button>
                                </>
                              )}
                              {ev?.template === 'group-room-hole-battle' && (
                                <button
                                  onClick={() => {
                                    setGroupRoomHoleMonitorId(ev.id);
                                    setOpenMenuId(null);
                                    setMenuUpId(null);
                                  }}
                                >
                                  입력 현황/마감
                                </button>
                              )}
                              {templateUi(ev?.template).supportsQuickInput !== false && (
                                <button onClick={() => openQuick(ev)}>빠른 입력(관리자)</button>
                              )}
                              {templateUi(ev?.template).supportsEventInputs !== false && (
                                <button onClick={() => clearInputs(ev)}>입력 초기화</button>
                              )}
                            </>
                          )}
                          <button className={css.btnDanger} onClick={() => removeEvent(ev)}>삭제</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className={css.listMetaLine}>
                  <span className={css.meta}>{formatMeta(ev)}</span>
                </div>

                {/* 빠른 입력(관리자) – 최소 UI, 카드 바로 아래 */}
                {quickId === ev.id && (
                  <div className={css.quickEdit}>
                    <div className={css.quickRow}>
                      <select className={`${css.select} ${css.quickGrow}`} value={quickTarget}
                        onChange={(e)=>{ setQuickTarget(e.target.value); setQuickKey(''); }}>
                        <option value="person">개인</option>
                        <option value="room">방</option>
                        <option value="team">팀</option>
                <option value="group">그룹</option>
                <option value="jo">조</option>
                      </select>

                      {quickTarget === 'person' && (
                        <select className={`${css.select} ${css.quickGrow}`} value={quickKey} onChange={(e)=>setQuickKey(e.target.value)}>
                          <option value="">개인 선택</option>
                          {participants.map(p => <option key={p.id} value={p.id}>{p.nickname} ({p.room ? roomNames[p.room-1] : '-'})</option>)}
                        </select>
                      )}

                      {quickTarget === 'room' && (
                        <select className={`${css.select} ${css.quickGrow}`} value={quickKey} onChange={(e)=>setQuickKey(e.target.value)}>
                          <option value="">방 선택</option>
                          {roomNames.map((nm, i) => <option key={i+1} value={i+1}>{nm}</option>)}
                        </select>
                      )}

                      {quickTarget === 'team' && (
                        <select className={`${css.select} ${css.quickGrow}`} value={quickKey} onChange={(e)=>setQuickKey(e.target.value)}>
                          <option value="">팀 선택</option>
                          {buildTeamKeys(ev).map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                      )}
                    </div>

                    <div className={css.quickRow}>
                      {ev.inputMode === 'accumulate'
                        ? quickValues.map((v, i) => (
                            <div key={i} style={{display:'grid', gridTemplateColumns: (ev.template==='range-convert-bonus' ? '1fr 1fr' : '1fr'), gap:6, width:'100%'}}>
                              <input className={`${css.input} ${css.inputSmall}`} type="number" value={v}
                                onChange={(e)=>setQuickValues(arr=>{ const n=[...arr]; n[i]=e.target.value; return n; })} placeholder={`입력${i+1}`} />
                              {ev.template==='range-convert-bonus' && (
                                <select className={`${css.select} ${css.inputSmall}`} value={quickBonus[i]||''}
                                  onChange={(e)=>setQuickBonus(arr=>{ const n=[...arr]; n[i]=e.target.value; return n; })}>
                                  <option value="">보너스</option>
                                  {(Array.isArray(ev?.params?.bonus) ? ev.params.bonus : (Array.isArray(ev?.params?.bonusOptions) ? ev.params.bonusOptions : [])).map((b,bi)=> (<option key={bi} value={b.label ?? b}>{(b.label ?? b)}{(b.score!=null? ` (+${b.score})` : '')}</option>))}
                                </select>
                              )}
                            </div>
                          ))
                        : <input className={`${css.input} ${css.quickGrow}`} type="number" value={quickValues[0]}
                            onChange={(e)=>setQuickValues([e.target.value])} placeholder="입력값" />
                      }
                    </div>

                    <div className={css.quickRow} style={{ justifyContent:'flex-end' }}>
                      <button className={css.btn} onClick={()=>setQuickId(null)}>닫기</button>
                      <button className={css.btnPrimary} onClick={()=>applyQuick(ev)}>저장</button>
                    </div>
                  </div>
                )}

                {/* 인라인 수정 폼(기존) */}
                {editId === ev.id && editForm && (
                  <div className={css.card} style={{ marginTop: 8 }}>
                    <div className={css.form}>
                      <label className={css.label}>템플릿
                        <select className={css.select} value={editForm.template}
                          onChange={e => setEditForm(s => ({ ...s, template: e.target.value }))}>
                          {TEMPLATE_REGISTRY.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                        </select>
                      </label>


{editForm.template === 'group-battle' && (
  <GroupBattleEditor
    variant="edit"
    participants={participants}
    value={{
      mode: editGbMode,
      metric: editGbMetric,
      groups: editGbGroups,
      memberIds: editGbMemberIds,
    }}
    onChange={(next) => {
      if (!next) return;
      if (typeof next.mode === 'string') setEditGbMode(next.mode);
      if (typeof next.metric === 'string') setEditGbMetric(next.metric);
      if (Array.isArray(next.groups)) setEditGbGroups(next.groups);
      if (Array.isArray(next.memberIds)) setEditGbMemberIds(next.memberIds);
    }}
  />
)}

{editForm.template === 'hole-rank-force' && (
  <HoleRankForceEditor
    variant="edit"
    value={editParams}
    onChange={(next) => setEditParams(next)}
  />
)}

{editForm.template === 'bingo' && (
  <BingoEditor
    variant="edit"
    value={editParams}
    onChange={(next) => setEditParams(next)}
  />
)}

{editForm.template === 'group-room-hole-battle' && (
  <GroupRoomHoleBattleEditor
    participants={participants}
    roomNames={roomNames}
    roomCount={roomCount}
    value={editParams}
    onChange={(next) => setEditParams(next)}
  />
)}

{editForm.template === 'pick-lineup' && (
  <PickLineupEditor
    participants={participants}
    value={editParams}
    onChange={(next) => setEditParams(next)}
  />
)}
                      {uiEdit.factor && (
                        <div className={css.row}>
                          <label className={css.labelGrow}>계수(factor)
                            <input className={css.input} type="number" step="0.1"
                              value={editParams.factor ?? 1}
                              onChange={e => onEditFactorChange(e.target.value)} />
                          </label>
                        </div>
                      )}
                      {uiEdit.rangeTable && (
                        <div className={css.rangeBox}>
                          <div className={css.rangeHead}>
                            <span>범위 편집기</span>
                            <button type="button" className={css.btn} onClick={addEditRangeRow}>+ 구간 추가</button>
                          </div>
                          <div className={css.rangeTable}>
                            <div className={css.rangeRowHead}>
                              <span>최소값</span><span>최대값</span><span>점수</span><span></span>
                            </div>
                            {(editParams.table || []).map((row, idx) => (
                              <div key={idx} className={css.rangeRow}>
                                <input className={`${css.input} ${css.center}`} type="number" step="0.01" value={row.min ?? ''} onChange={e => onEditRangeChange(idx, 'min', e.target.value)} />
                                <input className={`${css.input} ${css.center}`} type="number" step="0.01" value={row.max ?? ''} onChange={e => onEditRangeChange(idx, 'max', e.target.value)} />
                                <input className={`${css.input} ${css.center}`} type="number" step="1" value={row.score ?? 0} onChange={e => onEditRangeChange(idx, 'score', e.target.value)} />
                                <button className={css.btnDanger} type="button" onClick={() => removeEditRangeRow(idx)}>삭제</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {uiEdit.bonusTable && (
                        <div className={css.rangeBox} style={{ marginTop: 8 }}>
                          <div className={css.rangeHead}>
                            <span>보너스 항목</span>
                            <button type="button" className={css.btn} onClick={addEditBonusRow}>+ 항목 추가</button>
                          </div>
                          <div className={css.rangeTable}>
                            <div className={css.rangeRowHead}>
                              <span>라벨</span><span>점수</span><span></span><span></span>
                            </div>
                            {(editParams.bonus || []).map((row, idx) => (
                              <div key={idx} className={css.rangeRow} style={{ gridTemplateColumns:'1fr 1fr 60px 0' }}>
                                <input className={css.input} value={row.label ?? ''} onChange={e => onEditBonusChange(idx, 'label', e.target.value)} />
                                <input className={`${css.input} ${css.center}`} type="number" step="1" value={row.score ?? 0} onChange={e => onEditBonusChange(idx, 'score', e.target.value)} />
                                <button className={css.btnDanger} type="button" onClick={() => removeEditBonusRow(idx)}>삭제</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}



                      <div className={css.row}>
                        <label className={css.labelGrow}>제목
                          <input className={css.input} value={editForm.title} onChange={e => setEditForm(s => ({ ...s, title: e.target.value }))} />
                        </label>
                      </div>

                      {uiEdit.paramsJson && (
                        <>
                      {/* JSON 접힘 */}
                      <div className={css.collapse}>
                        <button type="button" className={css.collapseBtn} onClick={() => setEditParamOpen(o => !o)}>
                          파라미터(JSON) {editParamOpen ? '접기' : '열기'}
                        </button>
                        {editParamOpen && (
                          <label className={css.label} style={{ marginTop: 8 }}>
                            <textarea className={css.textarea} rows={6}
                              value={editForm.paramsJson}
                              onChange={e => setEditForm(s => ({ ...s, paramsJson: e.target.value }))} />
                          </label>
                        )}
                      </div>

                      

                      {uiEdit.inputMode && (
                      <div className={css.row}>
                        <label className={css.labelGrow}>입력방식
                          <select className={css.select} value={editForm.inputMode} onChange={e => setEditForm(s => ({ ...s, inputMode: e.target.value }))}>
                            <option value="refresh">갱신(1칸)</option>
                            <option value="accumulate">누적(여러 칸)</option>
                          </select>
                        </label>
                        {editForm.inputMode === 'accumulate' && (
                          <label className={css.labelGrow}>칸 수
                            {/* ★ 2~20 허용 */}
                            <input className={css.input} type="text" inputMode="numeric" pattern="[0-9]*" value={editAttemptsText}
                              onChange={e => setEditAttemptsText(e.target.value)}
                              onBlur={()=>{ const n=parseInt(editAttemptsText,10); const safe=Number.isFinite(n)? Math.max(2,Math.min(20,n)) : (Number(editForm.attempts||4)); setEditForm(s=>({ ...s, attempts: safe })); setEditAttemptsText(String(safe)); }}
                              placeholder={String(editForm.attempts||4)} />
                          </label>
                        )}
                      </div>
                      )}

                        </>
                      )}

                      <div className={css.row}>
                        <button className={css.btn} onClick={() => { setEditId(null); setEditForm(null); setEditParamOpen(false); }}>취소</button>
                        <button className={css.btnPrimary} onClick={applyEdit}>저장</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </section>

          {/* 미리보기(현황) */}
          <section className={css.cardWide}>
            <h4 className={css.cardTitle}>미리보기(현황)</h4>

            <div className={css.controlsRow}>
              <select className={`${css.selectInline} ${css.selectGrow}`} value={previewId} onChange={e => setPreviewId(e.target.value)}>
                {orderedEvents.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </select>

              <select
                className={`${css.selectInline} ${css.selectSmall}`}
                value={viewTab}
                onChange={e => { const v = e.target.value; setViewTab(v); persistPreviewConfig(v, undefined); }}
              >
                <option value="person">개인</option>
                <option value="room">방</option>
                <option value="team">팀</option>
                <option value="group">그룹</option>
                <option value="jo">조</option>
              </select>

              <select
                className={`${css.selectInline} ${css.selectSmall}`}
                value={viewOrder}
                onChange={e => { const v = e.target.value; setViewOrder(v); persistPreviewConfig(undefined, v); }}
              >
                {viewTab === 'jo' ? (
                  <>
                    <option value="desc">오름</option>
                    <option value="asc">내림</option>
                  </>
                ) : (
                  <>
                    <option value="asc">오름</option>
                    <option value="desc">내림</option>
                  </>
                )}
              </select>
            </div>

            {!previewDef && <div className={css.empty}>선택된 이벤트가 없습니다.</div>}

            {previewDef && viewTab === 'person' && (
              previewDef.template === 'hole-rank-force' ? (
                <HoleRankForcePreview
                  eventDef={previewDef}
                  participants={participants}
                  inputsByEvent={inputsAll}
                  roomNames={roomNames}
                  roomCount={roomCount}
                />
              ) : previewDef.template === 'pick-lineup' ? (
                <PickLineupPreview
                  eventDef={previewDef}
                  participants={participants}
                  inputs={inputsAll?.[previewId] || {}}
                  roomNames={roomNames}
                />
              ) : previewDef.template === 'group-room-hole-battle' ? (
                <GroupRoomHoleBattlePreview
                  eventDef={previewDef}
                  participants={participants}
                  inputsByEvent={inputsAll?.[previewId] || {}}
                  roomNames={roomNames}
                  roomCount={roomCount}
                  viewTab={viewTab}
                />
              ) : (
                <ol className={css.previewList}>
                  {personRows.map((r, i) => (
                    <li key={r.id}>
                      <span><span className={css.rank}>{i + 1}.</span> {r.name} <small className={css.dim}>({r.room ? roomNames[r.room - 1] : '-'})</small></span>
                      <b className={css.score}>{fmt2(r.score)}</b>
                    </li>
                  ))}
                </ol>
              )
            )}

            {previewDef && viewTab === 'room' && (
              previewDef.template === 'group-room-hole-battle' ? (
                <GroupRoomHoleBattlePreview
                  eventDef={previewDef}
                  participants={participants}
                  inputsByEvent={inputsAll?.[previewId] || {}}
                  roomNames={roomNames}
                  roomCount={roomCount}
                  viewTab={viewTab}
                />
              ) : (
                <ol className={css.previewList}>
                  {roomRows.map((r, i) => (
                    <li key={r.room}>
                      <span><span className={css.rank}>{i + 1}.</span> {r.name}</span>
                      <b className={css.score}>{fmt2(r.score)}</b>
                    </li>
                  ))}
                </ol>
              )
            )}

            {previewDef && viewTab === 'jo' && (
              <ol className={css.previewList}>
                {joRoomRows.map((r, i) => {
                  const breakdown = Array.isArray(r.detail) && r.detail.length
                    ? r.detail.map((d) => `${d.group}조:${fmt2(d.converted)}점(${d.rank}위/${fmt2(d.rawScore)}개)`).join('·')
                    : '';
                  return (
                    <li
                      key={`jo-${r.room}`}
                      style={{
                        display: 'block',
                        alignItems: 'stretch',
                        paddingTop: 6,
                        paddingBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          minWidth: 0,
                        }}
                      >
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span className={css.rank}>{i + 1}.</span> {r.name}
                        </span>
                        <b className={css.score} style={{ flex: '0 0 auto' }}>{fmt2(r.score)}</b>
                      </div>
                      {breakdown ? (
                        <div
                          className={css.dim}
                          style={{
                            marginTop: 3,
                            paddingLeft: 0,
                            minWidth: 0,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'clip',
                            lineHeight: 1.15,
                            fontSize: 11,
                            letterSpacing: '-0.2px',
                          }}
                          title={breakdown}
                        >
                          {breakdown}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}

            {previewDef && viewTab === 'team' && (
              <ol className={css.previewList}>
                {teamRows.map((t, i) => (
                  <li key={t.key}>
                    <span><span className={css.rank}>{i + 1}.</span> {t.label}</span>
                    <b className={css.score}>{fmt2(t.score)}</b>
                  </li>
                ))}
              </ol>
            )}

            {previewDef && viewTab === 'group' && (
              <div style={{ marginTop: 8 }}>
                {previewDef.template === 'group-battle' ? (
                  <GroupBattlePreview
                    eventDef={previewDef}
                    participants={participants}
                    roomNames={roomNames}
                    order={viewOrder}
                  />
                ) : previewDef.template === 'group-room-hole-battle' ? (
                  <GroupRoomHoleBattlePreview
                    eventDef={previewDef}
                    participants={participants}
                    inputsByEvent={inputsAll?.[previewId] || {}}
                    roomNames={roomNames}
                    roomCount={roomCount}
                    viewTab={viewTab}
                  />
                ) : (
                  <div className={css.empty}>그룹 미리보기를 지원하는 이벤트가 아닙니다.</div>
                )}
              </div>
            )}
          </section>

        <div style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 120px)' }} />

        {/* 이벤트 결과 전용 G핸디 수정(다른 페이지와 연동 금지) */}
        {(handicapEditEvent?.template === 'group-battle' || handicapEditEvent?.template === 'pick-lineup') && (
          <GroupBattleHandicapEditor
            eventDef={handicapEditEvent}
            participants={participants}
            onClose={closeHandicapEditor}
            onSave={async (nextMap) => {
              await saveHandicapOverrides(nextMap);
              closeHandicapEditor();
            }}
          />
        )}

        {pickLineupMonitorEvent?.template === 'pick-lineup' && (
          <PickLineupSelectionMonitor
            eventDef={pickLineupMonitorEvent}
            participants={participants}
            inputsByEvent={(eventData?.eventInputs || {})[pickLineupMonitorEvent.id] || {}}
            roomNames={roomNames}
            onClose={() => setMonitorId(null)}
            onToggleLock={togglePickLineupLock}
          />
        )}

        {bingoMonitorEvent?.template === 'bingo' && (
          <BingoSelectionMonitor
            eventDef={bingoMonitorEvent}
            participants={participants}
            inputsByEvent={(eventData?.eventInputs || {})[bingoMonitorEvent.id] || {}}
            roomNames={roomNames}
            onClose={() => setBingoMonitorId(null)}
            onToggleLock={toggleBingoInputLock}
            initialMode={bingoMonitorMode}
          />
        )}


        {groupRoomHoleMonitorEvent?.template === 'group-room-hole-battle' && (
          <GroupRoomHoleBattleMonitor
            eventDef={groupRoomHoleMonitorEvent}
            participants={participants}
            inputsByEvent={(eventData?.eventInputs || {})[groupRoomHoleMonitorEvent.id] || {}}
            roomNames={roomNames}
            roomCount={roomCount}
            onClose={() => setGroupRoomHoleMonitorId(null)}
            onToggleLock={toggleGroupRoomHoleLock}
          />
        )}

        </div>
      </div>
    </div>
  );
}
