// /src/screens/Step4.jsx

import React, { useContext, useState, useEffect, useRef } from "react";
import styles from "./Step4.module.css";
import { StepContext } from "../flows/StepFlow";
import { EventContext } from "../contexts/EventContext";
import {
  doc, collection, setDoc, updateDoc, writeBatch, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import * as XLSX from 'xlsx';
import { getAuth } from 'firebase/auth';

const LAST_SELECTED_FILENAME_KEY = 'agm_step4_filename';

export default function Step4(props) {

  // ── iOS Safe-Bottom & BottomTab 대응 (footer 고정 + 컨텐츠 스크롤) ─────────
  const [__bottomGap, __setBottomGap] = React.useState(64);
  React.useEffect(() => {
    const probe = () => {
      try {
        const el = document.querySelector('[data-bottom-nav]') 
               || document.querySelector('#bottomTabBar') 
               || document.querySelector('.bottomTabBar') 
               || document.querySelector('.BottomTabBar');
        __setBottomGap(el && el.offsetHeight ? el.offsetHeight : 64);
      } catch {}
    };
    probe();
    window.addEventListener('resize', probe);
    return () => window.removeEventListener('resize', probe);
  }, []);
  const __FOOTER_H = 56;
  const __safeBottom = `calc(env(safe-area-inset-bottom, 0px) + ${__bottomGap}px)`;
  const __pageStyle  = { minHeight:'100dvh', boxSizing:'border-box', paddingBottom:`calc(${__FOOTER_H}px + ${__safeBottom})` };

  const { uploadMethod, participants, setParticipants, roomCount, handleFile, goPrev, goNext } = useContext(StepContext);
  const { eventId } = useContext(EventContext);

  // 파일명: 재시작 후에도 유지 (localStorage 우선)
  const [selectedFileName, setSelectedFileName] = useState(() => {
    try {
      return localStorage.getItem(LAST_SELECTED_FILENAME_KEY)
          || sessionStorage.getItem(LAST_SELECTED_FILENAME_KEY)
          || '';
    } catch { return ''; }
  });
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_SELECTED_FILENAME_KEY);
      if (saved && saved !== selectedFileName) setSelectedFileName(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [hdInput, setHdInput] = useState({});
  useEffect(() => {
    setHdInput(prev => {
      const next = { ...prev };
      for (const p of participants) {
        const key = String(p.id);
        if (!(key in next)) {
          next[key] = p.handicap === null || p.handicap === undefined ? '' : String(p.handicap);
        }
      }
      return next;
    });
  }, [participants]);

  const upsertParticipantFields = async (pid, baseObj, patch) => {
    if (!eventId) return;
    const ref = doc(db, 'events', eventId, 'participants', String(pid));
    try {
      await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
    } catch (e) {
      const msg = String(e?.message || '');
      const notFound = e?.code === 'not-found' || msg.includes('No document to update');
      if (notFound) {
        await setDoc(ref, {
          id: baseObj?.id ?? pid,
          group: baseObj?.group ?? 1,
          nickname: baseObj?.nickname ?? '',
          handicap: baseObj?.handicap ?? null,
          score:    baseObj?.score ?? null,
          room:     baseObj?.room ?? null,
          partner:  baseObj?.partner ?? null,
          selected: baseObj?.selected ?? false,
          ...patch, updatedAt: serverTimestamp(),
        }, { merge: true });
      } else {
        console.error('[Step4] upsertParticipantFields error:', e);
        throw e;
      }
    }
  };

  const toggleSelect   = (i) => { const c=[...participants]; c[i].selected=!c[i].selected; setParticipants(c); };
  const addParticipant = async () => {
    if (!eventId) return alert('이벤트가 설정되지 않았습니다.');
    const newId = participants.length;
    const newObj = { id:newId, group:1, nickname:"", handicap:null, score:null, room:null, partner:null, selected:false, updatedAt:serverTimestamp() };
    await setDoc(doc(db,'events',eventId,'participants',String(newId)), newObj, { merge:true });
    setParticipants(p=>[...p,newObj]); setHdInput(prev=>({ ...prev, [String(newId)]: '' }));
  };
  const delSelected = async () => {
    if (!eventId) return alert('이벤트가 설정되지 않았습니다.');
    const ids = participants.filter(x=>x.selected).map(x=>x.id);
    const batch = writeBatch(db);
    ids.forEach(id=> batch.delete(doc(collection(db,'events',eventId,'participants'), String(id))));
    await batch.commit();
    setParticipants(p=>p.filter(x=>!x.selected));
    setHdInput(prev=>{ const n={...prev}; ids.forEach(id=> delete n[String(id)]); return n; });
  };
  const changeGroup    = async (i,v)=>{ const c=[...participants]; c[i]={...c[i],group:v}; setParticipants(c); await upsertParticipantFields(c[i].id,c[i],{group:v}); };
  const changeNickname = async (i,v)=>{ const c=[...participants]; c[i]={...c[i],nickname:v}; setParticipants(c); await upsertParticipantFields(c[i].id,c[i],{nickname:v}); };
  const changeHandicapDraft=(pid,raw)=> setHdInput(prev=>({ ...prev,[String(pid)]:raw }));
  const commitHandicap = async (i)=>{
    const pid=participants[i].id; const raw=(hdInput[String(pid)]??'').trim();
    let v=null; if(raw!=='' && raw!=='-'){ const num=Number(raw); v=Number.isFinite(num)?num:null; }
    const c=[...participants]; c[i]={...c[i],handicap:v}; setParticipants(c);
    await upsertParticipantFields(pid,c[i],{handicap:v});
    setHdInput(prev=>({ ...prev,[String(pid)]: v===null?'':String(v)}));
  };
  const onHdKeyDown = (e)=>{ if(e.key==='Enter') e.currentTarget.blur(); };

  const [savePII,setSavePII]=useState(true);

  const handleFileExtended = async (e) => {
    try {
      const f = e?.target?.files?.[0];
      const name = f?.name || '';
      setSelectedFileName(name);
      try {
        localStorage.setItem(LAST_SELECTED_FILENAME_KEY, name);
        sessionStorage.setItem(LAST_SELECTED_FILENAME_KEY, name);
      } catch {}

      if (typeof handleFile === 'function') await handleFile(e);

      const user = getAuth().currentUser;
      const isAdmin = !!user && user.email === 'a@a.com';
      if (!savePII || !eventId || !isAdmin || !f) return;

      const ab = await f.arrayBuffer();
      const wb = XLSX.read(ab, { type:'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows  = XLSX.utils.sheet_to_json(sheet,{ header:1 });

      const batch = writeBatch(db);
      for (let i=1;i<rows.length;i++){
        const r = rows[i]||[];
        const email = String(r[4]||'').trim().toLowerCase();
        const nameCell = String(r[5]||'').trim();
        const nickname = String(r[1]||'').trim();
        const group    = Number(r[0])||null;
        if(!email) continue;
        batch.set(
          doc(db,'events',eventId,'preMembers',email),
          { name: nameCell||null, nickname: nickname||null, group: Number.isFinite(group)?group:null,
            uploadedAt: serverTimestamp(), importedFrom:'excel' },
          { merge:true }
        );
      }
      await batch.commit();
    } catch (err) {
      console.warn('[Step4] handleFileExtended error', err);
      alert(`엑셀 업로드 중 preMembers 반영에 실패했습니다.\n(${err?.code || 'error'})`);
    }
  };

  // 롱프레스 전체 선택/해제
  const longPressTimer=useRef(null);
  const startLongSelectAll=()=>{
    if(longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current=setTimeout(()=>{
      setParticipants(prev=>{
        const all=prev.every(p=>!!p.selected);
        return prev.map(p=>({ ...p, selected:!all }));
      });
    },600);
  };
  const cancelLong=()=>{ if(longPressTimer.current) clearTimeout(longPressTimer.current); };

  const ToggleBtn=({checked,onChange})=>(
    <button type="button" onClick={()=>onChange(!checked)} className={styles.pmToggleBtn} title="preMembers 저장 여부">
      <span aria-hidden>{checked?'☑':'☐'}</span><span>preMembers</span>
    </button>
  );

  return (
    <div className={`${styles.step} ${styles.step4}`} style={__pageStyle}>
      <div className={`${styles.excelHeader} ${uploadMethod==="manual"?styles.manual:""}`} style={{marginBottom:12}}>
        {uploadMethod==="auto" && (
          <div className={styles.headerGrid} style={{display:'grid',gridTemplateColumns:'1fr auto',alignItems:'start',columnGap:12}}>
            <div className={styles.leftCol} style={{display:'flex',gap:8,alignItems:'center',minWidth:0}}>
              <input type="file" accept=".xlsx,.xls" onChange={handleFileExtended} />
              <span className={styles.filenameBadge} title={selectedFileName||'선택된 파일 없음'}>
                {selectedFileName || '선택된 파일 없음'}
              </span>
            </div>

            {/* 우측: 유령요소 완전 차단 + 덮개 레이어 */}
            <div className={styles.rightCol}>
              <div className={styles.rightBox}>
                <span className={styles.totalInline}>총 슬롯: {roomCount * 4}명</span>
                <ToggleBtn checked={savePII} onChange={setSavePII} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.participantRowHeader}>
        <div className={`${styles.cell} ${styles.group}`}>조</div>
        <div className={`${styles.cell} ${styles.nickname}`}>닉네임</div>
        <div className={`${styles.cell} ${styles.handicap}`}>G핸디</div>
        <div className={`${styles.cell} ${styles.delete}`}>
          <span onMouseDown={startLongSelectAll} onMouseUp={cancelLong} onMouseLeave={cancelLong}
                onTouchStart={startLongSelectAll} onTouchEnd={cancelLong}
                style={{userSelect:'none',cursor:'pointer'}} title="길게 누르면 전체 선택/해제">
            선택
          </span>
        </div>
      </div>

      <div className={styles.participantTable}>
        {participants.map((p,i)=>(
          <div key={p.id} className={styles.participantRow}>
            <div className={`${styles.cell} ${styles.group}`}>
              <select className={styles.groupSelect} value={p.group} onChange={(e)=>changeGroup(i, Number(e.target.value))}>
                {Array.from({length:roomCount},(_,idx)=>idx+1).map(n=>(<option key={n} value={n}>{n}조</option>))}
              </select>
            </div>
            <div className={`${styles.cell} ${styles.nickname}`}>
              <input type="text" placeholder="닉네임" value={p.nickname} onChange={(e)=>changeNickname(i,e.target.value)} />
            </div>
            <div className={`${styles.cell} ${styles.handicap}`}>
              <input type="text" inputMode="decimal" placeholder="G핸디"
                     value={hdInput[String(p.id)] ?? (p.handicap ?? '')}
                     onChange={(e)=>changeHandicapDraft(p.id,e.target.value)} onBlur={()=>commitHandicap(i)} onKeyDown={onHdKeyDown}/>
            </div>
            <div className={`${styles.cell} ${styles.delete}`}>
              <input type="checkbox" checked={p.selected||false} onChange={()=>toggleSelect(i)} />
            </div>
          </div>
        ))}
      </div>

      <div className={styles.stepFooter} style={{position:"fixed", left:0, right:0, bottom: __safeBottom, zIndex: 5}}>
        <button onClick={goPrev}>← 이전</button>
        <button onClick={addParticipant}>추가</button>
        <button onClick={delSelected}>삭제</button>
        <button onClick={goNext}>다음 →</button>
      </div>
    </div>
  );
}
