// /src/admin/screens/MembersList.jsx

import React, { useEffect, useState, useRef } from 'react';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import html2canvas from 'html2canvas';
import { db } from '../../firebase';
import styles from '../../screens/Settings.module.css';

function toCSV(rows){ const header=['uid','이메일','이름','생성일']; const lines=[header.join(',')]; rows.forEach(r=>lines.push([r.uid,r.email||'',r.name||'',r.createdAt||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))); return lines.join('\n'); }
function download(filename, blob){ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); }

export default function MembersList(){
  const [rows,setRows]=useState([]); const [loading,setLoading]=useState(true); const tableRef=useRef(null);
  useEffect(()=>{ document.body.classList.add('settings-page'); return ()=>document.body.classList.remove('settings-page'); },[]);
  const load = async ()=>{ setLoading(true); try{ const qs=await getDocs(collection(db,'users')); const out=[]; qs.forEach(d=>{ const v=d.data()||{}; out.push({uid:d.id,email:v.email||'',name:v.name||'',createdAt:v.createdAt||''}); }); setRows(out); } finally{ setLoading(false); } };
  const removeUser=async(uid)=>{ if(!window.confirm('정말 이 회원을 삭제할까요? (Auth 계정까지 삭제)'))return; try{ await deleteDoc(doc(db,'users',uid)); const fn=httpsCallable(getFunctions(),'adminDeleteUser'); await fn({uid}); await load(); }catch(e){ alert('삭제 중 오류: '+(e?.message||e)); } };
  const downloadCSV = ()=> download('members.csv', new Blob([toCSV(rows)],{type:'text/csv'}));
  const downloadJPG = async ()=>{ const el=tableRef.current; if(!el) return; const canvas=await html2canvas(el,{backgroundColor:'#ffffff',scale:2}); canvas.toBlob(b=>download('members.jpg',b),'image/jpeg',0.95); };
  useEffect(()=>{ load(); },[]);
  return (
    <div style={{ padding:12 }}>
      <section className={styles.section}>
        <h3 className={`${styles.sectionTitle} ${styles.titleTight}`}>회원 목록</h3>

        <div ref={tableRef} className={styles.tableWrap}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr><th>UID</th><th>이메일</th><th>이름</th><th>생성일</th><th>관리</th></tr>
            </thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.uid}>
                  <td>{r.uid}</td><td>{r.email}</td><td>{r.name}</td><td>{r.createdAt}</td>
                  <td><button onClick={()=>removeUser(r.uid)} className={`${styles.dangerGhostBtn} ${styles.blueFocus}`}>강제 삭제</button></td>
                </tr>
              ))}
              {!rows.length && (<tr><td colSpan={5} className={styles.emptyCell}>등록된 회원이 없습니다.</td></tr>)}
            </tbody>
          </table>
        </div>

        <div className={styles.tableFooterRight}>
          <button onClick={load} disabled={loading} className={`${styles.ghostBtn} ${styles.blueFocus}`}>새로고침</button>
          <button onClick={downloadCSV} className={`${styles.ghostBtn} ${styles.blueFocus}`}>CSV 다운로드</button>
          <button onClick={downloadJPG} className={`${styles.ghostBtn} ${styles.blueFocus}`}>JPG로 저장</button>
        </div>
      </section>
    </div>
  );
}
