// /src/settings/ThemeSettings.jsx
// (옵션) 설정 화면 컴포넌트 - 기존 라우팅에 연결만 해주면 동작
// 기존 코드 100% 유지 + 필요한 부분만 보완(현재상태 표시/즉시적용 버튼)

import React, { useMemo, useState, useEffect } from 'react';
import { getThemePrefs, setThemePrefs, listPresets, applyTheme } from '../themes/useTheme';
import '../themes/agm-themes.css';

export default function ThemeSettings() {
  const [prefs, setPrefs] = useState(getThemePrefs());
  const presets = useMemo(() => listPresets(), []);

  // 마운트 시 한 번 적용
  useEffect(() => { applyTheme('global'); }, []);

  const update = (patch) => {
    const merged = setThemePrefs(patch);
    setPrefs(merged);
    applyTheme('global'); // 변경 즉시 반영
  };

  const setPreset = (scope, value) => update({ presets: { [scope]: value } });

  // 현재 상태 텍스트
  const modeLabel =
    prefs.applyMode === 'none' ? '무적용(기본 스타일)'
    : prefs.applyMode === 'global' ? `일괄적용: ${prefs.presets.global}`
    : `개별적용: admin=${prefs.presets.admin}, player=${prefs.presets.player}, playerOnly=${prefs.presets.playerOnly}`;

  return (
    <div style={{ padding: 16 }}>
      <h2>테마 설정</h2>

      {/* 현재 상태 / 즉시 적용 */}
      <div style={{marginTop:8, padding:'12px 14px', border:'1px solid var(--agm-border)', borderRadius:12, background:'var(--agm-surface)'}}>
        <div style={{marginBottom:8, opacity:.85}}>현재 적용 상태</div>
        <div style={{fontWeight:600}}>{modeLabel}</div>
        <div style={{marginTop:10}}>
          <button onClick={()=>applyTheme('global')}>지금 적용(Apply)</button>
        </div>
      </div>

      <section style={{marginTop:16}}>
        <h3>적용 모드</h3>
        {['none','global','separate'].map(m => (
          <label key={m} style={{marginRight:16}}>
            <input
              type="radio"
              name="applyMode"
              checked={prefs.applyMode===m}
              onChange={()=>update({applyMode:m})}
            /> {m}
          </label>
        ))}
      </section>

      <section style={{marginTop:16}}>
        <h3>프리셋 선택</h3>
        {prefs.applyMode==='global' ? (
          <Row label="Global">
            <Select value={prefs.presets.global} onChange={v=>setPreset('global', v)} options={presets} />
          </Row>
        ) : (
          <>
            <Row label="Admin">
              <Select value={prefs.presets.admin} onChange={v=>setPreset('admin', v)} options={presets} />
            </Row>
            <Row label="Player">
              <Select value={prefs.presets.player} onChange={v=>setPreset('player', v)} options={presets} />
            </Row>
            <Row label="PlayerOnly">
              <Select value={prefs.presets.playerOnly} onChange={v=>setPreset('playerOnly', v)} options={presets} />
            </Row>
          </>
        )}
      </section>

      <section style={{marginTop:16}}>
        <h3>가독성 · 밀도</h3>
        <Row label="Density">
          <Select value={prefs.density} onChange={v=>update({density:v})} options={['compact','default','relaxed']} />
        </Row>
        <Row label="Contrast">
          <Select value={prefs.contrast} onChange={v=>update({contrast:v})} options={['low','default','high']} />
        </Row>
        <Row label="다크 자동전환">
          <label>
            <input
              type="checkbox"
              checked={prefs.darkAuto}
              onChange={e=>update({darkAuto:e.target.checked})}
            />
            &nbsp;시스템 다크모드일 때 F 테마로
          </label>
        </Row>
      </section>

      <section style={{marginTop:16}}>
        <button
          onClick={()=>{
            localStorage.removeItem('agm_theme_prefs_v1');
            const fresh = getThemePrefs();
            setPrefs(fresh);
            applyTheme('global');
          }}
        >
          설정 초기화
        </button>
      </section>
    </div>
  );
}

function Row({label, children}){
  return (
    <div style={{display:'grid', gridTemplateColumns:'120px 1fr', alignItems:'center', gap:12, margin:'8px 0'}}>
      <div style={{opacity:.8}}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

function Select({value, onChange, options}){
  return (
    <select value={value} onChange={e=>onChange(e.target.value)}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
