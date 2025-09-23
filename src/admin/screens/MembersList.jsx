// /src/admin/screens/MembersList.jsx
// [NOTE] 무료 운영(Functions 미사용) 기본값 유지.
//        .env.local에서 REACT_APP_ENABLE_ADMIN_FN=1 이면 Functions 호출(유료일 수 있음).

import React, { useEffect, useState, useRef } from 'react';
import { collection, getDocs, doc, deleteDoc, onSnapshot } from 'firebase/firestore'; // [ADD] onSnapshot
import { httpsCallable, getFunctions } from 'firebase/functions';
import html2canvas from 'html2canvas';
import { db, auth } from '../../firebase'; // [ADD] auth (헤더 구독 조건용)
import styles from '../../screens/Settings.module.css';
import { getApp } from 'firebase/app';
import { onAuthStateChanged } from 'firebase/auth'; // [ADD] 인증 후에만 실시간 구독

// [ADD] 콘솔 이동용 projectId
const PROJECT_ID = (() => {
  try { return getApp().options?.projectId || process.env.REACT_APP_FIREBASE_PROJECT_ID || ''; }
  catch { return process.env.REACT_APP_FIREBASE_PROJECT_ID || ''; }
})();

// [ADD] 무료/유료 토글 (기본 무료)
const ENABLE_ADMIN_DELETE = String(process.env.REACT_APP_ENABLE_ADMIN_FN || '0') === '1';

// 날짜 유틸
function parseDate(v) {
  try {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  } catch {}
  return null;
}
function fmtDateISO(v) { const d = parseDate(v); return d ? d.toISOString() : ''; }
function fmtDateOnly(v) { const d = parseDate(v); return d ? d.toISOString().slice(0,10) : ''; }

// CSV 유틸
function toCSV(rows) {
  const header = ['uid', '이메일', '이름', '생성일'];
  const lines = [header.join(',')];
  rows.forEach(r =>
    lines.push([r.uid, r.email || '', r.name || '', fmtDateISO(r.createdAt) || '']
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  );
  return '\uFEFF' + lines.join('\r\n');
}
function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

export default function MembersList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [canListen, setCanListen] = useState(false);   // [ADD] 로그인 후만 실시간 구독
  const tableRef = useRef(null);

  // [ADD] 인증 준비되면 onSnapshot 시작(권한/400 에러 감소)
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => setCanListen(!!user));
  }, []);

  // 실시간 구독
  useEffect(() => {
    if (!canListen) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list = [];
        snap.forEach(d => {
          const v = d.data() || {};
          list.push({ uid: d.id, email: v.email || '', name: v.name || '', createdAt: v.createdAt || '' });
        });
        // 최신 생성일 순
        list.sort((a, b) => (+new Date(fmtDateISO(b.createdAt))) - (+new Date(fmtDateISO(a.createdAt))));
        setRows(list);
        setLoading(false);
      },
      (err) => {
        console.error('[MembersList] onSnapshot error:', err?.code, err?.message);
        setLoading(false);
      }
    );
    return unsub;
  }, [canListen]);

  // 수동 새로고침
  const load = async () => {
    setLoading(true);
    try {
      const qs = await getDocs(collection(db, 'users'));
      const list = [];
      qs.forEach(d => {
        const v = d.data() || {};
        list.push({ uid: d.id, email: v.email || '', name: v.name || '', createdAt: v.createdAt || '' });
      });
      list.sort((a,b) => (+new Date(fmtDateISO(b.createdAt))) - (+new Date(fmtDateISO(a.createdAt))));
      setRows(list);
    } finally { setLoading(false); }
  };

  // 삭제(무료=콘솔 안내 / 유료=Functions)
  const onForceDelete = async (uid) => {
    if (!uid) return;
    if (!ENABLE_ADMIN_DELETE) {
      const authUrl = PROJECT_ID
        ? `https://console.firebase.google.com/project/${PROJECT_ID}/authentication/users`
        : 'https://console.firebase.google.com/';
      const docUrl = (PROJECT_ID && uid)
        ? `https://console.firebase.google.com/project/${PROJECT_ID}/firestore/data/~2Fusers~2F${encodeURIComponent(uid)}`
        : 'https://console.firebase.google.com/';
      alert(
        '무료 모드에서는 콘솔에서 삭제해 주세요.\n\n' +
        `• Auth 콘솔: ${authUrl}\n` +
        `• Firestore 문서: ${docUrl}`
      );
      window.open(authUrl, '_blank', 'noopener');
      if (docUrl) window.open(docUrl, '_blank', 'noopener');
      return;
    }

    if (!window.confirm('정말 이 회원을 삭제할까요? (Auth 계정 + Firestore 문서)')) return;
    setBusy(true);
    try {
      // Firestore users 문서는 이 화면에서 제거(Functions에서도 다시 한 번 삭제할 수 있음)
      await deleteDoc(doc(db, 'users', uid)).catch(() => {});
      const fn = httpsCallable(getFunctions(), 'adminDeleteUser');
      await fn({ uid });
      setRows(rs => rs.filter(r => r.uid !== uid));
      alert('삭제되었습니다.');
    } catch (e) {
      alert('삭제 실패: ' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const downloadCSV = () =>
    download('members.csv', new Blob([toCSV(rows)], { type: 'text/csv' }));

  const downloadJPG = async () => {
    const el = tableRef.current; if (!el) return;
    const canvas = await html2canvas(el, { backgroundColor: '#fff', scale: 2 });
    canvas.toBlob((b) => download('members.jpg', b), 'image/jpeg', 0.95);
  };

  return (
    <div style={{ padding: 12 }}>
      <section className={styles.section}>
        {/* [FIX] 타이틀 가운데 + 위로 조금 더 붙임(수치는 CSS 변수에서 조절) */}
        <h3 className={`${styles.sectionTitle} ${styles.titleTight}`} style={{textAlign:'center'}}>
          회원 목록
        </h3>

        {/* [FIX] 이 영역만 세로 스크롤(헤더 sticky는 CSS의 .mStickyHead가 담당) */}
        <div className={styles.mListScroll}>
          <div ref={tableRef} className={`${styles.tableWrap} ${styles.mTableWrap}`}>
            <table className={`${styles.table} ${styles.mTable}`}>
              <thead className={`${styles.thead} ${styles.mStickyHead}`}>
                <tr>
                  <th className={styles.mColEmail}>이메일</th>
                  <th className={styles.mColName}>이름</th>
                  <th className={styles.mColDate}>생성일</th>
                  <th className={styles.mColCtrl}>관리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.uid}>
                    <td className={styles.mColEmail}>{r.email}</td>
                    <td className={styles.mColName}>{r.name}</td>
                    <td className={styles.mColDate}>{fmtDateOnly(r.createdAt)}</td>
                    <td className={styles.mColCtrl}>
                      <button
                        onClick={() => onForceDelete(r.uid)}
                        disabled={busy}
                        className={`${styles.dangerGhostBtn} ${styles.blueFocus} ${styles.mDeleteBtn}`}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={4} className={styles.emptyCell}>등록된 회원이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
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
