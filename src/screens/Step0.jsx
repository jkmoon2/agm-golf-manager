// src/screens/Step0.jsx

import React, { useState, useContext, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventContext } from '../contexts/EventContext';
import styles from './Step0.module.css';

export default function Step0() {
  const { createEvent, loadEvent, deleteEvent, allEvents, updateEventById } = useContext(EventContext);
  const [viewMode, setViewMode]     = useState('stroke');
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

  // 편집 모달
  const [editing, setEditing] = useState(null);
  const [editDateStart, setEditDateStart] = useState('');
  const [editDateEnd, setEditDateEnd] = useState('');
  const [editDuringOnly, setEditDuringOnly] = useState(false);

  // ⋮ 메뉴
  const [openMenuId, setOpenMenuId] = useState(null);
  useEffect(() => {
    const onDocClick = () => setOpenMenuId(null);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const filtered = useMemo(
    () => allEvents.filter(e => e.mode === viewMode),
    [allEvents, viewMode]
  );

  const fmt = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? s.replaceAll('-', '.') : '미정';
  const isClosed = (dateEnd) => {
    if (!dateEnd || !/^\d{4}-\d{2}-\d2$/.test(dateEnd)) return false;
    const end = new Date(`${dateEnd}T23:59:59`);
    return Date.now() > end.getTime();
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
    }
    const newId = await createEvent({
      title, mode: viewMode,
      id: useCustomId && customId.trim() ? customId.trim() : undefined,
      dateStart: newDateStart || '',
      dateEnd:   newDateEnd   || '',
      allowDuringPeriodOnly: duringOnly,
    });
    setSelectedId(newId);
    setOpenCreate(false);
    setNewTitle(''); setNewDateStart(''); setNewDateEnd(''); setDuringOnly(false); setUseCustomId(false); setCustomId('');
    alert('새 대회가 생성되었습니다. 목록에서 선택 후 불러오기를 눌러주세요.');
  };

  const handleCopy = (id) => {
    const url = `${window.location.origin}/join/${id}`;
    navigator.clipboard.writeText(url);
    alert(`링크가 복사되었습니다:\n${url}`);
  };
  const handleDelete = async (id) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    await deleteEvent(id);
    if (selectedId === id) setSelectedId(null);
  };

  const openEditModal = (evt) => {
    setEditing(evt);
    setEditDateStart(evt.dateStart || '');
    setEditDateEnd(evt.dateEnd || '');
    setEditDuringOnly(!!evt.allowDuringPeriodOnly);
  };
  const saveEdit = async () => {
    if (editDateStart && editDateEnd) {
      const s = new Date(`${editDateStart}T00:00:00`);
      const e = new Date(`${editDateEnd}T23:59:59`);
      if (s.getTime() > e.getTime()) { alert('종료일은 시작일 이후여야 합니다.'); return; }
    }
    await updateEventById(editing.id, {
      dateStart: editDateStart || '',
      dateEnd:   editDateEnd   || '',
      allowDuringPeriodOnly: editDuringOnly
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
        <button className={`${styles.tabBtn} ${viewMode==='stroke'?styles.active:''}`} onClick={() => setViewMode('stroke')}>스트로크</button>
        <button className={`${styles.tabBtn} ${viewMode==='agm'?styles.active:''}`} onClick={() => setViewMode('agm')}>AGM 포볼</button>
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
                    <span className={`${styles.badge} ${evt.mode==='agm'?styles.badgeFour:styles.badgeStroke}`}>
                      {evt.mode==='agm' ? 'AGM 포볼' : '스트로크'}
                    </span>
                  </div>

                  <div className={styles.subline}>
                    <span>👥 참가자 {count}명</span>
                    <span>📅 {fmt(evt.dateStart)} ~ {fmt(evt.dateEnd)}</span>
                    {closed && <span className={styles.closed}>종료</span>}
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
