// /src/screens/Settings.jsx
// STEP1 토글 라벨을 ‘활성/숨김’ 관점으로 표현(저장 로직은 동일)

import React, { useContext, useEffect, useMemo, useState } from 'react';
import styles from './Settings.module.css';
import { EventContext } from '../contexts/EventContext';
import { collection, doc, onSnapshot, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const STATUS = ['hidden', 'disabled', 'enabled'];

function getDefaultGate() {
  return {
    steps: { 1:'enabled', 2:'enabled', 3:'enabled', 4:'enabled', 5:'enabled', 6:'enabled', 7:'enabled', 8:'enabled' },
    step1: { 
      teamConfirmEnabled: true, 
      teamConfirmVisible: true,       // ★ 추가: 기본 표시
      teamConfirmHidden:  false       // ★ 추가: 기본 숨김 아님
    },
  };
}
function mergeGate(base, next){
  const g = { ...(base || getDefaultGate()) };
  const n = next || {};
  g.steps = { ...(g.steps||{}), ...(n.steps||{}) };
  g.step1 = { ...(g.step1||{}), ...(n.step1||{}) };
  return g;
}

export default function Settings() {
  const {
    allEvents = [],
    eventId,
    loadEvent,
    eventData,
    updateEvent,
    updateEventImmediate,
  } = useContext(EventContext) || {};

  const [events, setEvents] = useState([]);
  useEffect(() => {
    if (Array.isArray(allEvents) && allEvents.length) {
      setEvents(allEvents);
      return;
    }
    const unsub = onSnapshot(collection(db, 'events'), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setEvents(list);
    });
    return unsub;
  }, [allEvents]);

  const selectedId = eventId || (events[0]?.id ?? '');
  const selectedEvent = useMemo(() => events.find(e => e.id === selectedId) || {}, [events, selectedId]);

  const [gate, setGate] = useState(getDefaultGate());
  useEffect(() => {
    setGate(mergeGate(getDefaultGate(), selectedEvent?.playerGate));
    setSelectedPreset('');
    // ★ 추가: 구버전 호환 — visible/hidden 값이 없으면 enabled값으로 보정
    setGate(prev => {
      const vis = prev?.step1?.teamConfirmVisible;
      if (typeof vis === 'undefined') {
        const en = !!prev?.step1?.teamConfirmEnabled;
        return { 
          ...prev, 
          step1: { 
            ...(prev.step1||{}), 
            teamConfirmVisible: en, 
            teamConfirmHidden: !en 
          } 
        };
      }
      return prev;
    });
  }, [selectedEvent?.playerGate]);

  const [saveState, setSaveState] = useState('idle');

  const applyPreset = (type) => {
    setGate(prev => {
      const next = mergeGate(getDefaultGate(), prev);
      if (type === 'allHidden') { for(let i=1;i<=8;i+=1) next.steps[i] = 'hidden'; }
      if (type === 'allEnabled'){ for(let i=1;i<=8;i+=1) next.steps[i] = 'enabled'; }
      if (type === 'openOnlyStep1'){ for(let i=1;i<=8;i+=1) next.steps[i] = (i===1 ? 'enabled':'disabled'); }
      if (type === 'progressFlow'){ next.steps[1]='enabled'; next.steps[2]='enabled'; for(let i=3;i<=8;i+=1) next.steps[i]='disabled'; }
      return { ...next };
    });
  };

  const setStep = (idx, status) => {
    setSelectedPreset('none');
    setGate(prev => ({ ...prev, steps: { ...(prev.steps||{}), [idx]: status } }));
  };
  const setTeamConfirm = (v) => {
    setSelectedPreset('none');
    // ★ 변경: 표시/숨김 필드를 함께 저장(구버전 호환 위해 enabled는 항상 true로 유지)
    setGate(prev => ({ 
      ...prev, 
      step1: { 
        ...(prev.step1||{}), 
        teamConfirmVisible: !!v,     // 표시 여부
        teamConfirmHidden:  !v,      // 숨김 여부(반대값)
        teamConfirmEnabled: true     // 구버전 경로에서 ‘비활성’로 보이지 않게 하기 위함
      } 
    }));
  };

  async function save(){
    const id = selectedId;
    if (!id) return;
    const next = mergeGate(getDefaultGate(), gate);
    try {
      setSaveState('saving');
      if (typeof updateEventImmediate === 'function') {
        await updateEventImmediate({ playerGate: next, gateUpdatedAt: serverTimestamp() }, false);
      } else if (typeof updateEvent === 'function') {
        await updateEvent({ playerGate: next, gateUpdatedAt: serverTimestamp() });
      } else {
        await setDoc(doc(db,'events', id), { playerGate: next, gateUpdatedAt: serverTimestamp() }, { merge: true });
      }
      const snap = await getDoc(doc(db, 'events', id));
      const after = snap.exists() ? snap.data()?.playerGate : null;
      if (after) { setGate(mergeGate(getDefaultGate(), after)); setSaveState('saved'); setTimeout(()=>setSaveState('idle'), 800); }
      else { setSaveState('error'); }
    } catch (e) { console.error(e); setSaveState('error'); }
  }

  const [selectedPreset, setSelectedPreset] = useState('');
  const detectedPreset = useMemo(() => {
    const s = gate?.steps || {};
    const isAllHidden   = [1,2,3,4,5,6,7,8].every(i => s[i] === 'hidden');
    const isAllEnabled  = [1,2,3,4,5,6,7,8].every(i => s[i] === 'enabled');
    const isOnlyStep1   = s[1] === 'enabled' && [2,3,4,5,6,7,8].every(i => s[i] === 'disabled');
    const isProgress    = s[1] === 'enabled' && s[2] === 'enabled' && [3,4,5,6,7,8].every(i => s[i] === 'disabled');
    if (isAllHidden)  return 'allHidden';
    if (isOnlyStep1)  return 'openOnlyStep1';
    if (isProgress)   return 'progressFlow';
    if (isAllEnabled) return 'allEnabled';
    return '';
  }, [gate?.steps]);
  const activePreset = selectedPreset === 'none' ? '' : (selectedPreset || detectedPreset);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>AGM Golf Manager</h2>
        <div className={styles.caption}>운영자 설정</div>
      </div>

      {/* ① 대회 선택 */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>① 대회 선택</h3>
        </div>
        <div className={styles.eventRow}>
          <div className={styles.eventSelectWrap}>
            <select
              className={styles.eventSelect}
              value={selectedId}
              onChange={(e)=>{ const id = e.target.value; if (typeof loadEvent==='function') loadEvent(id); }}
            >
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {`${ev.title || ev.name || ev.id} · ${ev.mode || 'stroke'}`}
                </option>
              ))}
            </select>
          </div>
          <button className={styles.saveBtn} onClick={save}>저장</button>
        </div>
        <div className={styles.eventNote}>선택된 대회에만 설정값이 저장됩니다.</div>
        <div className={styles.saveStatus} data-state={saveState}>
          {saveState === 'saving' && '저장 중...'}
          {saveState === 'saved'  && '저장됨'}
          {saveState === 'error'  && '저장 실패'}
        </div>
      </section>

      {/* ② 전체 프리셋 (기존 유지) */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>② 전체 프리셋</h3>
        </div>

        <div className={styles.presetRow}>
          <button onClick={() => applyPreset('allHidden')}>전체 숨김</button>
          <button onClick={() => applyPreset('openOnlyStep1')}>STEP1만 오픈</button>
          <button onClick={() => applyPreset('progressFlow')}>1·2만 오픈(진행형)</button>
          <button onClick={() => applyPreset('allEnabled')}>전체 활성</button>
        </div>
        <ul className={styles.presetList}>
          <li className={styles.presetItem}><label className={styles.presetLabel}><input type="radio" name="preset" className={styles.presetRadio} /><span className={styles.presetTitle}>전체 숨김</span><span className={styles.presetDesc}>모든 스텝 버튼을 숨깁니다.</span></label></li>
          <li className={styles.presetItem}><label className={styles.presetLabel}><input type="radio" name="preset" className={styles.presetRadio} /><span className={styles.presetTitle}>STEP1만 오픈</span><span className={styles.presetDesc}>STEP1만 활성, 나머지는 비활성.</span></label></li>
          <li className={styles.presetItem}><label className={styles.presetLabel}><input type="radio" name="preset" className={styles.presetRadio} /><span className={styles.presetTitle}>1·2만 오픈(진행형)</span><span className={styles.presetDesc}>STEP1·2만 활성, 3~8 비활성.</span></label></li>
          <li className={styles.presetItem}><label className={styles.presetLabel}><input type="radio" name="preset" className={styles.presetRadio} /><span className={styles.presetTitle}>전체 활성</span><span className={styles.presetDesc}>모든 스텝 버튼을 활성화.</span></label></li>
        </ul>
        <div className={styles.presetActions}>
          <button className={styles.applyBtn}>선택 프리셋 적용</button>
        </div>

        {/* 4개 프리셋 버튼(신규 UI 유지) */}
        <div className={styles.presetGrid} role="group" aria-label="전체 프리셋">
          <button
            type="button"
            className={`${styles.presetBox} ${activePreset === 'allHidden' ? styles.presetBoxActive : ''}`}
            onClick={() => { setSelectedPreset('allHidden'); applyPreset('allHidden'); }}
            aria-pressed={activePreset === 'allHidden'}
            title="모든 스텝 버튼 숨김"
          >
            전체 숨김
          </button>
          <button
            type="button"
            className={`${styles.presetBox} ${activePreset === 'openOnlyStep1' ? styles.presetBoxActive : ''}`}
            onClick={() => { setSelectedPreset('openOnlyStep1'); applyPreset('openOnlyStep1'); }}
            aria-pressed={activePreset === 'openOnlyStep1'}
            title="STEP1만 활성"
          >
            <span className={styles.presetBoxLabel}>
              <span className={styles.l1}>STEP1</span>
              <span className={styles.l2}>오픈</span>
            </span>
          </button>
          <button
            type="button"
            className={`${styles.presetBox} ${activePreset === 'progressFlow' ? styles.presetBoxActive : ''}`}
            onClick={() => { setSelectedPreset('progressFlow'); applyPreset('progressFlow'); }}
            aria-pressed={activePreset === 'progressFlow'}
            title="STEP1·2만 활성"
          >
            <span className={styles.presetBoxLabel}>
              <span className={styles.l1}>STEP1.2</span>
              <span className={styles.l2}>오픈</span>
            </span>
          </button>
          <button
            type="button"
            className={`${styles.presetBox} ${activePreset === 'allEnabled' ? styles.presetBoxActive : ''}`}
            onClick={() => { setSelectedPreset('allEnabled'); applyPreset('allEnabled'); }}
            aria-pressed={activePreset === 'allEnabled'}
            title="모든 스텝 버튼 활성"
          >
            전체 활성
          </button>
        </div>
      </section>

      {/* ③ 스텝별 제어 */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>③ 스텝별 제어</h3>
          <div className={styles.subtle}>* 숨김: 버튼 자체 미노출 · 비활성: 클릭 불가 · 활성: 정상 동작</div>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>STEP</th><th>기능</th><th>숨김</th><th>비활성</th><th>활성</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }, (_, i) => i + 1).map(idx => (
              <tr key={idx}>
                <td>STEP {idx}</td>
                <td>메뉴 버튼</td>
                {STATUS.map((s) => (
                  <td key={s}>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name={`step-${idx}`}
                        checked={(gate?.steps?.[idx] || 'enabled') === s}
                        onChange={() => setStep(idx, s)}
                      />
                      <span />
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ④ 기타 */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>④ 기타</h3>
        </div>
        <div className={styles.optionRow}>
          {/* ★ patch: 문구를 ‘활성/숨김’ 관점으로 변경 */}
          <label className={styles.optionLabel}>STEP1 “팀확인” 버튼 <b>표시</b></label>
          <label className={styles.switch}>
            {/* ★ 변경: visible 값을 사용 */}
            <input 
              type="checkbox" 
              checked={!!gate?.step1?.teamConfirmVisible} 
              onChange={(e)=>setTeamConfirm(e.target.checked)} 
            />
            <span className={styles.slider}></span>
          </label>
        </div>
        {/* 안내 문구도 ‘활성/숨김’ 표현으로 보정 */}
        <div className={styles.hint}>※ 현재 STEP2가 비활성 또는 숨김이라면, STEP1의 “다음” 버튼은 자동으로 비활성화됩니다. (팀확인 버튼은 <b>표시/숨김</b>으로 동작)</div>
      </section>
    </div>
  );
}
