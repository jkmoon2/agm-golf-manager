// /src/admin/screens/PreMembers.jsx
// (행 클릭만 해도 수정 팝업 열기 추가. 더블클릭/롱프레스도 그대로 지원)

import React, { useEffect, useState, useContext, useRef } from 'react';
import {
  collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy,
  getDocs, writeBatch, serverTimestamp
} from 'firebase/firestore';
import html2canvas from 'html2canvas';
import { db } from '../../firebase';
import { EventContext } from '../../contexts/EventContext';
import styles from '../../screens/Settings.module.css';

function toDate(v){
  try{
    if(!v) return null;
    if(typeof v.toDate==='function') return v.toDate();
    const d=new Date(v);
    if(!Number.isNaN(d.getTime())) return d;
  }catch{}
  return null;
}
function ymd(v){ const d=toDate(v); return d? d.toISOString().slice(0,10):''; }

const UI = {
  topOffset: 70, sideGap: 12, bottomBar: 76, bottomExtra: 0, useSVH: true,
  cardPadX: 8, tableWrapPadX: 0, headBorder: 1, rowPadY: 4, fontSize: 12,
  delBtnH: 16, delBtnPadX: 6, delBtnRadius: 6, delBtnFont: 9,
  btnHeight: 30, btnPadX: 10, btnFont: 12, footerGap: 10, footerExtra: 8
};

