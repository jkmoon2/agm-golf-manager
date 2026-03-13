// /src/eventTemplates/pickLineup/PickLineupSelectionMonitor.jsx
import React, { useMemo } from 'react';
import { getParticipantGroupNo, getPickLineupConfig, getPickLineupRequiredCount, normalizeMemberIds } from '../../events/pickLineup';

function roomLabel(roomNames, roomNo) {
  const idx = Number(roomNo) - 1;
  if (idx >= 0 && Array.isArray(roomNames) && roomNames[idx] && String(roomNames[idx]).trim()) {
    return String(roomNames[idx]).trim();
  }
  return Number.isFinite(Number(roomNo)) && Number(roomNo) >= 1 ? `${roomNo}번방` : '-';
}

function uniqueIds(arr = []) {
  const seen = new Set();
  const out = [];
  arr.forEach((id) => {
    const s = String(id || '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

function buildSelectionSummary(cfg, ids, byId) {
  const members = ids.map((id) => byId.get(String(id))).filter(Boolean);
  if (cfg.mode === 'jo') {
    return cfg.openGroups.map((groupNo) => {
      const found = members.find((m) => Number(getParticipantGroupNo(m)) === Number(groupNo));
      return found ? `${groupNo}조:${found.nickname}` : `${groupNo}조:-`;
    }).join(' / ');
  }
  return members.map((m) => `${m.nickname}`).join(' / ');
}

function isComplete(cfg, ids, byId) {
  const members = ids.map((id) => byId.get(String(id))).filter(Boolean);
  if (cfg.mode === 'single') {
    return members.length === cfg.pickCount;
  }
  if (members.length !== cfg.openGroups.length) return false;
  return cfg.openGroups.every((groupNo) => members.some((m) => Number(getParticipantGroupNo(m)) === Number(groupNo)));
}

export default function PickLineupSelectionMonitor({
  eventDef,
  participants = [],
  inputsByEvent = {},
  roomNames = [],
  onClose,
  onToggleLock,
}) {
  const cfg = getPickLineupConfig(eventDef);
  const requiredCount = getPickLineupRequiredCount(eventDef);
  const byId = useMemo(() => new Map((Array.isArray(participants) ? participants : []).map((p) => [String(p?.id), p])), [participants]);

  const rows = useMemo(() => {
    const list = Array.isArray(participants) ? [...participants] : [];
    list.sort((a, b) => {
      const roomDiff = Number(a?.room ?? 999) - Number(b?.room ?? 999);
      if (roomDiff) return roomDiff;
      const groupDiff = Number(getParticipantGroupNo(a) || 999) - Number(getParticipantGroupNo(b) || 999);
      if (groupDiff) return groupDiff;
      return String(a?.nickname || '').localeCompare(String(b?.nickname || ''), 'ko');
    });

    return list.map((p) => {
      const ids = uniqueIds(normalizeMemberIds(inputsByEvent?.person?.[p?.id] || {})).slice(0, requiredCount);
      const members = ids.map((id) => byId.get(String(id))).filter(Boolean);
      const handicapSum = members.reduce((sum, m) => sum + (Number(eventDef?.params?.handicapOverrides?.[String(m?.id)]) || Number(m?.handicap ?? 0) || 0), 0);
      return {
        id: String(p?.id ?? ''),
        name: String(p?.nickname || ''),
        roomLabel: roomLabel(roomNames, p?.room),
        complete: isComplete(cfg, ids, byId),
        count: members.length,
        summary: buildSelectionSummary(cfg, ids, byId),
        handicapSum,
      };
    });
  }, [participants, inputsByEvent, cfg, requiredCount, byId, eventDef?.params?.handicapOverrides, roomNames]);

  const doneCount = rows.filter((row) => row.complete).length;
  const locked = !!eventDef?.params?.selectionLocked;

  return (
    <div style={backdrop} onClick={() => (typeof onClose === 'function' ? onClose() : null)}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={headerRow}>
          <div style={{ minWidth: 0 }}>
            <div style={title}>선택 현황 / 마감</div>
            <div style={subTitle}>
              {eventDef?.title || '개인/조 선택 대결'} · {cfg.mode === 'jo' ? `조 모드 (${cfg.openGroups.map((g) => `${g}조`).join(', ')})` : `개인 모드 (${cfg.pickCount}명 선택)`}
            </div>
          </div>
          <button type="button" style={btn} onClick={() => (typeof onClose === 'function' ? onClose() : null)}>닫기</button>
        </div>

        <div style={summaryBox}>
          <div style={summaryItem}><b>{doneCount}</b> / {rows.length} 완료</div>
          <div style={summaryItem}>상태: <b style={{ color: locked ? '#dc2626' : '#2563eb' }}>{locked ? '마감' : '진행중'}</b></div>
          <button
            type="button"
            style={locked ? btnSub : btnPrimary}
            onClick={() => {
              if (typeof onToggleLock === 'function') onToggleLock(!locked);
            }}
          >
            {locked ? '재오픈' : '마감'}
          </button>
        </div>

        <div style={listWrap}>
          {rows.map((row) => (
            <div key={row.id} style={rowBox}>
              <div style={rowHead}>
                <div style={{ minWidth: 0 }}>
                  <span style={rowName}>{row.name}</span>
                  <span style={rowMeta}> ({row.roomLabel})</span>
                </div>
                <span style={row.complete ? badgeDone : badgeWait}>{row.complete ? '완료' : '대기'}</span>
              </div>
              <div style={rowBody}>
                <div style={summaryText}>{row.summary || '선택 없음'}</div>
                <div style={metaLine}>선택 {row.count}/{requiredCount} · G합 {row.handicapSum}</div>
              </div>
            </div>
          ))}
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
const headerRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 };
const title = { fontWeight: 800, fontSize: 16, color: '#183153' };
const subTitle = { marginTop: 4, fontSize: 12, color: '#667085', lineHeight: 1.45 };
const summaryBox = { marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const summaryItem = { padding: '8px 10px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13, color: '#334155' };
const listWrap = { marginTop: 12, display: 'grid', gap: 8 };
const rowBox = { border: '1px solid #eef2f7', borderRadius: 12, padding: 10, background: '#fff' };
const rowHead = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
const rowName = { fontWeight: 700, color: '#183153' };
const rowMeta = { fontSize: 12, color: '#98a2b3' };
const rowBody = { marginTop: 6, display: 'grid', gap: 4 };
const summaryText = { fontSize: 13, color: '#344054', lineHeight: 1.45, wordBreak: 'keep-all' };
const metaLine = { fontSize: 12, color: '#667085' };
const badgeBase = { display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 8px', borderRadius: 999, fontSize: 12, border: '1px solid' };
const badgeDone = { ...badgeBase, color: '#10b981', borderColor: '#a7f3d0', background: '#ecfdf5' };
const badgeWait = { ...badgeBase, color: '#6b7280', borderColor: '#d1d5db', background: '#f9fafb' };
const btn = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer' };
const btnPrimary = { ...btn, borderColor: '#2563eb', background: '#2563eb', color: '#fff', fontWeight: 700 };
const btnSub = { ...btn, borderColor: '#d1d5db', background: '#f8fafc', color: '#344054', fontWeight: 700 };
