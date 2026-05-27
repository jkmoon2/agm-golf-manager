import React, { useState, useEffect, useContext } from 'react';
import styles from '../screens/Step1.module.css';
import { EventContext } from '../contexts/EventContext';
import { StepContext } from '../flows/StepFlow';
import {
  collection,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

export default function EventSelector({ onLoaded }) {
  // EventContext: eventId, eventData 상태 관리
  const { eventId, setEventId, eventData, setEventData, deleteEvent } = useContext(EventContext);
  // StepContext: 스텝 흐름 상태들 세팅
  const { setMode, setTitle, setRoomCount, setRoomNames, setParticipants } = useContext(StepContext);

  // 로컬 상태
  const [modeState, setModeState]     = useState(eventData?.mode || 'stroke');
  const [events, setEvents]           = useState([]);
  const [selected, setSelected]       = useState(eventId || '');

  // 모드 변경 시 목록 로드
  useEffect(() => {
    setMode(modeState);
    getDocs(collection(db, 'events')).then(snaps => {
      const evs = snaps.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(e => e.mode === modeState);
      setEvents(evs);
      setSelected(evs[0]?.id || '');
    });
  }, [modeState, setMode]);

  // 기존 대회 불러오기
  const handleLoad = async () => {
    if (!selected) return alert('불러올 대회를 선택하세요.');
    const ref  = doc(db, 'events', selected);
    const snap = await getDoc(ref);
    if (!snap.exists()) return alert('문서를 찾을 수 없습니다.');
    const data = snap.data();

    // Context에 저장
    setEventData(data);
    setEventId(selected);
    // StepContext에 동기화
    setMode(data.mode);
    setTitle(data.title);
    setRoomCount(data.roomCount);
    setRoomNames(data.roomNames);

    // 참가자 불러오기
    const partSnaps = await getDocs(collection(db, 'events', selected, 'participants'));
    const parts     = partSnaps.docs.map(d => d.data());
    setParticipants(parts);
    if (onLoaded) onLoaded(parts);
  };

  // 새 대회 시작
  const handleNew = () => {
    setEventId(null);
    setEventData(null);
    setParticipants([]);
  };

  // 대회 삭제
  const handleDelete = async (id) => {
    if (!window.confirm('정말 이 대회를 삭제하시겠습니까? 모든 참가자 데이터도 함께 삭제됩니다.')) return;
    try {
      if (typeof deleteEvent === 'function') {
        await deleteEvent(id);
      } else {
        throw new Error('deleteEvent 함수가 준비되지 않았습니다.');
      }

      // UI 업데이트
      setEvents(ev => ev.filter(e => e.id !== id));
      if (selected === id) setSelected('');
      if (eventId === id) {
        setEventId(null);
        setEventData(null);
        setParticipants([]);
      }
    } catch (e) {
      console.error('[EventSelector] deleteEvent failed:', e);
      alert('대회 삭제 중 오류가 발생했습니다. 콘솔 로그와 Firestore 권한을 확인해 주세요.');
    }
  };

  return (
    <div className={styles.step}>
      <div className={styles.stepBody}>
        {/* 모드 선택 */}
        <div className={styles.btnGroup}>
          <button
            className={modeState === 'stroke' ? styles.active : undefined}
            onClick={() => setModeState('stroke')}
          >스트로크 모드</button>
          <button
            className={modeState === 'agm' ? styles.active : undefined}
            onClick={() => setModeState('agm')}
          >AGM 포볼 모드</button>
        </div>

        {/* 대회 리스트 */}
        <ul style={{ marginTop: 16, listStyle: 'none', padding: 0 }}>
          {!events.length && (
            <li style={{ color: '#666', padding: 8 }}>모드를 선택하세요</li>
          )}
          {events.map(ev => (
            <li key={ev.id} style={{ display: 'flex', alignItems: 'center', padding: 8, borderBottom: '1px solid #ddd' }}>
              <span
                style={{ flex: 1, cursor: 'pointer', color: selected===ev.id ? '#1976d2' : '#000' }}
                onClick={() => setSelected(ev.id)}
              >
                {ev.title || ev.id}
              </span>
              <button
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                onClick={() => handleDelete(ev.id)}
              >🗑️</button>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.stepFooter}>
        <button onClick={handleNew}>새 대회 시작</button>
        <button onClick={handleLoad} disabled={!selected}>불러오기</button>
      </div>
    </div>
);
}
