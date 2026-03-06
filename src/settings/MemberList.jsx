// /src/settings/MemberList.jsx

import React, { useEffect, useState, useMemo } from 'react';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import styles from './MemberList.module.css';

const db = getFirestore();
const fns = getFunctions();

export default function MemberList(){
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meIsAdmin] = useState(true); // TODO: 실제 관리자 판별(커스텀클레임 등) 연결

  useEffect(() => {
    (async ()=>{
      try {
        const snap = await getDocs(query(collection(db,'members'), orderBy('createdAt','desc')));
        const list = [];
        snap.forEach(d => list.push({ id:d.id, ...d.data() }));
        setRows(list);
      } finally { setLoading(false); }
    })();
  }, []);

  const has = rows.length > 0;

  const onForceDelete = async (uid) => {
    if (!meIsAdmin) { alert('관리자만 가능합니다.'); return; }
    if (!window.confirm('정말로 이 사용자를 강제 삭제하시겠습니까?\n(Auth + Firestore 모두 삭제)')) return;
    try {
      const call = httpsCallable(fns, 'adminDeleteUser');
      await call({ uid });
      alert('삭제되었습니다.');
      setRows(r => r.filter(x => x.uid !== uid && x.id !== uid));
    } catch (e) {
      console.error(e);
      alert('삭제에 실패했습니다: ' + (e?.message || 'unknown'));
    }
  };

  return (
    <div className={styles.wrap}>
      <h2 className={styles.title}>AGM Golf Manager</h2>
      <div className={styles.card}>
        <div className={styles.cardTitle}>회원 목록</div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.center} title="계정 고유번호">계정번호<span className={styles.small}>(UID)</span></th>
                <th className={styles.center}>이메일</th>
                <th className={styles.center}>이름</th>
                <th className={styles.center}>생성일</th>
                <th className={styles.center}>관리</th>
              </tr>
            </thead>
            <tbody>
              {!loading && !has && (
                <tr><td colSpan={5} className={styles.empty}>아직 회원이 없습니다.</td></tr>
              )}
              {rows.map(r=>{
                const ts = r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt || null);
                const created = ts ? new Date(ts).toISOString() : '-';
                return (
                  <tr key={r.id}>
                    <td className={styles.mono}>{r.uid || r.id}</td>
                    <td>{r.email || ''}</td>
                    <td>{r.name || ''}</td>
                    <td>{created}</td>
                    <td className={styles.center}>
                      <button className={styles.btnDangerOutline} onClick={()=>onForceDelete(r.uid || r.id)}>강제삭제</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={styles.tools}>
          <button className={styles.btn} onClick={()=>window.location.reload()}>새로고침</button>
          <button className={styles.btn}>CSV 다운로드</button>
          <button className={styles.btn}>JPG로 저장</button>
        </div>
      </div>
    </div>
  );
}
