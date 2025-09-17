// /src/screens/EventManager.jsx
// - 햄버거 메뉴 flip(하단 아이템은 위로 열기) + 카드 overflow 보정
// - 누적 칸수 2~20 허용(5~N 가능) + 4칸 기준 폭 고정, 5칸↑ 가로 스크롤
// - '입력 초기화', '빠른 입력(관리자)' 메뉴 추가
// - 새 템플릿 range-convert-bonus(보너스) 추가 + 편집/집계 지원
// - 미리보기 점수 표시는 소수점 '두 자리까지만' 포맷

import React, { useContext, useMemo, useState, useEffect, useRef } from 'react';
import { EventContext } from '../contexts/EventContext';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import css from './EventManager.module.css';

const uid = () => Math.random().toString(36).slice(2, 10);

/** 템플릿(기존 + 보너스 추가) */
const TEMPLATES = [
  { type: 'raw-number',     label: '숫자 입력(그대로 점수)', defaultParams: { aggregator: 'sum' } },
  { type: 'range-convert',  label: '숫자 범위→점수(테이블)', defaultParams: { aggregator: 'sum', table: [{min:0,max:0.5,score:3},{min:0.51,max:1,score:2},{min:1.1,max:1.5,score:1}] } },
  { type: 'range-convert-bonus', label: '숫자 범위→점수(테이블)+보너스', defaultParams: { aggregator: 'sum', table: [{min:0,max:0.5,score:3},{min:0.51,max:1,score:2},{min:1.1,max:1.5,score:1}], bonus: [{label:'파',score:1},{label:'버디',score:2}] } },
  { type: 'number-convert', label: '숫자 × 계수(환산)',       defaultParams: { aggregator: 'sum', factor: 1 } },
];

const ParamHelp = ({ template }) => {
  if (template === 'range-convert')  return <p className={css.help}>* 구간별 점수표로 환산합니다. <b>범위 편집기</b>에서 구간/점을 관리하세요.</p>;
  if (template === 'range-convert-bonus') return <p className={css.help}>* 구간별 점수표 환산 + <b>보너스</b> 점수를 추가로 더합니다. 아래 보너스 항목을 등록하세요.</p>;
  if (template === 'number-convert') return <p className={css.help}>* 입력값에 <b>계수(factor)</b>를 곱해 환산합니다.</p>;
  return <p className={css.help}>* 입력 숫자를 그대로 점수로 사용합니다.</p>;
};

