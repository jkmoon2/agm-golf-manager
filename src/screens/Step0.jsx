// /src/screens/Step0.jsx

import React, { useState, useContext, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventContext } from '../contexts/EventContext';
import styles from './Step0.module.css';
// ★ patch: 접속 가능 시간 갱신 시각을 남기기 위해 serverTimestamp 사용
import { serverTimestamp } from 'firebase/firestore';

export default function Step0() {
  const { createEvent, loadEvent, deleteEvent, allEvents, updateEventById } = useContext(EventContext);
  const [viewMode, setViewMode]     = useState('stroke');
  // (hotfix) locally hide deleted events to prevent reappearing in list
  const HIDDEN_KEY = 'agmHiddenEventIds.v1';
  const [hiddenEventIds, setHiddenEventIds] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(HIDDEN_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });

  const hideEventLocally = (id) => {
    if (!id) return;
    setHiddenEventIds((prev) => {
      if (prev && prev.includes(id)) return prev;
      const next = [...(prev || []), id];
      try { if (typeof window !== 'undefined') localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // normalize historic mode values (agm -> fourball)
  const normMode = (m) => (m === 'agm' ? 'fourball' : (m || 'stroke'));
  // default to STROKE on first mount (ignore previous local storage to fix inconsistent state)
  useEffect(() => {
    setViewMode('stroke');
    try { localStorage.setItem('homeViewMode','stroke'); } catch {}
  }, []);
  const [selectedId, setSelectedId] = useState(null);
  const navigate = useNavigate();

  // 새 대회 생성 모달
  const [openCreate, setOpenCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDateStart, setNewDateStart] = useState('');
  const [newDateEnd, setNewDateEnd] = useState('');
  const [duringOnly, setDuringOnly] = useState(false);
  const [useCustomId, setUseCustomId] = useState(false);
  const [customId, setCustomId] = useState('');

  // ★ patch(time): 생성 모달용 시간 옵션 상태
  const [newUseTime,   setNewUseTime]   = useState(false);
  const [newTimeStart, setNewTimeStart] = useState(''); // "HH:mm"
  const [newTimeEnd,   setNewTimeEnd]   = useState(''); // "HH:mm"

  // 편집 모달
  const [editing, setEditing] = useState(null);
  const [editDateStart, setEditDateStart] = useState('');
  const [editDateEnd, setEditDateEnd] = useState('');
  const [editDuringOnly, setEditDuringOnly] = useState(false);

  // ★ patch(time): 편집 모달용 시간 옵션 상태
  const [editUseTime,   setEditUseTime]   = useState(false);
  const [editTimeStart, setEditTimeStart] = useState('');
  const [editTimeEnd,   setEditTimeEnd]   = useState('');

  // ⋮ 메뉴
  const [openMenuId, setOpenMenuId] = useState(null);
  useEffect(() => {
    const onDocClick = () => setOpenMenuId(null);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);
  const filtered = useMemo(() => {
    const hidden = new Set(hiddenEventIds || []);
    return (allEvents || [])
      .filter((e) => normMode(e.mode) === viewMode)
      .filter((e) => !hidden.has(e.id))
      .filter((e) => !e.deleted && !e.isDeleted);
  }, [allEvents, viewMode, hiddenEventIds]);
  const fmt = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? s.replaceAll('-', '.') : '미정';
  const isClosed = (dateEnd) => {
    // ★ patch: 정규식 오타 수정 (\d2 -> \d{2})
    if (!dateEnd || !/^\d{4}-\d{2}-\d{2}$/.test(dateEnd)) return false;
    const end = new Date(`${dateEnd}T23:59:59`);
    return Date.now() > end.getTime();
  };

  // ★ patch: 문자열 날짜를 절대시간(ms)로 계산 (로컬 기준 00:00/23:59:59)
  const toMillis = (dateStr, kind /* 'start' | 'end' */) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    const t = kind === 'start' ? '00:00:00' : '23:59:59';
    const d = new Date(`${dateStr}T${t}`);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  };

  // ★ patch(time): 날짜+시간(HH:mm)을 절대시간(ms)로 계산 (체크 안하면 00:00/23:59)
  const pad2 = (n) => String(n).padStart(2,'0');
  const toMillisWithTime = (dateStr, timeStr, kind /* 'start'|'end' */) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    const safe = (timeStr && /^\d{2}:\d{2}$/.test(timeStr))
      ? timeStr
      : (kind === 'start' ? '00:00' : '23:59');
    const d = new Date(`${dateStr}T${safe}:00`);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  };
  const msToTimeHHmm = (ms) => {
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  const handleLoad = async () => {
    if (!selectedId) { alert('불러올 대회를 선택해주세요.'); return; }
    await loadEvent(selectedId);
    navigate('/admin/home/1');
  };

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) { alert('대회명을 입력해 주세요.'); return; }
    if (newDateStart && newDateEnd) {
      const s = new Date(`${newDateStart}T00:00:00`);
      const e = new Date(`${newDateEnd}T23:59:59`);
      if (s.getTime() > e.getTime()) { alert('종료일은 시작일 이후여야 합니다.'); return; }
      // ★ 선택적으로 동일 날짜 + 시간 역전 방지(옵션) — 레이아웃 영향 없음
      if (newUseTime && newDateStart === newDateEnd && newTimeStart && newTimeEnd) {
        if (new Date(`${newDateStart}T${newTimeStart}:00`).getTime() >
            new Date(`${newDateEnd}T${newTimeEnd}:00`).getTime()) {
          alert('종료 시간은 시작 시간 이후여야 합니다.');
          return;
        }
      }
    }
    // ★ patch: 접속 가능 절대 구간을 함께 저장(시간 옵션 반영)
    const accessStartAt = toMillisWithTime(newDateStart, newUseTime ? newTimeStart : '', 'start');
    const accessEndAt   = toMillisWithTime(newDateEnd,   newUseTime ? newTimeEnd   : '', 'end');

    const newId = await createEvent({
      title, mode: viewMode,
      id: useCustomId && customId.trim() ? customId.trim() : undefined,
      dateStart: newDateStart || '',
      dateEnd:   newDateEnd   || '',
      allowDuringPeriodOnly: duringOnly,
      // ▼ 숨기기 기능(참가자 페이지에서 숨김) — 기본값 false
      isHidden: false,
      // ▼ 추가 필드(완전 추가만, 기존 코드 영향 없음)
      accessStartAt: accessStartAt ?? null,
      accessEndAt:   accessEndAt   ?? null,
      accessUpdatedAt: serverTimestamp(),
      // ▼ 사람이 읽기 좋은 시간 문자열(옵션 저장)
      timeStart: newUseTime ? (newTimeStart || null) : null,
      timeEnd:   newUseTime ? (newTimeEnd   || null) : null
    });
    setSelectedId(newId);
    setOpenCreate(false);
    setNewTitle(''); setNewDateStart(''); setNewDateEnd(''); setDuringOnly(false); setUseCustomId(false); setCustomId('');
    // 시간 옵션 상태도 초기화
    setNewUseTime(false); setNewTimeStart(''); setNewTimeEnd('');
    alert('새 대회가 생성되었습니다. 목록에서 선택 후 불러오기를 눌러주세요.');
  };

  const handleCopy = (id) => {
    const url = `${window.location.origin}/join/${id}`;
    navigator.clipboard.writeText(url);
    alert(`링크가 복사되었습니다:\n${url}`);
  };
  
  // ▼ 숨기기 토글: 숨기면 참가자 페이지(공개 목록)에서 보이지 않도록 처리
  const handleToggleHidden = async (evt) => {
    try {
      if (!evt?.id) return;
      const nextHidden = !evt?.isHidden;
      const msg = nextHidden
        ? '이 대회를 숨기면 참가자 페이지에서 보이지 않습니다.\n숨기겠습니까?'
        : '숨김을 해제하면 참가자 페이지에서 다시 보입니다.\n해제하겠습니까?';
      if (!window.confirm(msg)) return;

      await updateEventById(evt.id, {
        isHidden: nextHidden,
        hiddenUpdatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('[Step0] toggle hidden failed', e);
      alert('숨기기 설정 중 오류가 발생했습니다. 콘솔을 확인해 주세요.');
    }
  };

  const handleDelete = async (id) => {
    if (!id) return;
    if (!window.confirm('정말 삭제하시겠습니까? (복구 불가)')) return;

    // ✅ 기존: delete 실패해도 로컬에서 숨겨져 "삭제된 것처럼" 보이는 문제
    // ✅ 개선: 실제 delete 성공 후에만 목록에서 사라지도록 처리 (실패 시 경고)
    try {
      await deleteEvent(id);
      if (selectedId === id) setSelectedId(null);
      setOpenMenuId(null);
    } catch (e) {
      console.error('[Step0] deleteEvent failed:', e);
      const msg = String(e?.message || e || '');
      if (msg.toLowerCase().includes('permission')) {
        alert('삭제 실패: 관리자 권한이 없습니다. (a@a.com) 로그인 상태를 확인해 주세요.');
      } else {
        alert('삭제 실패: 네트워크/권한 문제로 삭제되지 않았습니다. 콘솔 로그를 확인해 주세요.');
      }
    }
  };

  const openEditModal = (evt) => {
    setEditing(evt);
    setEditDateStart(evt.dateStart || '');
    setEditDateEnd(evt.dateEnd || '');
    setEditDuringOnly(!!evt.allowDuringPeriodOnly);
    // ★ patch(time): 저장된 값으로 시간 필드 초기화 (없으면 accessStart/End에서 복원)
    const hasTime = !!(evt?.timeStart || evt?.timeEnd);
    const fallbackStart = evt?.accessStartAt ? msToTimeHHmm(evt.accessStartAt) : '';
    const fallbackEnd   = evt?.accessEndAt   ? msToTimeHHmm(evt.accessEndAt)   : '';
    setEditUseTime(hasTime);
    setEditTimeStart(evt?.timeStart ?? fallbackStart);
    setEditTimeEnd(evt?.timeEnd ?? fallbackEnd);
  };
  const saveEdit = async () => {
    if (editDateStart && editDateEnd) {
      const s = new Date(`${editDateStart}T00:00:00`);
      const e = new Date(`${editDateEnd}T23:59:59`);
      if (s.getTime() > e.getTime()) { alert('종료일은 시작일 이후여야 합니다.'); return; }
      if (editUseTime && editDateStart === editDateEnd && editTimeStart && editTimeEnd) {
        if (new Date(`${editDateStart}T${editTimeStart}:00`).getTime() >
            new Date(`${editDateEnd}T${editTimeEnd}:00`).getTime()) {
          alert('종료 시간은 시작 시간 이후여야 합니다.');
          return;
        }
      }
    }
    // ★ patch: 편집 저장 시에도 절대 구간 동기화(시간 옵션 반영)
    const accessStartAt = toMillisWithTime(editDateStart, editUseTime ? editTimeStart : '', 'start');
    const accessEndAt   = toMillisWithTime(editDateEnd,   editUseTime ? editTimeEnd   : '', 'end');

    await updateEventById(editing.id, {
      dateStart: editDateStart || '',
      dateEnd:   editDateEnd   || '',
      allowDuringPeriodOnly: editDuringOnly,
      // ▼ 추가 필드(완전 추가만, 기존 코드 영향 없음)
      accessStartAt: accessStartAt ?? null,
      accessEndAt:   accessEndAt   ?? null,
      accessUpdatedAt: serverTimestamp(),
      // ▼ 사람이 읽기 좋은 시간 문자열(옵션 저장)
      timeStart: editUseTime ? (editTimeStart || null) : null,
      timeEnd:   editUseTime ? (editTimeEnd   || null) : null
    });
    setEditing(null);
  };

  // 모달용 간단 스타일
  const modal = {
    overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 },
    box: { width:'min(680px,92vw)', background:'#fff', borderRadius:14, padding:'1rem', boxShadow:'0 10px 30px rgba(0,0,0,.15)' },
    header: { fontSize:'1.05rem', fontWeight:700, marginBottom:'.6rem' },
    row: { display:'flex', alignItems:'center', gap:'.5rem', margin:'.5rem 0' },
    label: { minWidth:68, fontSize:'.9rem', color:'#374151' },
    input: { height:40, padding:'0 .6rem', border:'1px solid #d1d5db', borderRadius:8, fontSize:'.95rem', flex:1 },
    help: { fontSize:'.86rem', color:'#4b5563', fontWeight:400 },
    footer: { display:'flex', justifyContent:'flex-end', gap:'.5rem', marginTop:'.6rem' }
  };

  return (
    <div className={styles.container}>
      {/* 탭 */}
      <div className={styles.tabContainer}>
        <button className={`${styles.tabBtn} ${viewMode==='stroke'?styles.active:''}`} onClick={() => { setViewMode('stroke'); try{localStorage.setItem('homeViewMode','stroke')}catch{}; }}>스트로크</button>
        <button className={`${styles.tabBtn} ${viewMode==='fourball'?styles.active:''}`} onClick={() => { setViewMode('fourball'); try{localStorage.setItem('homeViewMode','fourball')}catch{}; }}>AGM 포볼</button>
      </div>

      {/* 리스트 */}
      <ul className={styles.list}>
        {filtered.map(evt => {
          const count = Array.isArray(evt.participants) ? evt.participants.length : 0;
          const closed = isClosed(evt.dateEnd);
          const isOpenMenu = openMenuId === evt.id;

          return (
            <li
              key={evt.id}
              className={`${styles.item} ${selectedId===evt.id?styles.selected:''}`}
              onClick={() => setSelectedId(evt.id)}
            >
              <div className={styles.cardRow}>
                <div className={styles.cardMain}>
                  <div className={styles.titleRow}>
                    <h3 className={styles.title} title={evt.title}>{evt.title}</h3>
                    <span className={`${styles.badge} ${(normMode(evt.mode) === 'fourball')?styles.badgeFour:styles.badgeStroke}`}>
                      {(normMode(evt.mode) === 'fourball') ? 'AGM 포볼' : '스트로크'}
                    </span>
                    {/* ★ patch: 종료 라벨을 윗줄로 이동(배지 옆) */}
                    {closed && <span className={styles.closed}>종료</span>}
                  </div>

                  <div className={styles.subline}>
                    <span>👥 참가자 {count}명</span>
                    <span>📅 {fmt(evt.dateStart)} ~ {fmt(evt.dateEnd)}</span>
                    {/* (이전 위치) {closed && <span className={styles.closed}>종료</span>} */}
                  </div>
                </div>

                {/* ⋮ 더보기 */}
                <div className={styles.moreWrap} onClick={(e)=>e.stopPropagation()}>
                  <button
                    className={styles.moreBtn}
                    aria-haspopup="menu"
                    aria-expanded={isOpenMenu}
                    onClick={() => setOpenMenuId(isOpenMenu ? null : evt.id)}
                    title="더보기"
                  >⋮</button>

                  {isOpenMenu && (
                    <div className={styles.moreMenu} role="menu">
                      <button className={styles.moreItem} role="menuitem" onClick={() => { handleCopy(evt.id); setOpenMenuId(null); }}>
                        🔗 링크 복사
                      </button>
                      <button className={styles.moreItem} role="menuitem" onClick={() => { openEditModal(evt); setOpenMenuId(null); }}>
                        ✎ 편집
                      </button>
                      <button className={styles.moreItem} role="menuitem" onClick={() => { handleToggleHidden(evt); setOpenMenuId(null); }}>
                        {evt?.isHidden ? '👁️ 숨김 해제' : '🙈 숨기기'}
                      </button>
                      <button className={styles.moreItemDanger} role="menuitem" onClick={() => { handleDelete(evt.id); setOpenMenuId(null); }}>
                        🗑️ 삭제
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* 버튼 뒤에 가려지지 않도록 스페이서 */}
      <div className={styles.bottomSpacer} />

      {/* ▼ 최하단 고정 버튼 */}
      <div className={styles.bottomDockFixed}>
        <div className={styles.dockInner}>
          <button className={`${styles.primaryBtn} ${styles.btnFlex}`} onClick={() => setOpenCreate(true)}>새 대회 생성</button>
          <button className={`${styles.secondaryBtn} ${styles.btnFlex}`} onClick={handleLoad}>불러오기</button>
        </div>
      </div>

      {/* ─ 새 대회 생성 ─ */}
      {openCreate && (
        <div style={modal.overlay} onClick={() => setOpenCreate(false)}>
          <div style={modal.box} onClick={(e) => e.stopPropagation()}>
            <div style={modal.header}>새 대회 생성</div>

            <div style={modal.row}>
              <label style={modal.label}>대회명</label>
              <input type="text" placeholder="예) 안골모 1부" style={modal.input}
                     value={newTitle} onChange={e=>setNewTitle(e.target.value)} />
            </div>
            <div style={modal.row}>
              <label style={modal.label}>시작일</label>
              <input type="date" style={modal.input}
                     value={newDateStart} onChange={e=>setNewDateStart(e.target.value)} />
            </div>
            <div style={modal.row}>
              <label style={modal.label}>종료일</label>
              <input type="date" style={modal.input}
                     value={newDateEnd} onChange={e=>setNewDateEnd(e.target.value)} />
            </div>

            {/* ★ patch(time): 시간도 설정(옵션) */}
            <div style={modal.row}>
              <label style={modal.label}>시간</label>
              <div style={{display:'flex',alignItems:'center',gap:'.4rem',flexWrap:'wrap'}}>
                <label style={{display:'inline-flex',alignItems:'center',gap:'.4rem'}}>
                  <input
                    type="checkbox"
                    checked={newUseTime}
                    onChange={e=>setNewUseTime(e.target.checked)}
                  />
                  <span style={modal.help}>시간도 설정</span>
                </label>
                <input
                  type="time"
                  value={newTimeStart}
                  onChange={e=>setNewTimeStart(e.target.value)}
                  disabled={!newUseTime}
                  style={{minWidth:120}}
                />
                <span style={{opacity:.7}}>~</span>
                <input
                  type="time"
                  value={newTimeEnd}
                  onChange={e=>setNewTimeEnd(e.target.value)}
                  disabled={!newUseTime}
                  style={{minWidth:120}}
                />
              </div>
            </div>

            <div style={modal.row}>
              <label style={modal.label}>옵션</label>
              <label style={{display:'inline-flex', alignItems:'center', gap:'.4rem'}}>
                <input type="checkbox" checked={duringOnly} onChange={e=>setDuringOnly(e.target.checked)} />
                <span style={modal.help}>대회 기간 중에만 참가자 접속 허용</span>
              </label>
            </div>
            <div style={modal.row}>
              <label style={modal.label}>커스텀 ID</label>
              <label style={{display:'inline-flex', alignItems:'center', gap:'.35rem', marginRight:'.4rem', color:'#4b5563', fontSize:'.9rem'}}>
                <input type="checkbox" checked={useCustomId} onChange={e=>setUseCustomId(e.target.checked)} />
                <span style={modal.help}>직접 입력</span>
              </label>
              <input type="text" placeholder="선택: events/{이 값}으로 생성" style={modal.input}
                     value={customId} onChange={e=>setCustomId(e.target.value)} disabled={!useCustomId} />
            </div>

            <div style={modal.footer}>
              <button className={`${styles.secondaryBtn} ${styles.btnFlex}`} onClick={() => setOpenCreate(false)}>취소</button>
              <button className={`${styles.primaryBtn} ${styles.btnFlex}`} onClick={handleCreate} disabled={!newTitle.trim()}>생성</button>
            </div>
          </div>
        </div>
      )}

      {/* ─ 편집 ─ */}
      {!!editing && (
        <div style={modal.overlay} onClick={() => setEditing(null)}>
          <div style={modal.box} onClick={(e) => e.stopPropagation()}>
            <div style={modal.header}>대회 정보 수정</div>

            <div style={{...modal.row, color:'#374151'}}>
              <span style={{fontWeight:600, marginRight:'.4rem'}}>대회명</span>
              <span>{editing.title}</span>
            </div>
            <div style={modal.row}>
              <label style={modal.label}>시작일</label>
              <input type="date" style={modal.input}
                     value={editDateStart} onChange={e=>setEditDateStart(e.target.value)} />
            </div>
            <div style={modal.row}>
              <label style={modal.label}>종료일</label>
              <input type="date" style={modal.input}
                     value={editDateEnd} onChange={e=>setEditDateEnd(e.target.value)} />
            </div>

            {/* ★ patch(time): 시간도 설정(옵션) */}
            <div style={modal.row}>
              <label style={modal.label}>시간</label>
              <div style={{display:'flex',alignItems:'center',gap:'.4rem',flexWrap:'wrap'}}>
                <label style={{display:'inline-flex',alignItems:'center',gap:'.4rem'}}>
                  <input
                    type="checkbox"
                    checked={editUseTime}
                    onChange={e=>setEditUseTime(e.target.checked)}
                  />
                  <span style={modal.help}>시간도 설정</span>
                </label>
                <input
                  type="time"
                  value={editTimeStart}
                  onChange={e=>setEditTimeStart(e.target.value)}
                  disabled={!editUseTime}
                  style={{minWidth:120}}
                />
                <span style={{opacity:.7}}>~</span>
                <input
                  type="time"
                  value={editTimeEnd}
                  onChange={e=>setEditTimeEnd(e.target.value)}
                  disabled={!editUseTime}
                  style={{minWidth:120}}
                />
              </div>
            </div>

            <div style={modal.row}>
              <label style={modal.label}>옵션</label>
              <label style={{display:'inline-flex', alignItems:'center', gap:'.4rem'}}>
                <input type="checkbox" checked={editDuringOnly} onChange={e=>setEditDuringOnly(e.target.checked)} />
                <span style={modal.help}>대회 기간 중에만 참가자 접속 허용</span>
              </label>
            </div>

            <div style={modal.footer}>
              <button className={`${styles.secondaryBtn} ${styles.btnFlex}`} onClick={() => setEditing(null)}>취소</button>
              <button className={`${styles.primaryBtn} ${styles.btnFlex}`} onClick={saveEdit}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
