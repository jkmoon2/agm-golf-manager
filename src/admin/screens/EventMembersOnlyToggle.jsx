// /src/admin/screens/EventMembersOnlyToggle.jsx
// 기존 파일을 100% 대체해도 되는 드롭인 버전입니다.
// 변경 요약:
// 1) 토글을 검증된 switch(.switch + .slider)로 회귀 -> 즉시 동작
// 2) "이벤트를 불러오세요" 문구를 한 줄, 입력박스 오른쪽 라인에 맞춰 표시
// 3) 저장 필드: events/{eventId}.membersOnly (최상위) 로 통일
//    ※ 과거 데이터(playerGate.membersOnly 등)는 읽을 때 백워드 호환

import React, { useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import styles from '../../screens/Settings.module.css';

export default function EventMembersOnlyToggle() {
  const [eventId, setEventId] = useState('');
  const [title, setTitle] = useState('');
  const [membersOnly, setMembersOnly] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setLoaded(false);
    if (!eventId) return;
    const ref = doc(db, 'events', eventId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      setTitle('');
      setMembersOnly(false);
      setLoaded(true);
      return;
    }
    const v = snap.data() || {};
    // 백워드 호환: 과거 필드도 함께 체크
    const flag = !!(v.membersOnly || v.playerGate?.membersOnly || v.playerGate?.memberOnly);
    setTitle(v.title || v.name || eventId);
    setMembersOnly(flag);
    setLoaded(true);
  }

  async function toggle() {
    if (!eventId) return;
    const ref = doc(db, 'events', eventId);
    const next = !membersOnly;
    await updateDoc(ref, { membersOnly: next }); // 최상위 필드로 통일
    setMembersOnly(next);
  }

  return (
    <div style={{ padding: 12 }}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>회원 전용 이벤트</h3>
        </div>

        {/* 상단: 입력 오른쪽에 "불러오기" 버튼 (Settings.module.css의 .bulkTopRow 활용) */}
        <div className={styles.bulkTopRow}>
          <input
            className={styles.searchInput}
            placeholder="이벤트ID"
            value={eventId}
            onChange={(e) => setEventId(e.target.value.trim())}
          />
          <button className={styles.searchBtn} onClick={load}>불러오기</button>
        </div>

        {/* 불러오기 전 도움말: 한 줄 + 입력 옆 라인에 맞춤 */}
        {!loaded && (
          <div className={styles.singleHelp}>이벤트를 불러오세요</div>
        )}

        {/* 불러온 뒤: 캡션(한 줄) + 토글을 같은 라인에 배치 */}
        {loaded && (
          <div className={styles.optionRow} style={{ marginTop: 8 }}>
            <div className={styles.eventCaptionInline}>
              {title ? `이벤트 : ${title}` : '이벤트를 찾을 수 없습니다'}
            </div>
            {/* 검증된 스위치: 즉시 동작 */}
            <label className={styles.switch} title="회원 전용">
              <input type="checkbox" checked={!!membersOnly} onChange={toggle} />
              <span className={styles.slider}></span>
            </label>
          </div>
        )}
      </section>
    </div>
  );
}
