// /src/screens/EventManager.jsx
// - 전역 confirm 사용 → askConfirm() 래퍼로 교체(ESLint no-restricted-globals 해결) ★
// - "대회 선택/연동" 행을 한 줄로 꽉 차게(셀렉트 확장 + 버튼 오른쪽 정렬) ★
// - 범위 편집기는 JSX 구조 유지, CSS로 width:100%/min-width:0 처리(오른쪽 넘어감 방지) ★
// - 미리보기 컨트롤 바(Grid 1fr auto auto) 유지(오른쪽 잘림 방지) ★
// - 나머지는 기존 동작/레이아웃 그대로 유지

import React, { useContext, useMemo, useState, useEffect, useRef } from 'react';
import { EventContext } from '../contexts/EventContext';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import css from './EventManager.module.css';

const uid = () => Math.random().toString(36).slice(2, 10);

/** 템플릿(순서: 숫자 입력, 숫자 범위→점수, 숫자×계수) */
const TEMPLATES = [
  { type: 'raw-number',     label: '숫자 입력(그대로 점수)', defaultParams: { aggregator: 'sum' } },
  { type: 'range-convert',  label: '숫자 범위→점수(테이블)', defaultParams: { aggregator: 'sum', table: [{min:0,max:0.5,score:3},{min:0.51,max:1,score:2},{min:1.1,max:1.5,score:1}] } },
  { type: 'number-convert', label: '숫자 × 계수(환산)',       defaultParams: { aggregator: 'sum', factor: 1 } },
];

const ParamHelp = ({ template }) => {
  if (template === 'range-convert')  return <p className={css.help}>* 구간별 점수표로 환산합니다. <b>범위 편집기</b>에서 구간/점을 관리하세요.</p>;
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

  const onTemplateChange = (t) => {
    const def = TEMPLATES.find(x => x.type === t);
    setForm(s => ({ ...s, template: t, paramsJson: JSON.stringify(def?.defaultParams || {}, null, 2) }));
  };

  const getParams = () => { try { return JSON.parse(form.paramsJson || '{}'); } catch { return {}; } };
  const params = getParams();
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
    if (key === 'min' || key === 'max') row[key] = v === '' ? '' : Number(v);
    if (key === 'score') row[key] = Number(v || 0);
    table[idx] = row;
    setParams({ ...params, table, aggregator: params.aggregator || 'sum' });
  };
  const addRangeRow    = () => setParams(p => ({ ...p, table: [ ...(Array.isArray(p.table) ? p.table : []), { min: '', max: '', score: 0 } ], aggregator: p.aggregator || 'sum' }));
  const removeRangeRow = (idx) => setParams(p => { const t = [ ...(Array.isArray(p.table) ? p.table : []) ]; t.splice(idx, 1); return { ...p, table: t }; });

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
  const menuRef = useRef(null);
  useEffect(() => {
    const onClick = (e) => {
      if (!menuRef.current) { setOpenMenuId(null); return; }
      if (!menuRef.current.contains(e.target)) setOpenMenuId(null);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const toggleEnable = async (ev) => {
    const next = eventsOfSelected.map(e => e.id === ev.id ? { ...e, enabled: !e.enabled } : e);
    await updateEventImmediate({ events: next }, false);
    setOpenMenuId(null);
  };

  const removeEvent = async (ev) => {
    if (!askConfirm('삭제하시겠어요?')) return;            // ★ 안전 래퍼
    const next = eventsOfSelected.filter(e => e.id !== ev.id);
    await updateEventImmediate({ events: next }, false);
    setOpenMenuId(null);
  };

  /* ── 수정 인라인 폼 ───────────────────────────────────── */
  const [editId, setEditId] = useState(null);
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
    setOpenMenuId(null);
  };

  const editParams = useMemo(() => { try { return JSON.parse(editForm?.paramsJson || '{}'); } catch { return {}; } }, [editForm]);
  const setEditParams = (updater) => {
    setEditForm(s => {
      if (!s) return s;
      const next = typeof updater === 'function' ? updater(editParams) : updater;
      return { ...s, paramsJson: JSON.stringify(next || {}, null, 2) };
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
    const scoreOf = (n) => {
      const v = Number(n ?? 0);
      if (t === 'raw-number') return v;
      if (t === 'number-convert') return Math.round(v * Number(p.factor ?? 1));
      if (t === 'range-convert') {
        const tb = Array.isArray(p.table) ? p.table : [];
        for (const r of tb) {
          const okMin = r.min === '' || r.min == null || v >= Number(r.min);
          const okMax = r.max === '' || r.max == null || v <= Number(r.max);
          if (okMin && okMax) return Number(r.score ?? 0);
        }
        return 0;
      }
      return v;
    };
    return arr.map(scoreOf).reduce((a, b) => a + b, 0);
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
      setImportList(arr.map(ev => ({ ...ev, _checked: false })));   // ★ 괄호 누락 보완
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
      : 'number-convert';
    const mode = ev.inputMode === 'accumulate' ? `누적(${ev.attempts || 4})` : '갱신';
    return `${t} · ${mode}`;
  };

  return (
    <div className={css.page}>
      <div className={css.scrollArea}>
        <div className={css.grid}>

          {/* 대회 선택/연동 */}
          <section className={css.card}>
            <h4 className={css.cardTitle}>대회 선택/연동</h4>
            {/* ★ 한 줄로 꽉 차게: select는 확장, 버튼은 오른쪽 */}
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

              {form.template === 'range-convert' && (
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
                    <input className={css.input} type="number" min={2} max={8} value={form.attempts}
                      onChange={e => setForm(s => ({ ...s, attempts: Number(e.target.value || 4) }))} />
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
                      <button className={css.moreBtn} onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === ev.id ? null : ev.id); }}>⋮</button>
                      {openMenuId === ev.id && (
                        <div className={css.menu} onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => toggleEnable(ev)}>{ev.enabled ? '숨기기' : '사용'}</button>
                          <button onClick={() => openEdit(ev)}>수정</button>
                          <button className={css.btnDanger} onClick={() => removeEvent(ev)}>삭제</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className={css.listMetaLine}>
                  <span className={css.meta}>{formatMeta(ev)}</span>
                </div>

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
                      {editForm.template === 'range-convert' && (
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
                            <input className={css.input} type="number" min={2} max={8} value={editForm.attempts}
                              onChange={e => setEditForm(s => ({ ...s, attempts: Number(e.target.value || 4) }))} />
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

            {/* grid: 1fr(이벤트) + auto(보기) + auto(정렬). 오른쪽 잘림 방지 */}
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
                    <b className={css.score}>{r.score}</b>
                  </li>
                ))}
              </ol>
            )}

            {previewDef && viewTab === 'room' && (
              <ol className={css.previewList}>
                {roomRows.map((r, i) => (
                  <li key={r.room}>
                    <span><span className={css.rank}>{i + 1}.</span> {r.name}</span>
                    <b className={css.score}>{r.score}</b>
                  </li>
                ))}
              </ol>
            )}

            {previewDef && viewTab === 'team' && (
              <ol className={css.previewList}>
                {teamRows.map((t, i) => (
                  <li key={t.key}>
                    <span><span className={css.rank}>{i + 1}.</span> {t.label}</span>
                    <b className={css.score}>{t.score}</b>
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
