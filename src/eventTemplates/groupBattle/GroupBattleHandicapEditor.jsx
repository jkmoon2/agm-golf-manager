// /src/eventTemplates/groupBattle/GroupBattleHandicapEditor.jsx
// group-battle 전용: 이벤트 결과에만 반영되는 G핸디 오버라이드 편집기
// - 참가자 원본 데이터(다른 STEP)와 절대 연동하지 않음
// - 저장 위치: eventDef.params.handicapOverrides { [participantId]: number }

import React, { useEffect, useMemo, useRef, useState } from 'react';

export default function GroupBattleHandicapEditor({
  eventDef,
  participants = [],
  onClose,
  onSave,
}) {
  const open = !!eventDef;

  const baseOverrides = useMemo(() => {
    const m = eventDef?.params?.handicapOverrides;
    return (m && typeof m === 'object') ? m : {};
  }, [eventDef]);

  const list = Array.isArray(participants) ? participants : [];

  const [draft, setDraft] = useState({});

  // iOS 숫자 키패드에서 '-' 입력이 어려운 케이스가 있어,
  // STEP5/STEP7과 동일하게 롱프레스 시 음수 전환을 지원합니다.
  const pressTimersRef = useRef({});
  const LONG_PRESS_MS = 450;

  useEffect(() => {
    if (!open) return;
    setDraft({ ...baseOverrides });
  }, [open, baseOverrides]);

  const title = eventDef?.title || '이벤트';
  const metric = eventDef?.params?.metric === 'score' ? '점수' : '결과';

  const roomLabel = (p) => {
    const r = Number(p?.room);
    if (!Number.isFinite(r) || r < 1) return '미배정';
    return `${r}번방`;
  };

  const setOne = (pid, value) => {
    const id = String(pid);
    setDraft(prev => {
      const next = { ...(prev || {}) };
      if (value === '' || value == null) {
        delete next[id];
        return next;
      }
      // 입력 중간값 '-'(음수 시작)도 유지할 수 있도록 문자열 그대로 보관
      next[id] = String(value);
      return next;
    });
  };

  const startLongPress = (pid) => {
    try {
      const id = String(pid);
      const timers = pressTimersRef.current || {};
      if (timers[id]) clearTimeout(timers[id]);
      timers[id] = setTimeout(() => {
        setDraft((prev) => {
          const cur = prev && Object.prototype.hasOwnProperty.call(prev, id)
            ? (prev[id] == null ? '' : String(prev[id]))
            : '';

          // 이미 음수면 그대로
          if (String(cur).startsWith('-')) return prev;

          const nextVal = (cur === '') ? '-' : `-${String(cur).replace(/^-/, '')}`;
          return { ...(prev || {}), [id]: nextVal };
        });
      }, LONG_PRESS_MS);
      pressTimersRef.current = timers;
    } catch {
      // ignore
    }
  };

  const cancelLongPress = (pid) => {
    try {
      const id = String(pid);
      const timers = pressTimersRef.current || {};
      if (timers[id]) clearTimeout(timers[id]);
      timers[id] = null;
      pressTimersRef.current = timers;
    } catch {
      // ignore
    }
  };

  const handleSave = async () => {
    if (typeof onSave === 'function') {
      // 정리: 숫자만 남기고 나머지 제거
      const cleaned = {};
      Object.entries(draft || {}).forEach(([k, v]) => {
        const n = Number(v);
        if (Number.isFinite(n)) cleaned[String(k)] = n;
      });
      await onSave(cleaned);
    }
  };

  if (!open) return null;

  return (
    <div style={backdrop} onClick={() => (typeof onClose === 'function' ? onClose() : null)}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap: 8 }}>
          <div style={{ fontWeight: 800 }}>
            G핸디 수정 <span style={{ color:'#9aa3ad', fontWeight: 600, marginLeft: 6 }}>· {title} · 기준: {metric}</span>
          </div>
          <button type="button" style={btn} onClick={() => (typeof onClose === 'function' ? onClose() : null)}>닫기</button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color:'#666', lineHeight: 1.4 }}>
          * 여기서 수정한 G핸디는 <b>이 그룹대결 이벤트 결과</b>에만 반영됩니다.<br/>
          * 다른 STEP(참가자/방배정/스코어/결과표)의 G핸디 데이터와는 <b>절대 연동되지 않습니다.</b>
        </div>

        <div style={listWrap}>
          {list.map((p) => {
            const pid = String(p?.id ?? '');
            if (!pid) return null;

            const baseHd = Number(p?.handicap ?? 0) || 0;
            const hasKey = draft && Object.prototype.hasOwnProperty.call(draft, pid);
            const raw = hasKey ? String(draft?.[pid] ?? '') : '';
            const ovNum = Number(raw);
            const hasOverride = raw !== '' && Number.isFinite(ovNum);
            const effective = hasOverride ? ovNum : baseHd;
            const canReset = hasKey && raw !== '';

            return (
              <div key={pid} style={row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {p.nickname || '-'}
                  </div>
                  <div style={{ fontSize: 12, color:'#777', marginTop: 2 }}>
                    {roomLabel(p)} · {p.group}조 · 원본 G{baseHd}
                    {hasOverride ? <span style={{ marginLeft: 8, color:'#111' }}>→ 적용 G{effective}</span> : (canReset && raw === '-' ? <span style={{ marginLeft: 8, color:'#111' }}>→ 입력중</span> : null)}
                  </div>
                </div>

                <div style={{ width: 120, display:'flex', flexDirection:'column', gap: 6 }}>
                  <input
                    style={input}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={hasKey ? raw : ''}
                    placeholder={String(baseHd)}
                    onChange={(e) => setOne(pid, e.target.value)}
                    onTouchStart={() => startLongPress(pid)}
                    onTouchCancel={() => cancelLongPress(pid)}
                    onTouchEnd={() => cancelLongPress(pid)}
                    onPointerDown={() => startLongPress(pid)}
                    onPointerUp={() => cancelLongPress(pid)}
                    onPointerLeave={() => cancelLongPress(pid)}
                    onBlur={() => {
                      // '-'만 남아 있으면 저장 대상에서 제외
                      const v = hasKey ? String((draft || {})[pid] ?? '') : '';
                      if (v === '-') setOne(pid, '');
                    }}
                  />
                  <button
                    type="button"
                    style={{ ...btnSub, opacity: canReset ? 1 : 0.45 }}
                    onClick={() => setOne(pid, '')}
                    disabled={!canReset}
                  >
                    원복
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap: 8, marginTop: 10 }}>
          <button type="button" style={btn} onClick={() => (typeof onClose === 'function' ? onClose() : null)}>취소</button>
          <button type="button" style={btnPrimary} onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  );
}

const backdrop = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.25)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 9999,
};

const card = {
  width: '100%',
  maxWidth: 560,
  maxHeight: '85dvh',
  overflow: 'auto',
  background: '#fff',
  borderRadius: 14,
  padding: 12,
  boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
};

const listWrap = {
  marginTop: 10,
  border: '1px solid #eef2f7',
  borderRadius: 12,
  padding: 8,
  maxHeight: '55dvh',
  overflow: 'auto',
};

const row = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 6px',
  borderBottom: '1px solid #f1f5f9',
};

const input = {
  width: '100%',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '8px 10px',
  fontSize: 14,
  outline: 'none',
  background: '#fff',
};

const btn = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 13,
  cursor: 'pointer',
};

const btnSub = {
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  borderRadius: 10,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
};

const btnPrimary = {
  ...btn,
  border: '1px solid #2563eb',
  background: '#2563eb',
  color: '#fff',
  fontWeight: 700,
};
