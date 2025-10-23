// /src/admin/screens/PreMembersList.jsx

import React, { useEffect, useMemo, useState, useContext } from 'react';
import {
  collection, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp,
  query, orderBy, getDocs, getDoc, writeBatch
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../../firebase';
import { EventContext } from '../../contexts/EventContext';
import styles from '../../screens/Settings.module.css';

function rowDate(v) {
  if (!v) return '';
  const d = v?.toDate?.() ? v.toDate() : (typeof v.seconds === 'number' ? new Date(v.seconds * 1000) : null);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

export default function PreMembersList() {
  const { eventId: ctxEventId, allEvents = [] } = useContext(EventContext) || {};
  const [eventId, setEventId] = useState(ctxEventId || localStorage.getItem('eventId') || '');
  const [items, setItems] = useState([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [group, setGroup] = useState('');
  const [error, setError] = useState('');

  const [focusField, setFocusField] = useState(null); // [ADD] 포커스 테두리 표시용

  const auth = getAuth();
  const user = auth.currentUser;
  const isAdmin = !!user && (user.email === 'a@a.com'); // 규칙과 동일 기준

  // 이벤트 선택이 비어있으면 첫 이벤트 채우기(기존 컨텍스트/로컬 저장값 우선)
  useEffect(() => {
    if (eventId) return;
    const first = allEvents?.[0]?.id;
    if (first) setEventId(first);
  }, [allEvents, eventId]);

  // 리스트 구독
  useEffect(() => {
    setError('');
    setItems([]);
    if (!eventId) return;
    try {
      const col = collection(db, 'events', eventId, 'preMembers');
      const q = query(col, orderBy('name', 'asc'));
      const unsub = onSnapshot(q, (snap) => {
        const rows = [];
        snap.forEach(d => rows.push({ email: d.id, ...(d.data()||{}) }));
        setItems(rows);
      }, (e) => setError(e?.message || '권한 또는 네트워크 오류'));
      return unsub;
    } catch (e) {
      setError(e?.message || '권한 또는 네트워크 오류');
    }
  }, [eventId]);

  const canEdit = isAdmin;  // 조회는 누구나, 편집은 관리자만

  const addOrUpdate = async () => {
    if (!canEdit) return;
    const key = (email || '').trim().toLowerCase();
    if (!key || !key.includes('@')) { alert('이메일 형식을 확인해 주세요.'); return; }
    try {
      await setDoc(
        doc(db, 'events', eventId, 'preMembers', key),
        { name: (name||'').trim(), nickname: (nickname||'').trim(), group: group || null, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setEmail(''); setName(''); setNickname(''); setGroup('');
    } catch (e) {
      alert('저장 실패: ' + (e?.message || ''));
    }
  };

  const remove = async (key) => {
    if (!canEdit) return;
    if (!window.confirm('삭제하시겠어요?')) return;
    try { await deleteDoc(doc(db, 'events', eventId, 'preMembers', key)); }
    catch (e) { alert('삭제 실패: ' + (e?.message || '')); }
  };

  // [ADD] 전역 회원목록 → 선택한 대회의 preMembers로 신규만 가져오기
  const importFromMembers = async () => {
    if (!canEdit) { alert('관리자만 사용할 수 있습니다.'); return; }
    if (!eventId) { alert('대회를 먼저 선택해 주세요.'); return; }

    try {
      const memSnap = await getDocs(collection(db, 'memberships')); // 전역 회원 목록
      const existing = new Set(items.map(r => (r.email || '').toLowerCase()));
      const batch = writeBatch(db);
      let addCount = 0;

      memSnap.forEach(m => {
        const data = m.data() || {};
        const key = String(data.email || m.id || '').trim().toLowerCase();
        const nm  = String(data.name || data.displayName || '').trim();
        if (!key || !key.includes('@')) return;           // 이메일 없는 레코드는 제외
        if (existing.has(key)) return;                    // 이미 있으면 제외(신규만)
        batch.set(
          doc(db, 'events', eventId, 'preMembers', key),
          { name: nm || null, importedFrom: 'memberships', updatedAt: serverTimestamp() },
          { merge: true }
        );
        existing.add(key);
        addCount++;
      });

      if (addCount === 0) {
        alert('추가할 신규 데이터가 없습니다.');
        return;
      }
      await batch.commit();
      alert(`회원목록에서 ${addCount}건을 추가했습니다.`);
    } catch (e) {
      console.error('[PreMembers] importFromMembers error', e);
      alert('가져오기 실패: 콘솔을 확인해 주세요.');
    }
  };

  const csvDownload = () => {
    const header = ['email','name','nickname','group','updatedAt'];
    const lines = [header.join(',')];
    items.forEach(r => {
      const t = rowDate(r.updatedAt);
      const line = [r.email, r.name||'', r.nickname||'', r.group||'', t].map(x => `"${(x??'').toString().replaceAll('"','""')}"`).join(',');
      lines.push(line);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `preMembers_${eventId}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // [ADD] 입력 공통 스타일(크기 확장 + 포커스 파란 테두리)
  const inputStyle = (key) => ({
    width: '100%',
    height: 44,
    fontSize: 16,
    outline: 'none',
    border: focusField === key ? '2px solid #3B82F6' : undefined,
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>AGM Golf Manager</h2>
        <div className={styles.caption}>이메일/이름 관리 (preMembers)</div>
      </div>

      {/* 이벤트 선택 */}
      <section className={styles.card}>
        <div className={styles.cardHeader}><h3>대회 선택</h3></div>
        <div className={styles.eventRow}>
          <div className={styles.eventSelectWrap}>
            <select className={styles.eventSelect} value={eventId} onChange={e => setEventId(e.target.value)}>
              {allEvents?.map(ev => <option key={ev.id} value={ev.id}>{ev.title || ev.name || ev.id}</option>)}
            </select>
          </div>
        </div>
        {!!error && <div className={styles.hint} style={{color:'#b91c1c', marginTop:8}}>오류: {error}</div>}
        {!isAdmin && <div className={styles.hint} style={{marginTop:6}}>조회만 가능합니다. (관리자 전용: a@a.com)</div>}
      </section>

      {/* 추가/수정 폼 */}
      <section className={styles.card}>
        <div className={styles.cardHeader}><h3>추가 / 수정</h3></div>

        {/* [CHG] 입력박스 크기 확대 & 저장 버튼 우측 정렬 */}
        <div className={styles.themeRow} style={{ gap: 8, alignItems: 'center' }}>
          <input
            className={styles.input}
            placeholder="email (문서 ID)"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            onFocus={()=>setFocusField('email')}
            onBlur={()=>setFocusField(null)}
            style={inputStyle('email')}
          />
          <input
            className={styles.input}
            placeholder="이름"
            value={name}
            onChange={e=>setName(e.target.value)}
            onFocus={()=>setFocusField('name')}
            onBlur={()=>setFocusField(null)}
            style={inputStyle('name')}
          />
          <input
            className={styles.input}
            placeholder="닉네임(선택)"
            value={nickname}
            onChange={e=>setNickname(e.target.value)}
            onFocus={()=>setFocusField('nickname')}
            onBlur={()=>setFocusField(null)}
            style={inputStyle('nickname')}
          />
          <input
            className={styles.input}
            placeholder="조(선택)"
            value={group}
            onChange={e=>setGroup(e.target.value)}
            onFocus={()=>setFocusField('group')}
            onBlur={()=>setFocusField(null)}
            style={inputStyle('group')}
          />

          {/* [CHG] 저장 버튼을 오른쪽 끝으로 */}
          <div style={{ marginLeft: 'auto' }}>
            <button className={styles.saveBtn} onClick={addOrUpdate} disabled={!canEdit}>저장</button>
          </div>
        </div>

        {/* [ADD] 전역 회원목록 → preMembers(신규만) 가져오기 */}
        <div className={styles.themeRow} style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button className={styles.eventSelect} onClick={importFromMembers} disabled={!canEdit}>
            회원목록에서 가져오기(신규만)
          </button>
        </div>
      </section>

      {/* 목록 */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>회원 목록</h3>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Email</th><th>이름</th><th>닉네임</th><th>조</th><th>생성일</th><th>관리</th>
            </tr>
          </thead>
          <tbody>
            {!items.length ? (
              <tr><td colSpan={6} style={{color:'#6b7280', textAlign:'center'}}>데이터가 없습니다.</td></tr>
            ) : items.map(r => (
              <tr key={r.email}>
                <td>{r.email}</td>
                <td>{r.name || ''}</td>
                <td>{r.nickname || ''}</td>
                <td>{r.group || ''}</td>
                <td>{rowDate(r.updatedAt)}</td>
                <td>
                  <button className={styles.dangerBtn} onClick={() => remove(r.email)} disabled={!canEdit}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.themeRow} style={{gap:8}}>
          <button className={styles.eventSelect} onClick={() => window.location.reload()}>새로고침</button>
          <button className={styles.saveBtn} onClick={csvDownload}>CSV 다운로드</button>
        </div>
      </section>
    </div>
  );
}
