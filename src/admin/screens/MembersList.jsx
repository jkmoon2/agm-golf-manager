// /src/admin/screens/MembersList.jsx
// ────────────────────────────────────────────────────────────────
// ✅ 이 파일만 바꿉니다. (Settings.module.css는 그대로 유지)
// ✅ 모든 미세 조정은 "UI" 상수만 수정하면 됩니다.
//    - 카드박스 상/하/좌/우 여백, 정확한 높이(fvh/svh), 표 좌우 여백,
//      표 타이틀 두께, 칸높이, 삭제 버튼 크기, 하단 3버튼 크기/여백 등
// ────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useRef } from 'react';
import { collection, getDocs, doc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import html2canvas from 'html2canvas';
import { db, auth } from '../../firebase';
import styles from '../../screens/Settings.module.css';
import { getApp } from 'firebase/app';
import { onAuthStateChanged } from 'firebase/auth';

// ────────────────────────────────────────────────────────────────
// 1) 화면/여백/버튼 등 조절값 (필요 시 "숫자"만 바꾸세요)
// ────────────────────────────────────────────────────────────────
const UI = {
  // [카드 전체 위치/크기] — 한 화면에 정확히 들어오도록 계산
  topOffset: 70,           // ⬆ 카드 상단 오프셋(px)  ↓값 = 더 위로
  sideGap: 12,             // ⬅➡ 카드 좌/우 바깥 여백(px)
  bottomBar: 76,           // ⬇ 하단 네비게이션바/탭 높이(가려지면 80~84로 ↑)
  bottomExtra: 0,          // ⬇ 기기별 여분 보정치(px). 잘리면 4~12 정도 ↑
  useSVH: true,            // true: 100svh(모바일 안정), false: 100vh

  // [카드 내부 ↔ 표] 좌/우 간격 (첨부1 빨간 세로선 위치)
  cardPadX: 8,            // 카드 테두리 ↔ 회색 표래퍼 사이 좌/우 패딩
  tableWrapPadX: 0,        // 회색 표래퍼 ↔ 실제 테이블 사이 좌/우 패딩

  // [테이블]
  headBorder: 1,           // 표 타이틀(헤더행) 하단 보더 두께(px)
  rowPadY: 4,              // 데이터 셀 상하 패딩(px) → 칸높이 조절
  fontSize: 12,            // 데이터 셀 폰트(px)

  // [삭제 버튼] (사각형)
  delBtnH: 16,             // 높이(px)
  delBtnPadX: 6,           // 좌/우 패딩(px)
  delBtnRadius: 6,         // 모서리
  delBtnFont: 9,          // 폰트(px)

  // [하단 3버튼]
  btnHeight: 30,           // 버튼 높이(px)
  btnPadX: 10,             // 버튼 좌/우 패딩(px)
  btnFont: 12,             // 버튼 폰트(px)

  // [3버튼 블록] (리스트 바닥 여유 + 카드 바닥 여백)
  footerGap: 10,           // 3버튼 블록과 카드 "최하단" 사이 간격(px)
  footerExtra: 8           // 리스트 바닥여유 여분(px) — 겹치면 6~14로 ↑
};

// ────────────────────────────────────────────────────────────────
// 아래부터는 기존 로직 100% 유지 (데이터 로딩/삭제/다운로드 등)
// ────────────────────────────────────────────────────────────────
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

  // ────────────────────────────────────────────────────────────────
  // 2) 인라인 스타일(카드 고정 + 한 화면 높이 맞춤 + 수동조정용 변수 override)
  // ────────────────────────────────────────────────────────────────
  // 100svh/100vh 선택 (iOS 사파리에서 svh가 바텀바 변화에 더 안전)
  const VH = UI.useSVH ? '100svh' : '100vh';

  // 리스트 바닥 여유: 버튼 높이 + 간격 + 여분(겹침 방지)
  const listBottomPad = UI.btnHeight + UI.footerGap + UI.footerExtra;

  // 카드 컨테이너(빨간 박스) — "한 화면" 높이를 수학식으로 직접 보장
  const sectionStyle = {
    position: 'fixed',
    top:    `calc(${UI.topOffset}px + env(safe-area-inset-top, 0px))`,
    left:   `${UI.sideGap}px`,
    right:  `${UI.sideGap}px`,
    // ⬇ 화면높이 - 하단바 - 안전영역 - (보정) 만큼 카드 높이를 강제
    height: `calc(${VH} - ${UI.bottomBar + UI.bottomExtra}px - env(safe-area-inset-bottom, 0px) - ${UI.topOffset}px)`,
    maxHeight: `calc(${VH} - ${UI.bottomBar + UI.bottomExtra}px - env(safe-area-inset-bottom, 0px) - ${UI.topOffset}px)`,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    // ⬇ (Settings.module.css 변수) 표 좌우 여백/버튼 바닥여유 동적 override
    ['--members-card-pad-x']:  `${UI.cardPadX}px`,   // 카드 ↔ 표래퍼 좌우 패딩
    ['--members-table-pad-x']: `${UI.tableWrapPadX}px`, // 표래퍼 ↔ 테이블 좌우 패딩
    ['--members-footer-h']:    `${listBottomPad}px`  // 리스트 바닥 여유(겹침 방지)
  };

  // 표 타이틀/셀 미세 조정
  const thStyle = { borderBottomWidth: UI.headBorder };
  const tdStyle = { paddingTop: UI.rowPadY, paddingBottom: UI.rowPadY, fontSize: UI.fontSize };

  // 하단 3버튼: 카드 "바닥" 절대 고정
  const footerStyle = {
    position: 'absolute',
    left:  'var(--members-card-pad-x)',
    right: 'var(--members-card-pad-x)',
    bottom: `${UI.footerGap}px`,
    display: 'flex',
    justifyContent: 'flex-end',
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

      {/* 카드 전체(빨간 박스) — 한 화면에 '정확히' 들어오도록 고정 */}
      <section className={`${styles.sectionBox} ${styles.membersViewport}`} style={sectionStyle}>
        {/* 섹션 타이틀(위에 고정) */}
        <h3 className={`${styles.sectionTitle} ${styles.sectionTitleSticky}`}>회원 목록</h3>

        {/* 회색 테두리 표 래퍼 */}
        <div ref={tableRef} className={`${styles.tableWrap} ${styles.mTableWrap}`}>
          {/* 표 타이틀 라인(고정) */}
          <table className={`${styles.table} ${styles.mTable} ${styles.mTableHead}`}>
            <thead>
              <tr>
                <th className={styles.mColEmail} style={thStyle}>이메일</th>
                <th className={styles.mColName}  style={thStyle}>이름</th>
                <th className={styles.mColDate}  style={thStyle}>생성일</th>
                <th className={styles.mColCtrl}  style={thStyle}>관리</th>
              </tr>
            </thead>
          </table>

          {/* 가운데 리스트만 스크롤(바닥여유: listBottomPad) */}
          <div className={styles.mListScroll}>
            <table className={`${styles.table} ${styles.mTable} ${styles.mTableBody}`}>
              <tbody>
                {rows.map(r=>(
                  <tr key={r.uid}>
                    <td className={styles.mColEmail} style={tdStyle}>{r.email}</td>
                    <td className={styles.mColName}  style={tdStyle}>{r.name}</td>
                    <td className={styles.mColDate}  style={tdStyle}>{fmtDateOnly(r.createdAt)}</td>
                    <td className={styles.mColCtrl}  style={tdStyle}>
                      <button
                        onClick={()=>onForceDelete(r.uid)}
                        disabled={busy}
                        className={`${styles.dangerGhostBtn} ${styles.blueFocus} ${styles.mDeleteBtn}`}
                        style={{
                          height: UI.delBtnH,
                          padding: `0 ${UI.delBtnPadX}px`,
                          borderRadius: UI.delBtnRadius,
                          fontSize: UI.delBtnFont
                        }}
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

        {/* ⬇ 하단 3버튼(카드 바닥 절대 고정) */}
        <div className={styles.tableFooterRight} style={footerStyle}>
          <button onClick={load}        disabled={loading} className={`${styles.ghostBtn} ${styles.blueFocus}`} style={btnStyle}>새로고침</button>
          <button onClick={downloadCSV}                        className={`${styles.ghostBtn} ${styles.blueFocus}`} style={btnStyle}>CSV 다운로드</button>
          <button onClick={downloadJPG}                        className={`${styles.ghostBtn} ${styles.blueFocus}`} style={btnStyle}>JPG로 저장</button>
        </div>
      </section>
    </div>
  );
}
