// src/screens/Step0.jsx

import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { EventContext } from '../contexts/EventContext';
import styles from './Step0.module.css';

export default function Step0() {
  const { createEvent, loadEvent, deleteEvent, allEvents } = useContext(EventContext);
  const [viewMode, setViewMode]     = useState('stroke');
  const [selectedId, setSelectedId] = useState(null);
  const navigate                     = useNavigate();

  // 1) 대회 불러오기
  const handleLoad = async () => {
    if (!selectedId) {
      alert('불러올 대회를 선택해주세요.');
      return;
    }
    try {
      // 선택된 대회 로드
      await loadEvent(selectedId);
      // STEP1으로 이동
      navigate('/admin/home/1');
    } catch (error) {
      console.error('이벤트 로드 오류:', error);
      alert('이벤트 불러오기 중 문제가 발생했습니다.');
    }
  };

  // 2) 새 대회 생성
  const handleCreate = async () => {
    const title = prompt('새 대회명 입력:');
    if (!title) return;

    const wantId = window.confirm('ID를 직접 입력하시겠습니까?');
    let customId = null;
    if (wantId) {
      const cid = prompt('원하는 대회 ID 입력:');
      if (cid) customId = cid.trim();
    }

    const newId = await createEvent({
      title: title.trim(),
      mode:  viewMode,
      id:    customId
    });
    setSelectedId(newId);
  };

  // 3) 링크 복사
  const handleCopy = id => {
    const url = `${window.location.origin}/join/${id}`;
    navigator.clipboard.writeText(url);
    alert(`링크가 복사되었습니다:\n${url}`);
  };

  // 4) 대회 삭제
  const handleDelete = async id => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    await deleteEvent(id);
    if (selectedId === id) setSelectedId(null);
  };

  // 5) 현재 모드에 맞춘 목록 필터링
  const filtered = allEvents.filter(e => e.mode === viewMode);

  return (
    <div className={styles.container}>
      {/* 모드 탭 */}
      <div className={styles.tabContainer}>
        <button
          className={`${styles.tabBtn} ${viewMode==='stroke'?styles.active:''}`}
          onClick={() => setViewMode('stroke')}
        >스트로크</button>
        <button
          className={`${styles.tabBtn} ${viewMode==='agm'?styles.active:''}`}
          onClick={() => setViewMode('agm')}
        >AGM 포볼</button>
      </div>

      {/* 대회 리스트 */}
      <ul className={styles.list}>
        {filtered.map(evt => (
          <li
            key={evt.id}
            className={`${styles.item} ${selectedId===evt.id?styles.selected:''}`}
            onClick={() => setSelectedId(evt.id)}
          >
            <span className={styles.title}>{evt.title}</span>
            <div className={styles.actions}>
              <button
                className={styles.iconBtn}
                onClick={e => { e.stopPropagation(); handleCopy(evt.id); }}
                title="링크 복사"
              >🔗</button>
              <button
                className={styles.iconBtn}
                onClick={e => { e.stopPropagation(); handleDelete(evt.id); }}
                title="삭제"
              >🗑️</button>
            </div>
          </li>
        ))}
      </ul>

      {/* 하단 버튼 */}
      <div className={styles.footerBtns}>
        <button className={styles.primaryBtn} onClick={handleCreate}>새 대회 생성</button>
        <button className={styles.secondaryBtn} onClick={handleLoad}>불러오기</button>
      </div>
    </div>
  );
}
