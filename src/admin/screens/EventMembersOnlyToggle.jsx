// /src/admin/screens/EventMembersOnlyToggle.jsx

import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export default function EventMembersOnlyToggle() {
  const [eventId, setEventId] = useState('');
  const [loading, setLoading] = useState(false);
  const [membersOnly, setMembersOnly] = useState(false);
  const [title, setTitle] = useState('');

  const fetch = async (id) => {
    if(!id) return;
    setLoading(true);
    try{
      const ref = doc(db,'events',id);
      const snap = await getDoc(ref);
      const data = snap.data() || {};
      setMembersOnly(!!data.membersOnly);
      setTitle(data.title || id);
    }finally{ setLoading(false); }
  };

  const save = async (id, next) => {
    setLoading(true);
    try{
      await setDoc(doc(db,'events',id), { membersOnly: next }, { merge:true });
      setMembersOnly(next);
      alert(`회원 전용: ${next ? 'ON' : 'OFF'}`);
    }finally{ setLoading(false); }
  };

  return (
    <div style={{padding:20, maxWidth:560}}>
      <h2 style={{marginTop:0}}>설정 · 회원 전용 이벤트</h2>
      <div style={{display:'flex', gap:8}}>
        <input placeholder="이벤트 ID 입력" value={eventId} onChange={e=>setEventId(e.target.value)} style={{flex:1, height:40, border:'1px solid #cfd7e6', borderRadius:10, padding:'0 12px'}}/>
        <button onClick={()=>fetch(eventId)} disabled={!eventId||loading} style={{height:40, borderRadius:10, border:'1px solid #cfd7e6', background:'#f9fbff', padding:'0 14px'}}>불러오기</button>
      </div>
      {title && (
        <div style={{marginTop:16, padding:16, border:'1px solid #e5e7eb', borderRadius:12}}>
          <div style={{fontWeight:700, marginBottom:8}}>이벤트: {title}</div>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <div style={{flex:1, color:'#475569'}}>ON: 로그인 회원만 입장 / OFF: 로그인·인증코드 모두 허용</div>
            <button onClick={()=>save(eventId, !membersOnly)} disabled={!eventId||loading}
                    style={{minWidth:96, height:40, borderRadius:10, border:'1px solid #cfd7e6',
                            background:membersOnly?'#1d4ed8':'#f9fbff', color:membersOnly?'#fff':'#334155', fontWeight:700}}>
              {membersOnly?'ON':'OFF'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
