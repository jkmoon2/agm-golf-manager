// /src/admin/screens/MembersList.jsx

import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { db } from '../../firebase';

function toCSV(rows){
  const header = ['uid','이메일','이름','생성일'];
  const lines = [header.join(',')];
  rows.forEach(r=>{
    lines.push([r.uid, r.email||'', r.name||'', r.createdAt||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
  });
  return lines.join('\n');
}
function download(filename, text, type='text/plain'){
  const blob = new Blob([text], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

async function getHtml2Canvas(){
  try {
    // 1) 모듈로 시도 (npm 설치되어 있는 경우)
    const mod = await import(/* webpackIgnore: true */'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
    return (mod.default || window.html2canvas);
  } catch {
    // 2) 스크립트 태그로 로드
    if (!window.html2canvas) {
      await new Promise((res, rej)=>{
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    return window.html2canvas;
  }
}

export default function MembersList(){
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try{
      const qs = await getDocs(collection(db,'users'));
      const out = [];
      qs.forEach(d=>{
        const v = d.data()||{};
        out.push({ uid:d.id, email:v.email||'', name:v.name||'', createdAt:v.createdAt||'' });
      });
      setRows(out);
    }finally{ setLoading(false); }
  };

  const removeUser = async (uid) => {
    if(!window.confirm('정말 이 회원을 삭제할까요? (Auth 계정까지 삭제합니다)')) return;
    try{
      await deleteDoc(doc(db,'users',uid));
      const fn = httpsCallable(getFunctions(), 'adminDeleteUser');
      await fn({ uid });
      alert('삭제 완료');
      await load();
    }catch(e){
      alert('삭제 중 오류: '+(e?.message||e));
    }
  };

  const downloadCSV = () => download('members.csv', toCSV(rows), 'text/csv');

  const downloadJPG = async () => {
    const el = document.getElementById('members-table');
    if(!el){ alert('표 요소를 찾을 수 없습니다.'); return; }
    const html2canvas = await getHtml2Canvas();
    const canvas = await html2canvas(el, { backgroundColor:'#ffffff', scale:2, useCORS:true });
    canvas.toBlob((b)=>{
      const url = URL.createObjectURL(b); const a = document.createElement('a');
      a.href = url; a.download = 'members.jpg'; a.click(); URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.95);
  };

  useEffect(()=>{ load(); },[]);

  return (
    <div style={{padding:20}}>
      <h2 style={{marginTop:0}}>설정 · 회원 목록</h2>
      <div style={{display:'flex', gap:8, marginBottom:12}}>
        <button onClick={load} disabled={loading} style={{height:40, borderRadius:10, border:'1px solid #cfd7e6', background:'#f9fbff', padding:'0 14px'}}>새로고침</button>
        <button onClick={downloadCSV} style={{height:40, borderRadius:10, border:'1px solid #cfd7e6', background:'#f9fbff', padding:'0 14px'}}>CSV 다운로드</button>
        <button onClick={downloadJPG} style={{height:40, borderRadius:10, border:'1px solid #cfd7e6', background:'#f9fbff', padding:'0 14px'}}>JPG로 저장</button>
      </div>

      <div id="members-table" style={{overflowX:'auto', border:'1px solid #e5e7eb', borderRadius:12, background:'#fff'}}>
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead style={{background:'#f8fafc'}}>
            <tr>
              <th style={{textAlign:'left', padding:'10px 12px'}}>UID</th>
              <th style={{textAlign:'left', padding:'10px 12px'}}>이메일</th>
              <th style={{textAlign:'left', padding:'10px 12px'}}>이름</th>
              <th style={{textAlign:'left', padding:'10px 12px'}}>생성일</th>
              <th style={{textAlign:'left', padding:'10px 12px'}}>관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.uid} style={{borderTop:'1px solid #eef2f7'}}>
                <td style={{padding:'10px 12px'}}>{r.uid}</td>
                <td style={{padding:'10px 12px'}}>{r.email}</td>
                <td style={{padding:'10px 12px'}}>{r.name}</td>
                <td style={{padding:'10px 12px'}}>{r.createdAt}</td>
                <td style={{padding:'10px 12px'}}>
                  <button onClick={()=>removeUser(r.uid)} style={{height:32, borderRadius:8, border:'1px solid #ef4444', color:'#ef4444', background:'#fff', padding:'0 10px'}}>강제 삭제</button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={5} style={{padding:'14px 12px', color:'#64748b'}}>등록된 회원이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
