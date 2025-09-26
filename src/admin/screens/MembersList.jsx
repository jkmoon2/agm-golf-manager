// /src/admin/screens/MembersList.jsx
// ─────────────────────────────────────────────────────────────
// ▷ 원본 100% 유지. '카드박스 고정'을 위해 최상단 컨테이너에
//   pageViewportFixed 클래스만 추가(기능/레이아웃 나머지는 그대로)
// ▷ 표 칼럼/행/삭제버튼 수동 조정은 Settings.module.css의 9) 섹션 참조
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useState, useRef } from 'react';
import { collection, getDocs, doc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import html2canvas from 'html2canvas';
import { db, auth } from '../../firebase';
import styles from '../../screens/Settings.module.css';
import { getApp } from 'firebase/app';
import { onAuthStateChanged } from 'firebase/auth';

const PROJECT_ID = (() => {
  try { return getApp().options?.projectId || process.env.REACT_APP_FIREBASE_PROJECT_ID || ''; }
  catch { return process.env.REACT_APP_FIREBASE_PROJECT_ID || ''; }
})();

const ENABLE_ADMIN_DELETE = String(process.env.REACT_APP_ENABLE_ADMIN_FN || '0') === '1';

function parseDate(v){
  try{
    if(!v) return null;
    if(typeof v.toDate==='function') return v.toDate();
    const d=new Date(v);
    if(!Number.isNaN(d.getTime())) return d;
  }catch{}
  return null;
}
function fmtDateISO(v){ const d=parseDate(v); return d? d.toISOString():''; }
function fmtDateOnly(v){ const d=parseDate(v); return d? d.toISOString().slice(0,10):''; }

function toCSV(rows){
  const header=['uid','이메일','이름','생성일'];
  const lines=[header.join(',')];
  rows.forEach(r=>{
    lines.push([r.uid,r.email||'',r.name||'',fmtDateISO(r.createdAt)||'']
      .map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
  });
  return '\uFEFF'+lines.join('\r\n');
}
function download(name, blob){
  const u=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=u; a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(u),1500);
}

export default function MembersList(){
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [canListen,setCanListen]=useState(false);
  const tableRef=useRef(null);

  useEffect(()=> onAuthStateChanged(auth,(u)=>setCanListen(!!u)),[]);

  useEffect(()=>{
    if(!canListen){ setRows([]); setLoading(false); return; }
    setLoading(true);
    const unsub = onSnapshot(collection(db,'users'),
      (snap)=>{
        const list=[];
        snap.forEach(d=>{
          const v=d.data()||{};
          list.push({uid:d.id,email:v.email||'',name:v.name||'',createdAt:v.createdAt||''});
        });
        list.sort((a,b)=>(+new Date(fmtDateISO(b.createdAt)))-(+new Date(fmtDateISO(a.createdAt))));
        setRows(list); setLoading(false);
      },
      (err)=>{ console.warn('[onSnapshot error]',err); setRows([]); setLoading(false); }
    );
    return ()=>unsub();
  },[canListen]);

  const onForceDelete=async(uid)=>{
    if(!ENABLE_ADMIN_DELETE){
      const authUrl=PROJECT_ID?`https://console.firebase.google.com/project/${PROJECT_ID}/authentication/users`:'https://console.firebase.google.com/';
      const docUrl =PROJECT_ID?`https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data/~2Fusers~2F${uid}`:'';
      alert(`무료 모드입니다.\n\n• Auth 콘솔: ${authUrl}\n${docUrl?`• Firestore 문서: ${docUrl}`:''}`);
      window.open(authUrl,'_blank','noopener'); if(docUrl) window.open(docUrl,'_blank','noopener'); return;
    }
    if(!window.confirm('정말 이 회원을 삭제할까요? (Auth 계정 + Firestore 문서)')) return;
    setBusy(true);
    try{
      await deleteDoc(doc(db,'users',uid)).catch(()=>{});
      const fn=httpsCallable(getFunctions(),'adminDeleteUser');
      await fn({uid});
      setRows(rs=>rs.filter(r=>r.uid!==uid));
      alert('삭제되었습니다.');
    }catch(e){ alert('삭제 실패: '+(e?.message||e)); }
    finally{ setBusy(false); }
  };

  const downloadCSV=()=> download('members.csv', new Blob([toCSV(rows)],{type:'text/csv'}));
  const downloadJPG=async()=>{
    const el=tableRef.current; if(!el) return;
    const canvas=await html2canvas(el,{backgroundColor:'#fff',scale:2});
    canvas.toBlob((b)=>download('members.jpg',b),'image/jpeg',0.95);
  };
  const load=async()=>{
    setLoading(true);
    const qs=await getDocs(collection(db,'users'));
    const list=[]; qs.forEach(d=>{ const v=d.data()||{}; list.push({uid:d.id,email:v.email||'',name:v.name||'',createdAt:v.createdAt||''}); });
    list.sort((a,b)=>(+new Date(fmtDateISO(b.createdAt)))-(+new Date(fmtDateISO(a.createdAt))));
    setRows(list); setLoading(false);
  };

  return (
    /* ★ 카드 고정용 래퍼 추가(pageViewportFixed) */
    <div className={`${styles.page} ${styles.pageFullViewport} ${styles.pageViewportFixed}`}>
      <header className={styles.header}>
        <h2>설정</h2>
        <p className={styles.caption}>설정 화면</p>
      </header>

      {/* 회원 관리 카드 */}
      <section className={styles.sectionBox}>
        <h3 className={styles.sectionTitle}>회원 목록</h3>

        {/* 고정 헤더 + 내부 스크롤 바디 */}
        <div ref={tableRef} className={`${styles.tableWrap} ${styles.mTableWrap}`}>
          {/* 고정 헤더 테이블 */}
          <table className={`${styles.table} ${styles.mTable} ${styles.mTableHead}`}>
            <thead className={`${styles.thead} ${styles.mStickyHead}`}>
              <tr>
                <th className={styles.mColEmail}>이메일</th>
                <th className={styles.mColName}>이름</th>
                <th className={styles.mColDate}>생성일</th>
                <th className={styles.mColCtrl}>관리</th>
              </tr>
            </thead>
          </table>

          {/* 내부 스크롤 영역 */}
          <div className={styles.mListScroll}>
            <table className={`${styles.table} ${styles.mTable} ${styles.mTableBody}`}>
              <tbody>
                {rows.map(r=>(
                  <tr key={r.uid}>
                    <td className={styles.mColEmail}>{r.email}</td>
                    <td className={styles.mColName}>{r.name}</td>
                    <td className={styles.mColDate}>{fmtDateOnly(r.createdAt)}</td>
                    <td className={styles.mColCtrl}>
                      <button
                        onClick={()=>onForceDelete(r.uid)}
                        disabled={busy}
                        className={`${styles.dangerGhostBtn} ${styles.blueFocus} ${styles.mDeleteBtn}`}
                      >삭제</button>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length===0 && (
                  <tr><td colSpan={4} className={styles.emptyCell}>등록된 회원이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 하단 3버튼 — 카드 바닥 고정 */}
        <div className={styles.tableFooterRight}>
          <button onClick={load} disabled={loading} className={`${styles.ghostBtn} ${styles.blueFocus}`}>새로고침</button>
          <button onClick={downloadCSV} className={`${styles.ghostBtn} ${styles.blueFocus}`}>CSV 다운로드</button>
          <button onClick={downloadJPG} className={`${styles.ghostBtn} ${styles.blueFocus}`}>JPG로 저장</button>
        </div>
      </section>
    </div>
  );
}
