// /src/admin/screens/EventMembersOnlyToggle.jsx

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export default function EventMembersOnlyToggle() {
  const { eventId } = useParams();
  const [loading, setLoading] = useState(true);
  const [membersOnly, setMembersOnly] = useState(false);
  const [title, setTitle] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ref = doc(db, 'events', eventId);
        const snap = await getDoc(ref);
        const data = snap.data() || {};
        if (!mounted) return;
        setMembersOnly(!!data.membersOnly);
        setTitle(data.title || eventId);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [eventId]);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const ref = doc(db, 'events', eventId);
      await setDoc(ref, { membersOnly: !membersOnly }, { merge: true });
      setMembersOnly(!membersOnly);
      alert(`회원 전용: ${!membersOnly ? '사용' : '해제'}`);
    } catch (e) {
      alert(`저장 실패: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>이벤트 설정: {title}</h2>
      <div style={{
        display:'flex', alignItems:'center', gap:12,
        padding:16, border:'1px solid #e5e7eb', borderRadius:12, maxWidth:540
      }}>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>회원 전용 이벤트</div>
          <div style={{ color:'#555' }}>
            ON: 로그인한 회원만 입장 가능<br/>
            OFF: 로그인/인증코드 모두 허용
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={loading}
          style={{
            minWidth:96, height:40, borderRadius:10,
            border:'1px solid #cfd7e6', background: membersOnly ? '#1d4ed8' : '#f9fbff',
            color: membersOnly ? '#fff' : '#334155', fontWeight:700, cursor:'pointer'
          }}
        >
          {membersOnly ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
}
