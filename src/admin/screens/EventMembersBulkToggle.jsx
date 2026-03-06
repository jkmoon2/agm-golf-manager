// /src/admin/screens/EventMembersBulkToggle.jsx

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import styles from '../../screens/Settings.module.css';

export default function EventMembersBulkToggle(){
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    const run = async ()=>{
      setLoading(true);
      const snap = await getDocs(collection(db, 'events'));
      const list = [];
      snap.forEach(d=>{
        const v = d.data() || {};
        list.push({
          id: d.id,
          title: v.title || v.name || d.id,
          membersOnly: !!(v.membersOnly || v.playerGate?.membersOnly || v.playerGate?.memberOnly), // 여러 케이스 방어
          raw: v,
        });
      });
      setRows(list);
      setLoading(false);
    };
    run();
  },[]);

  const filtered = useMemo(()=>{
    const k = (q||'').trim().toLowerCase();
    if(!k) return rows;
    return rows.filter(r => (r.title||'').toLowerCase().includes(k) || (r.id||'').toLowerCase().includes(k));
  },[rows,q]);

  const toggleOne = async (ev) => {
    const ref = doc(db, 'events', ev.id);
    const next = !ev.membersOnly;
    // 저장: 문서의 최상위 membersOnly 필드를 우선 사용(앱 전체에서 통일하기 쉽습니다)
    await updateDoc(ref, { membersOnly: next });
    setRows(prev => prev.map(p => p.id === ev.id ? { ...p, membersOnly: next } : p));
  };

  return (
    <div style={{ padding: 12 }}>
      <section className={`${styles.card}`}>
        <div className={styles.cardHeader}>
          <h3>회원 전용 · 일괄 토글</h3>
        </div>

        {/* 검색 입력 오른쪽에 버튼(요청 2번) */}
        <div className={styles.bulkTopRow}>
          <input
            className={styles.searchInput}
            placeholder="이벤트명 또는 ID"
            value={q}
            onChange={e=>setQ(e.target.value)}
          />
          <button className={styles.searchBtn} onClick={()=>setQ(q.trim())}>검색</button>
        </div>

        <div style={{ height: 8 }} />

        <div className={styles.tableWrap}>
          <table className={styles.bulkTable}>
            <thead>
              <tr>
                <th className={styles.colEvent}>이벤트</th>
                <th className={styles.colId}>ID</th>
                <th className={styles.colFlag}>회원전용</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ev=>(
                <tr key={ev.id}>
                  <td className={styles.colEvent} title={ev.title}>{ev.title}</td>
                  <td className={styles.colId}>{ev.id}</td>
                  <td className={styles.colFlag}>
                    {/* ✅ 검증된 스위치로 회귀 (바로 On/Off 작동) */}
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={!!ev.membersOnly}
                        onChange={()=>toggleOne(ev)}
                      />
                      <span className={styles.slider}></span>
                    </label>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={3} className={styles.emptyCell}>{loading ? '불러오는 중...' : '검색 결과가 없습니다.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