// 참가자 객체에서 '조' 값을 폭넓게 추출(팀 계산용)
function getPairNo(p){
  const cand = p?.pair ?? p?.pairNo ?? p?.pairNumber ?? p?.jo ?? p?.groupNo ?? p?.teamPair ?? p?.pairIndex;
  const n = Number(cand);
  if (Number.isFinite(n)) return n;               // 1 또는 2 예상
  const ord = Number(p?.order ?? p?.orderInRoom ?? p?.seat ?? p?.index);
  if (Number.isFinite(ord)) return ord % 2 === 1 ? 1 : 2; // 홀=1조, 짝=2조 추정
  return NaN;
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

export default function EventManager() {
  const { allEvents = [], eventId, eventData, loadEvent, updateEventImmediate } = useContext(EventContext) || {};

  /* ── 대회 연동 ───────────────────────────────────────── */
  const [selectedEvId, setSelectedEvId] = useState(eventId || '');
  const onLinkTournament = async () => {
    if (!selectedEvId) { alert('대회를 선택하세요.'); return; }
    await loadEvent(selectedEvId);
  };

  /* ── 새 이벤트 만들기 ─────────────────────────────────── */
  const eventsOfSelected = useMemo(() => Array.isArray(eventData?.events) ? eventData.events : [], [eventData]);

  const [form, setForm] = useState({
    title: '',
    template: 'raw-number',
    inputMode: 'refresh',     // refresh | accumulate
    attempts: 4,
    paramsJson: JSON.stringify(TEMPLATES[0].defaultParams, null, 2),
  });
  const [paramOpen, setParamOpen] = useState(false); // 기본 닫힘

  // ★ patch: 칸수 삭제-재입력 가능하도록 텍스트 상태 병행
  const [attemptsText, setAttemptsText] = useState('');

  const onTemplateChange = (t) => {
    const def = TEMPLATES.find(x => x.type === t);
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
      const parsed = JSON.parse(form.paramsJson || '{}');
      const item = {
        id: uid(),
        title: form.title.trim() || '이벤트',
        template: form.template,
        params: parsed,
        target: 'person',
        rankOrder: 'asc',
        inputMode: form.inputMode,                // refresh | accumulate
        attempts: Number(form.attempts || 4),     // 누적 칸수
        enabled: true,
      };
      const list = [...eventsOfSelected, item];
      await updateEventImmediate({ events: list }, false);
      setForm({
        title: '',
        template: 'raw-number',
        inputMode: 'refresh',
        attempts: 4,
        paramsJson: JSON.stringify(TEMPLATES[0].defaultParams, null, 2),
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

  const onOpenMenu = (ev, e) => {
    e.stopPropagation();
    const id = (openMenuId === ev.id) ? null : ev.id;
    setOpenMenuId(id);
    setTimeout(() => {
      try {
        const btnRect = e.currentTarget.getBoundingClientRect();
        const spaceBelow = window.innerHeight - btnRect.bottom;
        const NEED = 160; // 메뉴 높이 대략치
        setMenuUpId(spaceBelow < NEED ? ev.id : null);
      } catch {
        setMenuUpId(null);
      }
    }, 0);
  };

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
    const all = { ...(eventData?.eventInputs || {}) };
    delete all[ev.id];
    // ★★★ 핵심 보완: 실시간 반영 트리거 타임스탬프 추가
    await updateEventImmediate({ eventInputs: all, inputsUpdatedAt: Date.now() }, false);
    // ★★★ Firestore에서도 해당 이벤트 입력 필드를 삭제 + 트리거 필드 갱신
    try {
      if (eventId) {
        await updateDoc(doc(db, 'events', eventId), {
          [`eventInputs.${ev.id}`]: deleteField(),
          inputsUpdatedAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.warn('[clearInputs] remote patch failed:', e);
    }
    setOpenMenuId(null); setMenuUpId(null);
    setEditAttemptsText(String(Number(ev.attempts||4)));
  };

  /* ── 수정 인라인 폼 ───────────────────────────────────── */
  const [editId, setEditId] = useState(null);
  // ★ patch: 수정폼 칸수 텍스트 상태
  const [editAttemptsText, setEditAttemptsText] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [editParamOpen, setEditParamOpen] = useState(false); // 기본 닫힘

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
      const parsed = JSON.parse(editForm.paramsJson || '{}');
      const next = eventsOfSelected.map(e => e.id === editId ? {
        ...e,
        title: editForm.title.trim() || e.title,
        template: editForm.template,
        params: parsed,
        inputMode: editForm.inputMode,
        attempts: Number(editForm.attempts || 4),
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
  const [viewTab, setViewTab] = useState('person'); // person | room | team
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

  const participants = Array.isArray(eventData?.participants) ? eventData.participants : [];
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

  const personRows = useMemo(() => {
    if (!previewDef) return [];
    const rows = participants.map(p => ({ id: p.id, name: p.nickname, room: p.room, score: compute(previewDef, perP[p.id]) }));
    rows.sort((a, b) => sign * (a.score - b.score));
    return rows;
  }, [participants, perP, previewDef, sign]);

  const roomRows = useMemo(() => {
    if (!previewDef) return [];
    const arr = [];
    for (let r = 1; r <= roomCount; r++) {
      const ppl = participants.filter(p => p.room === r);
      if (perR[r] != null) arr.push({ room: r, name: roomNames[r - 1], score: compute(previewDef, perR[r]) });
      else arr.push({ room: r, name: roomNames[r - 1], score: aggregate(ppl.map(p => compute(previewDef, perP[p.id]))) });
    }
    arr.sort((a, b) => sign * (a.score - b.score));
    return arr;
  }, [participants, perP, perR, previewDef, roomCount, roomNames, sign]);

  // 팀(포볼) 계산: 1조/2조 기준으로 A/B팀 구성
  const teamRows = useMemo(() => {
    if (!previewDef) return [];
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
  }, [participants, perP, perT, previewDef, roomCount, roomNames, sign]);

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
    const t = ev.template === 'raw-number' ? 'raw-number'
      : ev.template === 'range-convert' ? 'range'
      : ev.template === 'range-convert-bonus' ? 'range+bonus'
      : 'number-convert';
    const mode = ev.inputMode === 'accumulate' ? `누적(${ev.attempts || 4})` : '갱신';
    return `${t} · ${mode}`;
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
    <div className={css.page}>
      <div className={css.scrollArea}>
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
                  {TEMPLATES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                </select>
              </label>
              <ParamHelp template={form.template} />

              {form.template === 'number-convert' && (
                <div className={css.row}>
                  <label className={css.labelGrow}>계수(factor)
                    <input className={css.input} type="number" step="0.1" value={params.factor ?? 1}
                      onChange={e => onFactorChange(e.target.value)} />
                  </label>
                </div>
              )}

              {(form.template === 'range-convert' || form.template === 'range-convert-bonus') && (
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

              {form.template === 'range-convert-bonus' && (
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

              {/* 파라미터(JSON) - 기본 접힘 */}
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
                      <span className={css.importTitle}>{ev.title}</span>
                      <span className={css.meta}> · {formatMeta(ev)}</span>
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

            {eventsOfSelected.map(ev => (
              <div key={ev.id} className={css.listItem}>
                <div className={css.listHead}>
                  <div className={css.listTitle}><b>{ev.title}</b></div>
                  <div className={css.headRight}>
                    <span className={ev.enabled ? css.badgeOn : css.badgeOff}>{ev.enabled ? '사용' : '숨김'}</span>
                    <div className={css.moreWrap} ref={menuRef}>
                      <button className={css.moreBtn} onClick={(e) => onOpenMenu(ev, e)}>⋮</button>
                      {openMenuId === ev.id && (
                        <div className={`${css.menu} ${menuUpId===ev.id ? css.menuUp : ''}`} onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => toggleEnable(ev)}>{ev.enabled ? '숨기기' : '사용'}</button>
                          <button onClick={() => openEdit(ev)}>수정</button>
                          <button onClick={() => openQuick(ev)}>빠른 입력(관리자)</button>
                          <button onClick={() => clearInputs(ev)}>입력 초기화</button>
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
                          {TEMPLATES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                        </select>
                      </label>

                      {editForm.template === 'number-convert' && (
                        <div className={css.row}>
                          <label className={css.labelGrow}>계수(factor)
                            <input className={css.input} type="number" step="0.1"
                              value={editParams.factor ?? 1}
                              onChange={e => onEditFactorChange(e.target.value)} />
                          </label>
                        </div>
                      )}
                      {(editForm.template === 'range-convert' || editForm.template === 'range-convert-bonus') && (
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

                      {editForm.template === 'range-convert-bonus' && (
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

                      <div className={css.row}>
                        <label className={css.labelGrow}>제목
                          <input className={css.input} value={editForm.title} onChange={e => setEditForm(s => ({ ...s, title: e.target.value }))} />
                        </label>
                      </div>

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
                {eventsOfSelected.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </select>

              <select
                className={`${css.selectInline} ${css.selectSmall}`}
                value={viewTab}
                onChange={e => { const v = e.target.value; setViewTab(v); persistPreviewConfig(v, undefined); }}
              >
                <option value="person">개인</option>
                <option value="room">방</option>
                <option value="team">팀</option>
              </select>

              <select
                className={`${css.selectInline} ${css.selectSmall}`}
                value={viewOrder}
                onChange={e => { const v = e.target.value; setViewOrder(v); persistPreviewConfig(undefined, v); }}
              >
                <option value="asc">오름</option>
                <option value="desc">내림</option>
              </select>
            </div>

            {!previewDef && <div className={css.empty}>선택된 이벤트가 없습니다.</div>}

            {previewDef && viewTab === 'person' && (
              <ol className={css.previewList}>
                {personRows.map((r, i) => (
                  <li key={r.id}>
                    <span><span className={css.rank}>{i + 1}.</span> {r.name} <small className={css.dim}>({r.room ? roomNames[r.room - 1] : '-'})</small></span>
                    <b className={css.score}>{fmt2(r.score)}</b>
                  </li>
                ))}
              </ol>
            )}

            {previewDef && viewTab === 'room' && (
              <ol className={css.previewList}>
                {roomRows.map((r, i) => (
                  <li key={r.room}>
                    <span><span className={css.rank}>{i + 1}.</span> {r.name}</span>
                    <b className={css.score}>{fmt2(r.score)}</b>
                  </li>
                ))}
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
          </section>

        </div>
      </div>
    </div>
  );
}