export default function PreMembers(){
  const { eventId } = useContext(EventContext) || {};
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const tableRef = useRef(null);

  // 팝업 상태
  const [showModal, setShowModal] = useState(false);
  const [mEmail, setMEmail] = useState('');
  const [mName, setMName] = useState('');
  const [editingKey, setEditingKey] = useState(null); // null=추가, 값=수정

  // users email -> 가입일 맵
  const [userJoinMap, setUserJoinMap] = useState(new Map());
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const m = new Map();
        snap.forEach(d => {
          const v = d.data() || {};
          const email = String(v.email || '').trim().toLowerCase();
          const join = v.joinedAt ?? v.createdAt ?? v.created_at ?? v.created ?? v.signUpAt ?? null;
          if (email) m.set(email, join || null);
        });
        setUserJoinMap(m);
      } catch (e) {
        console.warn('[PreMembers] users read failed', e);
      }
    })();
  }, []);

  // preMembers 목록 구독
  useEffect(() => {
    setError(''); setItems([]);
    if (!eventId) return;
    try {
      const col = collection(db, 'events', eventId, 'preMembers');
      const q = query(col, orderBy('name', 'asc'));
      const unsub = onSnapshot(q, (snap) => {
        const rows = []; snap.forEach(d => rows.push({ email: d.id, ...(d.data()||{}) }));
        setItems(rows);
      }, (e) => setError(e?.message || '권한 또는 네트워크 오류'));
      return unsub;
    } catch (e) { setError(e?.message || '권한 또는 네트워크 오류'); }
  }, [eventId]);

  const remove = async (key) => {
    if (!window.confirm('삭제하시겠어요?')) return;
    try { await deleteDoc(doc(db, 'events', eventId, 'preMembers', key)); }
    catch (e) { alert('삭제 실패: ' + (e?.message || '')); }
  };

  // 수정 팝업 열기(클릭/더블클릭/롱프레스 모두 지원)
  const openEdit = (email, name='') => {
    setEditingKey(email); setMEmail(email); setMName(name||''); setShowModal(true);
  };
  const lpRef = useRef(null);
  const startLongEdit = (email, name) => {
    if (lpRef.current) clearTimeout(lpRef.current);
    lpRef.current = setTimeout(() => openEdit(email, name), 500);
  };
  const cancelLongEdit = () => {
    if (lpRef.current) clearTimeout(lpRef.current);
  };

  const csvDownload = () => {
    const header = ['email','name','createdAt'];
    const lines = [header.join(',')];
    items.forEach(r => {
      const emailKey = String(r.email||'').toLowerCase();
      const created = userJoinMap.get(emailKey) || r.updatedAt || null;
      const line = [r.email, r.name||'', ymd(created)].map(x => `"${String(x??'').replace(/"/g,'""')}"`).join(',');
      lines.push(line);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `preMembers_${eventId||'unknown'}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const jpgDownload = async () => {
    const el = tableRef.current; if(!el) return;
    const canvas = await html2canvas(el, { backgroundColor:'#fff', scale:2 });
    canvas.toBlob((b)=> {
      const url = URL.createObjectURL(b);
      const a = document.createElement('a'); a.href = url; a.download = `preMembers_${eventId||'unknown'}.jpg`; a.click();
      setTimeout(()=>URL.revokeObjectURL(url), 1500);
    }, 'image/jpeg', 0.95);
  };

  const saveModal = async () => {
    const email = (mEmail||'').trim().toLowerCase();
    const name  = (mName||'').trim();
    if(!eventId){ alert('대회가 선택되지 않았습니다.'); return; }
    if(!email || !email.includes('@')){ alert('이메일 형식을 확인해 주세요.'); return; }
    setBusy(true);
    try{
      await setDoc(
        doc(db,'events',eventId,'preMembers',email),
        { name: name||null, updatedAt: serverTimestamp(), importedFrom: editingKey ? 'manual-edit' : 'manual' },
        { merge:true }
      );
      setShowModal(false); setMEmail(''); setMName(''); setEditingKey(null);
      alert(editingKey ? '수정했습니다.' : '저장했습니다.');
    }catch(e){ alert('저장 실패: '+(e?.message||e)); }
    finally{ setBusy(false); }
  };

  const importNewToPreMembers = async () => {
    if(!eventId){ alert('대회가 선택되지 않았습니다.'); return; }
    setBusy(true);
    try{
      const [usersSnap, preSnap] = await Promise.all([
        getDocs(collection(db,'users')),
        getDocs(collection(db,'events',eventId,'preMembers'))
      ]);
      const existing = new Set();
      preSnap.forEach(d=> existing.add((d.id||'').toLowerCase()));

      const batch = writeBatch(db);
      let addCount=0;
      usersSnap.forEach(u=>{
        const v=u.data()||{};
        const email=String(v.email||'').trim().toLowerCase();
        const name =String(v.name||'').trim();
        if(!email) return;
        if(existing.has(email)) return;
        existing.add(email);
        addCount++;
        batch.set(
          doc(db,'events',eventId,'preMembers',email),
          {
            name: name||null,
            // 생성일은 화면에서 users 맵을 참고해 출력만 함
            updatedAt: serverTimestamp(),
            importedFrom: 'users'
          },
          { merge:true }
        );
      });
      if(addCount>0) await batch.commit();
      alert(addCount>0 ? `신규 ${addCount}건을 추가했습니다.` : '추가할 신규 데이터가 없습니다.');
    }catch(e){
      console.warn('[PreMembers] importNewToPreMembers error', e);
      alert('신규만 가져오기 실패: 콘솔을 확인해 주세요.');
    }finally{ setBusy(false); }
  };

  // 고정 레이아웃(중간 스크롤)
  const VH = UI.useSVH ? '100svh' : '100vh';
  const listBottomPad = UI.btnHeight + UI.footerGap + UI.footerExtra;
  const sectionStyle = {
    position: 'fixed',
    top:    `calc(${UI.topOffset}px + env(safe-area-inset-top, 0px))`,
    left:   `${UI.sideGap}px`,
    right:  `${UI.sideGap}px`,
    height: `calc(${VH} - ${UI.bottomBar + UI.bottomExtra}px - env(safe-area-inset-bottom, 0px) - ${UI.topOffset}px)`,
    maxHeight: `calc(${VH} - ${UI.bottomBar + UI.bottomExtra}px - env(safe-area-inset-bottom, 0px) - ${UI.topOffset}px)`,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    ['--members-card-pad-x']:  `${UI.cardPadX}px`,
    ['--members-table-pad-x']: `${UI.tableWrapPadX}px`,
    ['--members-footer-h']:    `${listBottomPad}px`
  };
  const thStyle = { borderBottomWidth: UI.headBorder };
  const tdStyle = { paddingTop: UI.rowPadY, paddingBottom: UI.rowPadY, fontSize: UI.fontSize };
  const footerStyle = {
    position: 'absolute',
    left:  'var(--members-card-pad-x)',
    right: 'var(--members-card-pad-x)',
    bottom: `${UI.footerGap}px`,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    background: '#fff',
    paddingTop: 6
  };
  const btnStyle = { height: UI.btnHeight, padding: `0 ${UI.btnPadX}px`, fontSize: UI.btnFont };

  return (
    <div className={`${styles.page} ${styles.pageFullViewport}`}>
      <header className={styles.header}>
        <h2>설정</h2>
        <p className={styles.caption}>설정 화면</p>
      </header>

      <section className={`${styles.sectionBox} ${styles.membersViewport}`} style={sectionStyle}>
        <h3 className={`${styles.sectionTitle} ${styles.sectionTitleSticky}`}>preMembers</h3>

        <div ref={tableRef} className={`${styles.tableWrap} ${styles.mTableWrap}`}>
          <table className={`${styles.table} ${styles.mTable} ${styles.mTableHead}`}>
            <thead>
              <tr>
                <th className={styles.mColEmail} style={thStyle}>Email</th>
                <th className={styles.mColName}  style={thStyle}>이름</th>
                <th className={styles.mColDate}  style={thStyle}>생성일</th>
                <th className={styles.mColCtrl}  style={thStyle}>관리</th>
              </tr>
            </thead>
          </table>

          {/* 리스트(중간만 스크롤) */}
          <div className={styles.mListScroll}>
            <table className={`${styles.table} ${styles.mTable} ${styles.mTableBody}`}>
              <tbody style={{ cursor:'pointer', userSelect:'none' }}>
                {items.map(r=>{
                  const emailKey = String(r.email||'').toLowerCase();
                  const created = userJoinMap.get(emailKey) || r.updatedAt || null;
                  return (
                    <tr
                      key={r.email}
                      data-email={r.email}
                      data-name={r.name || ''}

                      onClick={() => openEdit(r.email, r.name || '')}
                      onDoubleClick={() => openEdit(r.email, r.name || '')}
                      onMouseDown={() => startLongEdit(r.email, r.name || '')}
                      onMouseUp={cancelLongEdit}
                      onMouseLeave={cancelLongEdit}
                      onTouchStart={() => startLongEdit(r.email, r.name || '')}
                      onTouchEnd={cancelLongEdit}

                      title="클릭/더블클릭/길게 눌러 수정"
                    >
                      <td className={styles.mColEmail} style={tdStyle}>{r.email}</td>
                      <td className={styles.mColName}  style={tdStyle}>{r.name || ''}</td>
                      <td className={styles.mColDate}  style={tdStyle}>{ymd(created)}</td>
                      <td className={styles.mColCtrl}  style={tdStyle}>
                        <button
                          onClick={()=>remove(r.email)}
                          disabled={busy}
                          className={`${styles.dangerGhostBtn} ${styles.blueFocus} ${styles.mDeleteBtn}`}
                          style={{ height:UI.delBtnH, padding:`0 ${UI.delBtnPadX}px`, borderRadius:UI.delBtnRadius, fontSize:UI.delBtnFont }}
                        >삭제</button>
                      </td>
                    </tr>
                  );
                })}
                {!items.length && !error && (
                  <tr><td colSpan={4} className={styles.emptyCell}>데이터가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.tableFooterRight} style={footerStyle}>
          <div>
            <button
              className={`${styles.ghostBtn} ${styles.blueFocus}`}
              style={btnStyle}
              onClick={() => { setEditingKey(null); setMEmail(''); setMName(''); setShowModal(true); }}
              disabled={busy}
            >추가/수정</button>
          </div>
          <div style={{display:'flex', gap:8}}>
            <button onClick={importNewToPreMembers} disabled={busy} className={`${styles.ghostBtn} ${styles.blueFocus}`} style={btnStyle}>새로고침</button>
            <button onClick={csvDownload}            disabled={busy} className={`${styles.ghostBtn} ${styles.blueFocus}`} style={btnStyle}>CSV 다운로드</button>
            <button onClick={jpgDownload}            disabled={busy} className={`${styles.ghostBtn} ${styles.blueFocus}`} style={btnStyle}>JPG로 저장</button>
          </div>
        </div>
      </section>

      {showModal && (
        <div
          style={{position:'fixed', inset:0, background:'rgba(0,0,0,.35)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50}}
          onClick={()=>setShowModal(false)}
        >
          <div
            style={{background:'#fff', borderRadius:12, padding:16, width:320, boxShadow:'0 10px 30px rgba(0,0,0,.25)'}}
            onClick={(e)=>e.stopPropagation()}
          >
            <h4 style={{margin:'0 0 10px 0'}}>{editingKey ? 'preMembers 수정' : 'preMembers 추가/수정'}</h4>
            <div style={{display:'grid', gridTemplateColumns:'80px 1fr', alignItems:'center', gap:8, marginBottom:10}}>
              <div>이메일</div>
              <input
                className={styles.inputBoxLarge}
                placeholder="email"
                value={mEmail}
                onChange={e=>setMEmail(e.target.value)}
                readOnly={!!editingKey}
              />
            </div>
            <div style={{display:'grid', gridTemplateColumns:'80px 1fr', alignItems:'center', gap:8, marginBottom:10}}>
              <div>이름</div>
              <input
                className={styles.inputBoxLarge}
                placeholder="이름"
                value={mName}
                onChange={e=>setMName(e.target.value)}
              />
            </div>
            <div style={{display:'flex', justifyContent:'flex-end', gap:8}}>
              <button className={styles.ghostBtnSm} onClick={()=>{ setShowModal(false); setEditingKey(null); }}>취소</button>
              <button className={styles.saveBtn} onClick={saveModal} disabled={busy}>{editingKey ? '수정' : '저장'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
