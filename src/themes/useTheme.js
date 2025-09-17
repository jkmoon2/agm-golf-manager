// /src/themes/useTheme.js
// AGM Theme Manager (A,B,C,D,F,I,L,K,O) + density/contrast/dark-auto
// 기존 코드 100% 유지: body 클래스만 제어. 어느 파일에서든 import 후 훅 한 줄로 적용.
// 사용 예) useApplyTheme('admin')  // admin/player/playerOnly/global

import { useEffect } from 'react';
import './agm-themes.css';           // CSS 토큰/프리셋 자동 로드
import '../styles/theme-nav.css';    // 하단 탭바 스타일(높이 유지)

const KEY = 'agm_theme_prefs_v1';

const DEFAULT_PREFS = {
  applyMode: 'global',            // 'none' | 'global' | 'separate'
  presets: {
    global: 'A',
    admin:  'A',
    player: 'A',
    playerOnly: 'A',
  },
  density: 'default',             // 'compact' | 'default' | 'relaxed'
  contrast: 'default',            // 'low' | 'default' | 'high'
  darkAuto: false                 // prefers-color-scheme:dark 일 때 F로 자동
};

function loadPrefs(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed, presets: { ...DEFAULT_PREFS.presets, ...(parsed.presets||{}) } };
  }catch{ return { ...DEFAULT_PREFS }; }
}

function savePrefs(p){ try{ localStorage.setItem(KEY, JSON.stringify(p)); }catch{} }

function _clearThemeClasses(el){
  const all = Array.from(el.classList);
  for(const c of all){
    if(/^theme-/.test(c) || /^density-/.test(c) || /^contrast-/.test(c)) el.classList.remove(c);
  }
}

function _apply(el, { preset, density, contrast }){
  _clearThemeClasses(el);
  if (preset) el.classList.add(`theme-${preset}`);
  if (density && density!=='default') el.classList.add(`density-${density}`);
  if (contrast && contrast!=='default') el.classList.add(`contrast-${contrast}`);
}

export function setThemePrefs(next){
  const cur = loadPrefs();
  const merged = { ...cur, ...next, presets: { ...cur.presets, ...(next.presets||{}) } };
  savePrefs(merged);
  return merged;
}

export function getThemePrefs(){ return loadPrefs(); }

export function applyTheme(scope='global'){
  const prefs = loadPrefs();
  const el = document.body;
  el.setAttribute('data-agm-scope', scope);

  if(prefs.applyMode === 'none'){
    _clearThemeClasses(el);
    return;
  }

  // dark auto override
  let preset = (prefs.applyMode === 'global' ? prefs.presets.global : (prefs.presets[scope] || prefs.presets.global));
  if (prefs.darkAuto && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    preset = 'F';
  }

  _apply(el, { preset, density: prefs.density, contrast: prefs.contrast });
}

export function useApplyTheme(scope='global'){
  useEffect(() => {
    applyTheme(scope);
    const onChange = () => applyTheme(scope);
    window.addEventListener('storage', onChange);

    // 시스템 다크모드 변화 감지
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const darkListener = () => applyTheme(scope);
    if (mq && mq.addEventListener) mq.addEventListener('change', darkListener);

    return () => {
      window.removeEventListener('storage', onChange);
      if (mq && mq.removeEventListener) mq.removeEventListener('change', darkListener);
    };
  }, [scope]);
}

// Helpers for Settings screen (optional)
export function listPresets(){
  return ['A','B','C','D','F','I','L','K','O'];
}
