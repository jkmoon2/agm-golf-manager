// /src/screens/Settings.jsx

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './Settings.module.css';
import { EventContext } from '../contexts/EventContext';
import { collection, doc, onSnapshot, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getThemePrefs, setThemePrefs, listPresets, applyTheme } from '../themes/useTheme';
import '../themes/agm-themes.css';

const STATUS = ['hidden', 'disabled', 'enabled'];

function getDefaultGate() {
  return {
    steps: { 1:'enabled', 2:'enabled', 3:'enabled', 4:'enabled', 5:'enabled', 6:'enabled', 7:'enabled', 8:'enabled' },
    step1: { 
      teamConfirmEnabled: true, 
      teamConfirmVisible: true,
      teamConfirmHidden:  false
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
    // visible 키가 없던 구버전 보정
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
    setGate(prev => ({ 
      ...prev, 
      step1: { 
        ...(prev.step1||{}), 
        teamConfirmVisible: !!v,
        teamConfirmHidden:  !v,
        teamConfirmEnabled: true
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

  // ===== 테마 상태/라벨 =====
  const [theme, setTheme] = useState(getThemePrefs());
  const PRESET_TEXT = {
    A: 'A · Soft Neumorph Light',
    B: 'B · Pastel Elevation Blue',
    C: 'C · Glassmorphism',
    D: 'D · Outline Minimal',
    F: 'F · Dark Glow',
    I: 'I · Paper Emboss',
    L: 'L · Sandstone + Teal',
    K: 'K · High-Contrast Tabs',
    O: 'O · Crisp White / Purple',
  };
  const presets = useMemo(() => listPresets(), []);
  useEffect(() => { applyTheme('global'); }, []); // 최초 1회만 현재값 적용
  // 변경 시 저장만 하고 즉시 적용하지 않음
  const updateTheme = (patch) => {
    const merged = setThemePrefs(patch);
    setTheme(merged);
  };
  const setThemePreset = (scope, val) => updateTheme({ presets: { [scope]: val } });

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

      {/* ② 전체 프리셋 */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>② 전체 프리셋</h3>
        </div>

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
          <label className={styles.optionLabel}>STEP1 “팀확인” 버튼 <b>표시</b></label>
          <label className={styles.switch}>
            <input 
              type="checkbox" 
              checked={!!gate?.step1?.teamConfirmVisible} 
              onChange={(e)=>setTeamConfirm(e.target.checked)} 
            />
            <span className={styles.slider}></span>
          </label>
        </div>
        <div className={styles.hint}>※ 현재 STEP2가 비활성 또는 숨김이라면, STEP1의 “다음” 버튼은 자동으로 비활성화됩니다.</div>
      </section>

      {/* ⑤ 테마 설정 */}
      <section className={`${styles.card} ${styles.themeCard}`}>
        <div className={styles.cardHeader}>
          <h3>⑤ 테마 설정</h3>
        </div>

        <div className={styles.themeRow}>
          <div className={styles.optionLabel}>적용 모드</div>
          <div className={`${styles.inlineRadios} ${styles.smallNote}`}>
            <label><input type="radio" name="applyMode" checked={theme.applyMode==='global'} onChange={()=>updateTheme({applyMode:'global'})}/> 통합</label>
            <label style={{marginLeft:12}}><input type="radio" name="applyMode" checked={theme.applyMode==='separate'} onChange={()=>updateTheme({applyMode:'separate'})}/> 개별</label>
            <label style={{marginLeft:12}}><input type="radio" name="applyMode" checked={theme.applyMode==='none'} onChange={()=>updateTheme({applyMode:'none'})}/> 무적용</label>
          </div>
        </div>

        {theme.applyMode === 'global' ? (
          <div className={styles.themeRow}>
            <div className={styles.optionLabel}>프리셋(Global)</div>
            {/* [FIX] 알파벳+설명 출력 */}
            <select className={styles.select} value={theme.presets.global} onChange={e=>setThemePreset('global', e.target.value)}>
              {listPresets().map(p => <option key={p} value={p}>{PRESET_TEXT[p] || p}</option>)}
            </select>
          </div>
        ) : theme.applyMode === 'separate' ? (
          <>
            <div className={styles.themeRow}>
              <div className={styles.optionLabel}>Admin</div>
              {/* [FIX] 알파벳+설명 출력 */}
              <select className={styles.select} value={theme.presets.admin} onChange={e=>setThemePreset('admin', e.target.value)}>
                {listPresets().map(p => <option key={p} value={p}>{PRESET_TEXT[p] || p}</option>)}
              </select>
            </div>
            <div className={styles.themeRow}>
              <div className={styles.optionLabel}>Player</div>
              {/* [FIX] 알파벳+설명 출력 */}
              <select className={styles.select} value={theme.presets.player} onChange={e=>setThemePreset('player', e.target.value)}>
                {listPresets().map(p => <option key={p} value={p}>{PRESET_TEXT[p] || p}</option>)}
              </select>
            </div>
            <div className={styles.themeRow}>
              <div className={styles.optionLabel}>PlayerOnly</div>
              {/* [FIX] 알파벳+설명 출력 */}
              <select className={styles.select} value={theme.presets.playerOnly} onChange={e=>setThemePreset('playerOnly', e.target.value)}>
                {listPresets().map(p => <option key={p} value={p}>{PRESET_TEXT[p] || p}</option>)}
              </select>
            </div>
          </>
        ) : null}

        <div className={styles.themeRow}>
          <div className={styles.optionLabel}>밀도</div>
          <select className={styles.select} value={theme.density} onChange={e=>updateTheme({density:e.target.value})}>
            {['compact','default','relaxed'].map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div className={styles.themeRow}>
          <div className={styles.optionLabel}>가독성</div>
          <select className={styles.select} value={theme.contrast} onChange={e=>updateTheme({contrast:e.target.value})}>
            {['low','default','high'].map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div className={styles.themeRow}>
          <div className={styles.optionLabel}>다크 자동전환</div>
          <label className={styles.smallNote}><input type="checkbox" checked={theme.darkAuto} onChange={e=>updateTheme({darkAuto:e.target.checked})}/> 시스템 다크면 F 테마</label>
        </div>

        <div className={styles.themeRow}>
          <div />
          <div style={{display:'flex', gap:8}}>
            <button className={styles.saveBtn} onClick={()=>applyTheme('global')}>적용</button>
            <button className={styles.eventSelect} style={{height:40}} onClick={()=>{
              localStorage.removeItem('agm_theme_prefs_v1');
              const fresh = getThemePrefs();
              setTheme(fresh);
              applyTheme('global');
            }}>초기화</button>
          </div>
        </div>
      </section>

      {/* ⑥ 회원 관리 (바로가기) */}
      <section className={`${styles.section} ${styles.sectionBox}`}>
        <h3 className={`${styles.sectionTitle} ${styles.titleTight}`}>회원 관리</h3>

        <div className={`${styles.optionRow} ${styles.optionRowGrid}`}>
          <div className={styles.optionLabel}>회원 전용 이벤트</div>
          <div className={styles.rowRight}>
            <div className={styles.controlBox}>
              <Link to="/admin/settings/members-only" className={`${styles.linkBtnFullLarge} ${styles.blueFocus}`}>토글 관리</Link>
            </div>
          </div>  
        </div>

        <div className={`${styles.optionRow} ${styles.optionRowGrid}`}>
          <div className={styles.optionLabel}>회원 목록</div>
          <div className={styles.rowRight}>
            <div className={styles.controlBox}>
              <Link to="/admin/settings/members" className={`${styles.linkBtnFullLarge} ${styles.blueFocus}`}>목록/다운로드</Link>
            </div>
          </div>  
        </div>

        <div className={`${styles.optionRow} ${styles.optionRowGrid}`}>
          <div className={styles.optionLabel}>여러 이벤트 관리</div>
          <div className={styles.rowRight}>
            <div className={styles.controlBox}>
              <Link to="/admin/settings/members-bulk" className={`${styles.linkBtnFullLarge} ${styles.blueFocus}`}>일괄 토글</Link>
            </div>
          </div>
        </div> 
      </section>
    </div>
  );
}
