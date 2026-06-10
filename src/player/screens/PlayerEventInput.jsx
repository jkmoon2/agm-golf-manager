// /src/player/screens/PlayerEventInput.jsx

import React, { useMemo, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import baseCss from './PlayerRoomTable.module.css';
import tCss   from './PlayerEventInput.module.css';
import { EventContext } from '../../contexts/EventContext';
import { PlayerContext } from '../../contexts/PlayerContext';
import { doc, onSnapshot, setDoc, updateDoc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { computeHoleRankForce, normalizeForcedRanks, normalizeSelectedHoles } from '../../events/holeRankForce';
import { buildLargeBingoPreview, computeBingoCount, extractBingoPersonInput, getBingoGridSize, getBingoHoleValues, getBingoMarkType, getNextBingoHole, normalizeBingoBoard, normalizeBingoBoardCellCount, normalizeBingoLargeOrder, normalizeBingoScoreHoleCount, normalizeBingoSelectedHoles, normalizeBingoSpecialZones } from '../../events/bingo';
import { getParticipantGroupNo, getPickLineupConfig, getPickLineupRequiredCount, normalizeMemberIds } from '../../events/pickLineup';
import useEffectivePlayerEventData from '../hooks/useEffectivePlayerEventData';
import { computeGroupRoomHoleBattle, countParticipantUsageForRow, getBattleCellIds, getBattleSharedInputs, getGroupRoomBattleScoreParticipants, getGroupRoomHoleBattleInputRows, getGroupRoomHoleBattleRows, normalizeGroupRoomHoleBattleParams } from '../../events/groupRoomHoleBattle';
import { getRankScoreGroupSide, getRankScorePairGroupLabel, normalizeRankScoreGameParams, normalizeRankScorePairs } from '../../events/rankScoreGame';
import { computeHiddenEvent, getHiddenHandicapAdjustment, getHiddenOpponentId, normalizeHiddenEventParams, normalizeHiddenFourballPairs } from '../../events/hiddenEvent';
import { diagMerge, diagPush } from '../../utils/agmDiag';


function getPlayerTabId(){
  try {
    if (!window.name || !window.name.startsWith('AGM_PLAYER_TAB_')) {
      window.name = `AGM_PLAYER_TAB_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    }
    return window.name;
  } catch {
    return 'AGM_PLAYER_TAB_FALLBACK';
  }
}
function playerStorageKey(eventId, key){
  return `agm:player:${getPlayerTabId()}:${eventId || 'noevent'}:${key}`;
}
function readPlayerScopedJson(eventId, key, fallback = null){
  try {
    const raw = localStorage.getItem(playerStorageKey(eventId, key));
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writePlayerScopedJson(eventId, key, value){
  try {
    localStorage.setItem(playerStorageKey(eventId, key), JSON.stringify(value));
  } catch {}
}
function removePlayerScoped(eventId, key){
  try {
    localStorage.removeItem(playerStorageKey(eventId, key));
  } catch {}
}
function hasMeaningfulEventInputsRoot(root){
  if (!root || typeof root !== 'object') return false;
  return Object.values(root).some((slot) => {
    if (!slot || typeof slot !== 'object') return false;
    if (slot.shared && typeof slot.shared === 'object' && Object.keys(slot.shared).length) return true;
    const person = slot.person && typeof slot.person === 'object' ? slot.person : {};
    return Object.values(person).some((val) => {
      if (val == null || val === '') return false;
      if (typeof val !== 'object') return String(val).trim() !== '';
      if (Array.isArray(val.values) && val.values.some((x) => String(x ?? '').trim() !== '')) return true;
      if (Array.isArray(val.board) && val.board.some((x) => String(x ?? '').trim() !== '')) return true;
      if (Array.isArray(val.memberIds) && val.memberIds.some(Boolean)) return true;
      if (val.roomShared) return true;
      return Object.keys(val).length > 0;
    });
  });
}
function filterCachedEventInputsByResetTokens(inputs, cachedTokens, liveTokens){
  const srcInputs = (inputs && typeof inputs === 'object') ? inputs : {};
  const srcCachedTokens = (cachedTokens && typeof cachedTokens === 'object') ? cachedTokens : {};
  const srcLiveTokens = (liveTokens && typeof liveTokens === 'object') ? liveTokens : {};
  const out = {};
  Object.entries(srcInputs).forEach(([evId, slot]) => {
    if (String(srcCachedTokens?.[evId] || '') !== String(srcLiveTokens?.[evId] || '')) return;
    out[evId] = slot;
  });
  return out;
}

const LONG_PRESS_MS = 450;
const BINGO_MODE_BUTTON_FONT_SIZE = 16;
const BINGO_COUNT_NUMBER_FONT_SIZE = 24;
const BINGO_COUNT_LABEL_FONT_SIZE = 14;
const BINGO_PREVIEW_NAME_FONT_SIZE = 20;
const BINGO_PREVIEW_CELL_NUMBER_FONT_SIZE = 24;
const BINGO_PREVIEW_CELL_EMPTY_FONT_SIZE = 18;
const BINGO_COMMON_REQUIRED_PRESS_COUNT = 3;
const BINGO_COMMON_PRESS_WINDOW_MS = 5000;

const FORCED_PREVIEW_LAYOUT = 'balanced'; // 'tight' | 'balanced' | 'roomy'

function getForcedPreviewPresetClass(styles){
  if (FORCED_PREVIEW_LAYOUT === 'tight') return styles.viewerPresetTight;
  if (FORCED_PREVIEW_LAYOUT === 'roomy') return styles.viewerPresetRoomy;
  return styles.viewerPresetBalanced;
}


function formatDisplayNumber(value){
  if (value === '' || value == null) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const s = n.toFixed(2);
  if (s.endsWith('.00')) return s.slice(0, -3);
  if (s.endsWith('0')) return s.slice(0, -1);
  return s;
}

function makeEmptyBingoBoard(cellCount = 16){
  const count = normalizeBingoBoardCellCount(cellCount);
  return Array.from({ length: count }, () => '');
}

function shuffleArray(arr = []) {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
  }
  return next;
}

function getBingoBoardNextState(board, selectedHoles, cellIndex, moveIndex, boardCellCount = 16) {
  const safeBoard = normalizeBingoBoard(board, selectedHoles, boardCellCount);
  if (Number.isInteger(moveIndex) && moveIndex >= 0 && moveIndex < safeBoard.length) {
    if (moveIndex === cellIndex) return safeBoard;
    const next = [...safeBoard];
    const fromVal = next[moveIndex];
    const toVal = next[cellIndex];
    if (fromVal === '' || fromVal == null) return next;
    if (toVal === '' || toVal == null) {
      next[cellIndex] = fromVal;
      next[moveIndex] = '';
    } else {
      next[cellIndex] = fromVal;
      next[moveIndex] = toVal;
    }
    return next;
  }
  if (safeBoard[cellIndex]) return safeBoard;
  const nextHole = getNextBingoHole(safeBoard, selectedHoles, boardCellCount);
  if (!nextHole) return safeBoard;
  const next = [...safeBoard];
  next[cellIndex] = nextHole;
  return next;
}

function isBingoSpecialZone(index1, specialZones = []) {
  return normalizeBingoSpecialZones(specialZones).includes(Number(index1));
}

function BingoPreviewCell({ holeNo, markType, muted = false, specialZone = false }) {
  const color = '#2457d6';
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1 / 1',
        borderRadius: 10,
        border: '1px solid #d6dde8',
        background: specialZone ? '#fff3a6' : '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {markType === 'circle' && (
        <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 4, width: 'calc(100% - 8px)', height: 'calc(100% - 8px)' }} aria-hidden="true">
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="7" />
        </svg>
      )}
      {markType === 'heart' && (
        <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 4, width: 'calc(100% - 8px)', height: 'calc(100% - 8px)' }} aria-hidden="true">
          <path
            d="M50 84C50 84 21 66 11 47C2 31 6 13 23 10C33 8 43 12 50 22C57 12 67 8 77 10C94 13 98 31 89 47C79 66 50 84 50 84Z"
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <span style={{ position: 'relative', zIndex: 2, fontSize: holeNo ? BINGO_PREVIEW_CELL_NUMBER_FONT_SIZE : BINGO_PREVIEW_CELL_EMPTY_FONT_SIZE, fontWeight: 800, color: '#16376c', lineHeight: 1 }}>{holeNo || ''}</span>
    </div>
  );
}

function BingoPreviewCard({ name, bingoCount, board, holeValues, specialZones = [] }) {
  const cells = Array.isArray(board) ? board : makeEmptyBingoBoard();
  const gridSize = cells.length === 9 ? 3 : 4;
  return (
    <div style={{ border: '2px solid #4a8cff', borderRadius: 16, background: '#fff', padding: 12, width: '100%', boxSizing: 'border-box', boxShadow: '0 0 0 3px rgba(74,140,255,.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: BINGO_PREVIEW_NAME_FONT_SIZE, fontWeight: 900, color: '#16376c' }}>{name || ''}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, color: '#d11a2a', lineHeight: 1 }}>
          <span style={{ fontSize: BINGO_COUNT_NUMBER_FONT_SIZE, fontWeight: 900 }}>{Number(bingoCount || 0)}</span>
          <span style={{ fontSize: BINGO_COUNT_LABEL_FONT_SIZE, fontWeight: 400 }}>빙고</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`, gap: 8 }}>
        {cells.map((holeNo, idx) => (
          <BingoPreviewCell
            key={`${name || 'preview'}-${idx}`}
            holeNo={holeNo}
            markType={holeNo ? getBingoMarkType(holeValues?.[holeNo]) : ''}
            muted={!holeNo}
            specialZone={isBingoSpecialZone(idx + 1, specialZones)}
          />
        ))}
      </div>
    </div>
  );
}


function LargeBingoPreviewCard({ total, cells = [] }) {
  const safeCells = Array.isArray(cells) ? cells : [];
  return (
    <div style={{ border: '2px solid #7c3aed', borderRadius: 16, background: '#fff', padding: 12, width: '100%', boxSizing: 'border-box', boxShadow: '0 0 0 3px rgba(124,58,237,.10)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 17, fontWeight: 900, color: '#16376c' }}>Big빙고판</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, color: '#7c2d12', lineHeight: 1 }}>
          <span style={{ fontSize: BINGO_COUNT_NUMBER_FONT_SIZE, fontWeight: 900 }}>{Number(total || 0)}</span>
          <span style={{ fontSize: BINGO_COUNT_LABEL_FONT_SIZE, fontWeight: 400 }}>빙고</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 4 }}>
        {safeCells.map((cell, idx) => {
          const rowNo = Math.floor(idx / 6);
          const colNo = idx % 6;
          const crossStyle = {
            boxShadow: [
              colNo === 2 ? 'inset -3px 0 0 rgba(124,58,237,.28)' : '',
              colNo === 3 ? 'inset 3px 0 0 rgba(124,58,237,.28)' : '',
              rowNo === 2 ? 'inset 0 -3px 0 rgba(124,58,237,.28)' : '',
              rowNo === 3 ? 'inset 0 3px 0 rgba(124,58,237,.28)' : '',
            ].filter(Boolean).join(', '),
          };
          return (
          <div key={`large-bingo-cell-${idx}`} style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 7, border: '1px solid #d6dde8', background: cell?.specialZone ? '#fff3a6' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...crossStyle }}>
            {cell?.mark === 'circle' && (
              <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 2, width: 'calc(100% - 4px)', height: 'calc(100% - 4px)' }} aria-hidden="true">
                <circle cx="50" cy="50" r="39" fill="none" stroke="#2457d6" strokeWidth="7" />
              </svg>
            )}
            {cell?.mark === 'heart' && (
              <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 2, width: 'calc(100% - 4px)', height: 'calc(100% - 4px)' }} aria-hidden="true">
                <path d="M50 84C50 84 21 66 11 47C2 31 6 13 23 10C33 8 43 12 50 22C57 12 67 8 77 10C94 13 98 31 89 47C79 66 50 84 50 84Z" fill="none" stroke="#2457d6" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <span style={{ position: 'relative', zIndex: 2, fontSize: 13, fontWeight: 900, color: '#16376c', lineHeight: 1 }}>{cell?.holeNo || ''}</span>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function displayPickOption(p){
  return String(p?.nickname || '');
}

function splitRankScorePairLabel(label){
  const text = String(label || '');
  const m = text.match(/^(A그룹|B그룹)\s*(.*)$/);
  if (!m) return { title: text, groups: '' };
  return { title: m[1], groups: m[2] || '' };
}


const PICK_MENU_WIDTH_PX = 136;

function getPickMenuWidthPx(){
  return PICK_MENU_WIDTH_PX;
}

function getPickPreviewLineText(cells = []){
  return (Array.isArray(cells) ? cells : []).map((v) => String(v || '').trim()).filter(Boolean).join(' / ');
}

function getPickPreviewLineClass(styles, text = '', isJo = false){
  const len = String(text || '').length;
  if (len >= (isJo ? 25 : 28)) return styles.pickPreviewTeamXs;
  if (len >= (isJo ? 18 : 22)) return styles.pickPreviewTeamSm;
  return styles.pickPreviewTeamMd;
}


function getGroupRoomCellText(ids = [], byId = new Map()){
  const names = (Array.isArray(ids) ? ids : []).map((id) => byId.get(String(id))?.nickname || '').filter(Boolean);
  return names.length ? names.join(' / ') : '선택';
}

function getGroupRoomMenuWidthPx(){
  return getPickMenuWidthPx();
}

function getEffectiveParticipants(eventData){
  const safeArr = (v) => (Array.isArray(v) ? v : []);
  const mode = (eventData?.mode === 'fourball' || eventData?.mode === 'agm') ? 'fourball' : 'stroke';
  const field = (mode === 'fourball') ? 'participantsFourball' : 'participantsStroke';
  const primary = safeArr(eventData?.[field]);
  const legacy = safeArr(eventData?.participants);
  if (!primary.length) {
    return legacy.map((p, i) => {
      const obj = (p && typeof p === 'object') ? p : {};
      const room = (obj?.room ?? obj?.roomNumber ?? null);
      return { ...obj, id: obj?.id ?? i, room, roomNumber: room };
    });
  }
  const map = new Map();
  legacy.forEach((p, i) => {
    const obj = (p && typeof p === 'object') ? p : {};
    const id = String(obj?.id ?? i);
    map.set(id, { ...(map.get(id) || {}), ...obj });
  });
  primary.forEach((p, i) => {
    const obj = (p && typeof p === 'object') ? p : {};
    const id = String(obj?.id ?? i);
    map.set(id, { ...(map.get(id) || {}), ...obj });
  });
  return Array.from(map.values()).map((p, i) => {
    const obj = (p && typeof p === 'object') ? p : {};
    const room = (obj?.room ?? obj?.roomNumber ?? null);
    return { ...obj, id: obj?.id ?? i, room, roomNumber: room };
  });
}

function normalizeGate(raw){
  if (!raw || typeof raw !== 'object') return { steps:{}, step1:{ teamConfirmEnabled:true } };
  const g = { ...raw };
  const steps = g.steps || {};
  const out = { steps:{}, step1:{ ...(g.step1 || {}) } };
  for (let i=1;i<=8;i+=1) out.steps[i] = steps[i] || 'enabled';
  if (typeof out.step1.teamConfirmEnabled !== 'boolean') out.step1.teamConfirmEnabled = true;
  return out;
}
function pickGateByMode(playerGate, mode){
  const isFour = (mode === 'fourball' || mode === 'agm');
  const nested = isFour ? playerGate?.fourball : playerGate?.stroke;
  const base = nested && typeof nested === 'object' ? nested : playerGate;
  return normalizeGate(base);
}
function tsToMillis(ts){
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1e6;
  return Number(ts) || 0;
}

function readRoomFromLocal(eventId){
  try {
    const v = localStorage.getItem(playerStorageKey(eventId, 'currentRoom'));
    const n = Number(v);
    if (Number.isFinite(n) && n >= 1) return n;
  } catch {}
  return NaN;
}

const MAX_PER_ROOM = 4;

function orderSlotsByPairs(roomArr = [], allParticipants = []) {
  const N    = Array.isArray(allParticipants) ? allParticipants.length : 0;
  const half = Math.floor(N / 2) || 0;
  const asNum = (v) => Number(v ?? NaN);

  const slot = [null, null, null, null];
  const used = new Set();

  const pairs = [];
  roomArr
    .filter((p) => Number.isFinite(asNum(p?.id)) && asNum(p.id) < half)
    .forEach((p1) => {
      const id1 = asNum(p1.id);
      if (used.has(id1)) return;
      const partner = roomArr.find(
        (x) => Number.isFinite(asNum(x?.id)) && asNum(x.id) === asNum(p1.partner)
      );
      if (partner && !used.has(asNum(partner.id))) {
        pairs.push([p1, partner]);
        used.add(id1); used.add(asNum(partner.id));
      }
    });

  pairs.forEach((pair, idx) => {
    if (idx === 0) { slot[0] = pair[0]; slot[1] = pair[1]; }
    else if (idx === 1) { slot[2] = pair[0]; slot[3] = pair[1]; }
  });

  roomArr.forEach((p) => {
    const pid = asNum(p?.id);
    if (!used.has(pid)) {
      const empty = slot.findIndex((x) => x === null);
      if (empty >= 0) { slot[empty] = p; used.add(pid); }
    }
  });

  while (slot.length < MAX_PER_ROOM) slot.push(null);
  return slot.slice(0, MAX_PER_ROOM);
}

function inferRoomFromSelf(participants = [], eventData = {}, opt = {}) {
  const hintId = String(opt?.participant?.id ?? opt?.participant?.uid ?? '').trim();
  const hintNick = String(opt?.participant?.nickname ?? '').trim().toLowerCase();
  const ids = [
    hintId,
    eventData?.auth?.uid, eventData?.player?.uid, eventData?.me?.uid,
    eventData?.auth?.id,  eventData?.player?.id,  eventData?.me?.id,
  ].filter(Boolean).map((v) => String(v));

  for (const p of participants) {
    const pid = String(p?.id ?? '');
    const puid = String(p?.uid ?? '');
    if ((pid && ids.includes(pid)) || (puid && ids.includes(puid))) {
      const r = Number(p?.room);
      if (Number.isFinite(r) && r >= 1) return r;
    }
  }

  const myNick = (hintNick || eventData?.auth?.nickname || eventData?.player?.nickname || eventData?.me?.nickname || '').trim().toLowerCase();
  if (myNick) {
    for (const p of participants) {
      const pn = String(p?.nickname || '').trim().toLowerCase();
      if (pn && pn === myNick) {
        const r = Number(p?.room);
        if (Number.isFinite(r) && r >= 1) return r;
      }
    }
  }

  return NaN;
}

function readStoredPlayerHints(eventId) {
  const ids = new Set();
  const nicks = new Set();
  const pushId = (v) => {
    const s = String(v || '').trim();
    if (s) ids.add(s);
  };
  const pushNick = (v) => {
    const s = String(v || '').trim().toLowerCase();
    if (s) nicks.add(s);
  };
  const readJson = (raw) => {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };
  const readParticipant = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    pushId(obj.id);
    pushId(obj.uid);
    pushNick(obj.nickname);
  };
  try {
    if (eventId) {
      readParticipant(readJson(sessionStorage.getItem(`participant_${eventId}`)));
      readParticipant(readJson(localStorage.getItem(playerStorageKey(eventId, 'participant'))));
      readParticipant(readJson(localStorage.getItem(`participant:${eventId}`)));
      pushId(localStorage.getItem(playerStorageKey(eventId, 'myId')));
      pushNick(localStorage.getItem(playerStorageKey(eventId, 'nickname')));
    }
  } catch {}
  try {
    pushId(auth?.currentUser?.uid);
    pushNick(auth?.currentUser?.displayName);
  } catch {}
  return { ids: Array.from(ids), nicks: Array.from(nicks) };
}

function inferSelfParticipant(participants = [], eventData = {}, roomNo = NaN, eventId = '', opt = {}) {
  const storedHints = readStoredPlayerHints(eventId);
  const hintId = String(opt?.participant?.id ?? opt?.participant?.uid ?? '').trim();
  const hintNick = String(opt?.participant?.nickname ?? '').trim().toLowerCase();
  const ids = [
    hintId,
    eventData?.auth?.uid, eventData?.player?.uid, eventData?.me?.uid,
    eventData?.auth?.id, eventData?.player?.id, eventData?.me?.id,
    ...storedHints.ids,
  ].filter(Boolean).map((v) => String(v));

  const inSameRoom = (participant) => {
    const room = Number(participant?.room);
    return !Number.isFinite(Number(roomNo)) || !Number.isFinite(room) || room < 1 || room === Number(roomNo);
  };

  for (const participant of Array.isArray(participants) ? participants : []) {
    const pid = String(participant?.id ?? '');
    const puid = String(participant?.uid ?? '');
    if ((pid && ids.includes(pid)) || (puid && ids.includes(puid))) {
      if (inSameRoom(participant)) return participant;
    }
  }

  const myNickCandidates = [hintNick, eventData?.auth?.nickname, eventData?.player?.nickname, eventData?.me?.nickname, ...storedHints.nicks].filter(Boolean);
  const myNick = String(myNickCandidates[0] || '').trim().toLowerCase();
  if (myNick) {
    for (const participant of Array.isArray(participants) ? participants : []) {
      const nick = String(participant?.nickname || '').trim().toLowerCase();
      if (nick && nick === myNick && inSameRoom(participant)) return participant;
    }
  }

  return null;
}

async function ensureMembership(eventId, myRoom) {
  try {
    const uid = auth?.currentUser?.uid || null;
    if (!uid || !eventId || !myRoom) return;
    const rootRef = doc(db, 'events', eventId);
    const rootSnap = await getDoc(rootRef);
    if (!rootSnap.exists()) return;
    const ref = doc(db, 'events', eventId, 'memberships', uid);
    await setDoc(ref, { room: myRoom }, { merge: true });
  } catch (e) {
    console.warn('ensureMembership failed', e);
  }
}

export default function PlayerEventInput(){
  const nav = useNavigate();
  const { eventId } = useParams();
  const { eventId: ctxId, loadEvent, eventData, updateEventImmediate } = useContext(EventContext) || {};
  const { participant: ctxParticipant, participants: ctxParticipants } = useContext(PlayerContext) || {};
  const effectiveEventData = useEffectivePlayerEventData();

  const [fallbackGate, setFallbackGate] = useState(null);
  const [fallbackAt, setFallbackAt] = useState(0);
  const [pickMenuState, setPickMenuState] = useState(null);
  const [battleMenuState, setBattleMenuState] = useState(null);
  const [battlePreviewExpandedMap, setBattlePreviewExpandedMap] = useState({});
  const [hiddenSelectFocusId, setHiddenSelectFocusId] = useState('');
  const pickButtonRefs = useRef({});
  const pickMenuGestureRef = useRef({ dragging:false, startY:0, lastMoveAt:0 });

  const beginPickMenuGesture = (evt) => {
    const touch = evt?.touches?.[0] || evt?.changedTouches?.[0] || null;
    if (!touch) {
      pickMenuGestureRef.current = { dragging:false, startY:0, lastMoveAt:0 };
      return;
    }
    const y = Number(touch?.clientY ?? 0);
    pickMenuGestureRef.current = { dragging:false, startY:y, lastMoveAt:0 };
  };
  const movePickMenuGesture = (evt) => {
    const touch = evt?.touches?.[0] || evt?.changedTouches?.[0] || null;
    if (!touch) return;
    const y = Number(touch?.clientY ?? 0);
    const state = pickMenuGestureRef.current || {};
    if (Math.abs(y - Number(state.startY || 0)) > 4) {
      pickMenuGestureRef.current = { ...state, dragging:true, lastMoveAt: Date.now() };
    }
  };
  const finishPickMenuGesture = () => {
    const state = pickMenuGestureRef.current || {};
    if (!state.dragging) {
      pickMenuGestureRef.current = { dragging:false, startY:0, lastMoveAt:0 };
      return;
    }
    const stamp = Date.now();
    pickMenuGestureRef.current = { ...state, lastMoveAt: stamp };
    window.setTimeout(() => {
      const latest = pickMenuGestureRef.current || {};
      if (Number(latest.lastMoveAt || 0) === stamp) {
        pickMenuGestureRef.current = { dragging:false, startY:0, lastMoveAt:0 };
      }
    }, 180);
  };
  const shouldIgnorePickMenuClick = () => {
    const state = pickMenuGestureRef.current || {};
    const recentMove = Number(state.lastMoveAt || 0);
    return !!state.dragging || (recentMove > 0 && (Date.now() - recentMove) < 180);
  };
  useEffect(() => {
    const id = eventId || ctxId;
    if (!id) return;
    const ref = doc(db, 'events', id);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      if (d?.playerGate) {
        setFallbackGate(d.playerGate);
        setFallbackAt(tsToMillis(d?.gateUpdatedAt));
      }
    });
    return unsub;
  }, [eventId, ctxId]);

  const latestGate = useMemo(() => {
    const mode = (effectiveEventData?.mode === 'fourball' ? 'fourball' : 'stroke');
    const ctxG = pickGateByMode(effectiveEventData?.playerGate || {}, mode);
    const ctxAt = tsToMillis(effectiveEventData?.gateUpdatedAt);
    const fbG  = pickGateByMode(fallbackGate || {}, mode);
    const fbAt = fallbackAt;
    return (ctxAt >= fbAt) ? ctxG : fbG;
  }, [effectiveEventData?.playerGate, effectiveEventData?.gateUpdatedAt, effectiveEventData?.mode, fallbackGate, fallbackAt]);

  const nextDisabled = useMemo(() => (latestGate?.steps?.[4] !== 'enabled'), [latestGate]);

  useEffect(() => {
    if (!pickMenuState && !battleMenuState) return undefined;
    const closeMenu = () => { setPickMenuState(null); setBattleMenuState(null); };
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.overscrollBehavior = 'contain';
    window.addEventListener('resize', closeMenu);
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      document.body.style.overscrollBehavior = prevOverscroll;
      window.removeEventListener('resize', closeMenu);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pickMenuState, battleMenuState]);

  useEffect(()=>{ if(eventId && eventId!==ctxId && typeof loadEvent==='function'){ loadEvent(eventId); } },[eventId,ctxId,loadEvent]);

  const participants = useMemo(() => {
    const fromEvent = getEffectiveParticipants(effectiveEventData);
    if (Array.isArray(fromEvent) && fromEvent.length) return fromEvent;
    return Array.isArray(ctxParticipants) ? ctxParticipants : [];
  }, [effectiveEventData?.mode, effectiveEventData?.participants, effectiveEventData?.participantsStroke, effectiveEventData?.participantsFourball, ctxParticipants]);
  const events = useMemo(
    () => Array.isArray(effectiveEventData?.events) ? effectiveEventData.events.filter(e => e?.enabled !== false && e?.template !== 'group-battle') : [],
    [effectiveEventData?.events]
  );

  const roomNames = useMemo(() => {
    if (Array.isArray(effectiveEventData?.roomNames) && effectiveEventData.roomNames.length) {
      return effectiveEventData.roomNames.map(v => String(v ?? ''));
    }
    const cnt = Number(effectiveEventData?.roomCount || 0);
    return Number.isFinite(cnt) && cnt > 0
      ? Array.from({ length: cnt }, (_, i) => `${i + 1}번방`)
      : [];
  }, [effectiveEventData?.roomNames, effectiveEventData?.roomCount]);

  const allRoomNos = useMemo(() => {
    const s = new Set();
    participants.forEach(p => { const r = Number(p?.room); if (Number.isFinite(r) && r >= 1) s.add(r); });
    return Array.from(s).sort((a,b)=>a-b);
  }, [participants]);

  const roomFromCtx = useMemo(() => {
    const cands = [ effectiveEventData?.myRoom, effectiveEventData?.player?.room, effectiveEventData?.auth?.room, effectiveEventData?.currentRoom ];
    return cands.map(Number).find(n => Number.isFinite(n) && n >= 1);
  }, [effectiveEventData?.myRoom, effectiveEventData?.player?.room, effectiveEventData?.auth?.room, effectiveEventData?.currentRoom]);

  const roomFromSelf = useMemo(
    () => inferRoomFromSelf(participants, effectiveEventData, { participant: ctxParticipant }),
    [participants, effectiveEventData, ctxParticipant]
  );

  const roomFromParticipantCtx = useMemo(() => {
    const pid = String(ctxParticipant?.id ?? ctxParticipant?.uid ?? '').trim();
    const pnick = String(ctxParticipant?.nickname ?? '').trim().toLowerCase();
    const match = participants.find((p) => (pid && (String(p?.id ?? '') === pid || String(p?.uid ?? '') === pid)) || (pnick && String(p?.nickname || '').trim().toLowerCase() === pnick));
    const n = Number(match?.room ?? match?.roomNumber);
    return Number.isFinite(n) && n >= 1 ? n : NaN;
  }, [ctxParticipant, participants]);

  const roomIdx = useMemo(() => {
    const ls = readRoomFromLocal(eventId);
    const resolved = [roomFromParticipantCtx, roomFromCtx, roomFromSelf].find(
      (n) => Number.isFinite(n) && allRoomNos.includes(n)
    );
    if (Number.isFinite(resolved)) return resolved;
    const hasCurrentIdentity = !!String(ctxParticipant?.id ?? ctxParticipant?.nickname ?? '').trim();
    if (hasCurrentIdentity) return NaN;
    if (Number.isFinite(ls) && allRoomNos.includes(ls)) return ls;
    return allRoomNos[0] || 1;
  }, [roomFromParticipantCtx, roomFromCtx, roomFromSelf, eventId, allRoomNos, ctxParticipant]);

  const selfParticipant = useMemo(
    () => inferSelfParticipant(participants, effectiveEventData, roomIdx, eventId || ctxId, { participant: ctxParticipant }),
    [participants, effectiveEventData, roomIdx, eventId, ctxId, ctxParticipant]
  );
  const selfParticipantId = useMemo(() => String(selfParticipant?.id || ''), [selfParticipant]);
  const selfParticipantNickname = useMemo(() => String(selfParticipant?.nickname || '').trim().toLowerCase(), [selfParticipant]);

  useEffect(() => {
    if (Number.isFinite(roomIdx) && roomIdx >= 1 && selfParticipant && Number(selfParticipant?.room ?? selfParticipant?.roomNumber) === Number(roomIdx)) {
      try { localStorage.setItem(playerStorageKey(eventId, 'currentRoom'), String(roomIdx)); } catch {}
      try { sessionStorage.setItem(`player.currentRoom:${eventId}`, String(roomIdx)); } catch {}
      try { localStorage.setItem(`player.currentRoom:${eventId}`, String(roomIdx)); } catch {}
    }
  }, [roomIdx, eventId, selfParticipant]);

  const openPickMenuAt = (evId, pid, idx, options = [], buttonEl = null, menuPayload = {}) => {
    const rect = buttonEl?.getBoundingClientRect?.();
    const menuWidth = getPickMenuWidthPx(options);
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 640;
    const estimatedHeight = Math.min(Math.max((Array.isArray(options) ? options.length : 0) + 1, 4) * 40 + 16, Math.min(viewportHeight * 0.52, 320));
    const left = rect
      ? Math.max(8, Math.min(rect.left + (rect.width / 2) - (menuWidth / 2), viewportWidth - menuWidth - 8))
      : 12;
    let top = 56;
    if (rect) {
      const belowTop = rect.bottom + 6;
      const belowSpace = viewportHeight - belowTop - 8;
      if (belowSpace >= Math.min(estimatedHeight, 180)) {
        top = belowTop;
      } else {
        top = Math.max(8, rect.top - estimatedHeight - 6);
      }
    }

    // pick-lineup 메뉴는 Portal에서 다시 렌더링됩니다.
    // 새로 만든 이벤트는 Firestore 스냅샷/참가자 목록이 재정렬되는 순간 Portal이 먼저 렌더될 수 있으므로,
    // 클릭 당시의 이벤트/선택자/옵션을 같이 보관하여 메뉴가 null 처리되지 않게 합니다.
    setPickMenuState({
      evId: String(evId ?? ''),
      pid: String(pid ?? ''),
      idx,
      left,
      top,
      width: menuWidth,
      eventSnapshot: menuPayload?.eventSnapshot || null,
      selectorSnapshot: menuPayload?.selectorSnapshot || null,
      optionsSnapshot: Array.isArray(options) ? options : [],
    });
  };

  const openBattleMenuAt = (evId, rowKey, holeNo, options = [], buttonEl = null, menuOpt = {}) => {
    const rect = buttonEl?.getBoundingClientRect?.();
    const menuWidth = getGroupRoomMenuWidthPx();
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 640;
    const extraRows = menuOpt?.viewOnly ? 1 : 2;
    const estimatedHeight = Math.min(Math.max((Array.isArray(options) ? options.length : 0) + extraRows, 5) * 40 + 16, Math.min(viewportHeight * 0.56, 360));
    const left = rect
      ? Math.max(8, Math.min(rect.left + (rect.width / 2) - (menuWidth / 2), viewportWidth - menuWidth - 8))
      : 12;
    let top = 56;
    if (rect) {
      const belowTop = rect.bottom + 6;
      const belowSpace = viewportHeight - belowTop - 8;
      if (belowSpace >= Math.min(estimatedHeight, 180)) {
        top = belowTop;
      } else {
        top = Math.max(8, rect.top - estimatedHeight - 6);
      }
    }
    setBattleMenuState({ evId, rowKey, holeNo, left, top, width: menuWidth, viewOnly: !!menuOpt?.viewOnly });
  };

  const roomMembers = useMemo(() => {
    const inRoom = participants.filter(p => Number(p?.room) === roomIdx);
    return orderSlotsByPairs(inRoom, participants);
  }, [participants, roomIdx]);

  const activeEventStorageId = eventId || ctxId || '';
  const rawInputsByEventServer = (eventData?.eventInputs && typeof eventData.eventInputs === 'object') ? eventData.eventInputs : {};
  const liveEventInputResetTokens = (eventData?.eventInputResets && typeof eventData.eventInputResets === 'object') ? eventData.eventInputResets : {};
  const eventSnapshotReady = !!eventData;
  const [serverInputsCachePack, setServerInputsCachePack] = useState(() => (
    readPlayerScopedJson(activeEventStorageId, 'eventInputsServerCachePack', { inputs: {}, resetTokens: {} }) || { inputs: {}, resetTokens: {} }
  ));
  const cachedInputsByEventServer = useMemo(() => {
    const cachedInputs = (serverInputsCachePack?.inputs && typeof serverInputsCachePack.inputs === 'object') ? serverInputsCachePack.inputs : {};
    if (!eventSnapshotReady) return cachedInputs;
    return filterCachedEventInputsByResetTokens(cachedInputs, serverInputsCachePack?.resetTokens, liveEventInputResetTokens);
  }, [serverInputsCachePack, liveEventInputResetTokens, eventSnapshotReady]);
  const inputsByEventServer = useMemo(
    () => (hasMeaningfulEventInputsRoot(rawInputsByEventServer) ? rawInputsByEventServer : cachedInputsByEventServer),
    [rawInputsByEventServer, cachedInputsByEventServer]
  );

  const [draft, setDraft] = useState(() => {
    // 서버/서버캐시 값을 먼저 사용하고, 서버값이 전혀 없을 때만 로컬 draft를 복원합니다.
    // 빙고처럼 방 대표가 여러 명 점수를 입력하는 이벤트에서 오래된 로컬 draft가
    // 서버 최신 점수를 가리는 문제를 막기 위한 최소 보완입니다.
    if (hasMeaningfulEventInputsRoot(inputsByEventServer)) {
      try { return JSON.parse(JSON.stringify(inputsByEventServer)); } catch { return inputsByEventServer; }
    }
    const cachedDraft = readPlayerScopedJson(activeEventStorageId, 'eventInputsDraftCache', {});
    if (hasMeaningfulEventInputsRoot(cachedDraft)) {
      try { return JSON.parse(JSON.stringify(cachedDraft)); } catch { return cachedDraft; }
    }
    return inputsByEventServer ? JSON.parse(JSON.stringify(inputsByEventServer)) : {};
  });
  const [dirty, setDirty] = useState(false);
  const eventInputRefs = useRef({});
  const longPressTimersRef = useRef({});
  const [bingoUiState, setBingoUiState] = useState({});
  const [bingoCommonPressState, setBingoCommonPressState] = useState({});
  const bingoLongPressTimersRef = useRef({});
  const bingoLongPressDoneRef = useRef({});
  const bingoCommonPressTimersRef = useRef({});
  const bingoBoardDraftRef = useRef({});
  // 빙고 점수/빙고판은 여러 참가자가 같은 방 데이터를 같이 저장할 수 있으므로
  // 실제로 수정한 칸/판만 서버 최신값 위에 병합합니다.
  const bingoTouchedCellsRef = useRef({});
  const bingoTouchedBoardsRef = useRef({});
  const bingoTouchedSharedRef = useRef({});
  const pendingSavedInputsSigRef = useRef('');
  const draftTouchedRef = useRef(false);
  const lastHydratedServerSigRef = useRef('');
  const resetTokenRef = useRef({});
  const resetTokensReadyRef = useRef(false);
  const resetTokensEventIdRef = useRef(activeEventStorageId || '');

  const focusEventInput = (evId, pid, idx) => {
    try {
      const key = `${evId}:${pid}:${idx}`;
      const el = eventInputRefs.current?.[key];
      if (el && typeof el.focus === 'function') el.focus();
    } catch {}
  };

  const cancelEventLongPress = (key) => {
    const timer = longPressTimersRef.current?.[key];
    if (timer) clearTimeout(timer);
    if (longPressTimersRef.current) delete longPressTimersRef.current[key];
  };

  const startEventLongMinus = (evId, pid, idx, rawValue, attemptsOverride) => {
    const key = `${evId}:${pid}:${idx}`;
    cancelEventLongPress(key);
    longPressTimersRef.current[key] = setTimeout(() => {
      const current = String(rawValue ?? '').trim();
      const next = current === '' ? '-' : (current.startsWith('-') ? current : `-${current}`);
      patchAccum(evId, pid, idx, next, attemptsOverride);
      setTimeout(() => focusEventInput(evId, pid, idx), 0);
    }, LONG_PRESS_MS);
  };

  const startBattleInspectLongPress = (evId, rowKey, holeNo, members = [], buttonEl = null) => {
    const key = `battle:${evId}:${rowKey}:${holeNo}`;
    cancelEventLongPress(key);
    longPressTimersRef.current[key] = setTimeout(() => {
      openBattleMenuAt(evId, rowKey, holeNo, members, buttonEl, { viewOnly: true });
    }, LONG_PRESS_MS);
  };

  const cloneEventInputs = (value) => {
    try {
      return value ? JSON.parse(JSON.stringify(value)) : {};
    } catch {
      return {};
    }
  };

  const stableNormalize = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(stableNormalize);
    const out = {};
    Object.keys(v).sort().forEach((k) => { out[k] = stableNormalize(v[k]); });
    return out;
  };

  const stringifyEventInputs = (value) => {
    try {
      return JSON.stringify(stableNormalize(value || {}));
    } catch {
      try { return JSON.stringify(value || {}); } catch { return ''; }
    }
  };

  const hasMeaningfulEventInputs = hasMeaningfulEventInputsRoot;

  const hydrateDraftFromServer = (source) => {
    const cloned = cloneEventInputs(source);
    draftTouchedRef.current = false;
    pendingSavedInputsSigRef.current = '';
    lastHydratedServerSigRef.current = stringifyEventInputs(cloned);
    bingoTouchedCellsRef.current = {};
    bingoTouchedBoardsRef.current = {};
    bingoTouchedSharedRef.current = {};
    try {
      Object.entries(cloned || {}).forEach(([evId, slot]) => {
        const evDef = getBingoEventDef(evId);
        if (evDef?.template !== 'bingo') return;
        const selectedHoles = normalizeBingoSelectedHoles(evDef?.params?.selectedHoles);
        Object.entries(slot?.person || {}).forEach(([pid, val]) => {
          const state = extractBingoPersonInput(val, selectedHoles);
          rememberBingoBoardDraft(evId, pid, state.board, selectedHoles, !!state.roomShared);
        });
      });
    } catch {}
    setDraft(cloned);
  };

  const applyDraft = (next, touched = true) => {
    draftTouchedRef.current = !!touched;
    setDraft(next);
  };

  useEffect(() => () => {
    try {
      Object.values(bingoCommonPressTimersRef.current || {}).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    } catch {}
  }, []);

  useEffect(() => {
    const serverSig = stringifyEventInputs(inputsByEventServer);
    const draftSig = stringifyEventInputs(draft);
    const draftEmpty = !hasMeaningfulEventInputs(draft);
    const prevHydratedSig = lastHydratedServerSigRef.current || '';

    if (pendingSavedInputsSigRef.current) {
      if (serverSig === pendingSavedInputsSigRef.current) {
        hydrateDraftFromServer(inputsByEventServer);
        return;
      }
    }

    const canHydrate = !draftTouchedRef.current || draftEmpty || draftSig === prevHydratedSig;
    if (canHydrate && serverSig !== draftSig) {
      hydrateDraftFromServer(inputsByEventServer);
      return;
    }

    if (lastHydratedServerSigRef.current === '' && !draftTouchedRef.current) {
      lastHydratedServerSigRef.current = serverSig;
    }
  }, [inputsByEventServer]);


  useEffect(() => {
    if (!activeEventStorageId) return;
    const nextPack = readPlayerScopedJson(activeEventStorageId, 'eventInputsServerCachePack', { inputs: {}, resetTokens: {} }) || { inputs: {}, resetTokens: {} };
    setServerInputsCachePack(nextPack);
  }, [activeEventStorageId]);

  useEffect(() => {
    if (!activeEventStorageId || !eventData) return;
    const nextPack = {
      inputs: cloneEventInputs(rawInputsByEventServer),
      resetTokens: { ...liveEventInputResetTokens },
    };
    setServerInputsCachePack(nextPack);
    writePlayerScopedJson(activeEventStorageId, 'eventInputsServerCachePack', nextPack);
  }, [activeEventStorageId, eventData, rawInputsByEventServer, liveEventInputResetTokens]);

  useEffect(() => {
    if (!activeEventStorageId) return;
    if (!hasMeaningfulEventInputs(draft)) return;
    writePlayerScopedJson(activeEventStorageId, 'eventInputsDraftCache', cloneEventInputs(draft || {}));
  }, [activeEventStorageId, draft, hasMeaningfulEventInputs]);

  useEffect(() => {
    const nextTokens = (eventData?.eventInputResets && typeof eventData.eventInputResets === 'object') ? eventData.eventInputResets : {};
    const currentEventKey = String(activeEventStorageId || '');

    if (resetTokensEventIdRef.current !== currentEventKey) {
      resetTokensEventIdRef.current = currentEventKey;
      resetTokensReadyRef.current = false;
      resetTokenRef.current = { ...nextTokens };
      return;
    }

    if (!resetTokensReadyRef.current) {
      resetTokensReadyRef.current = true;
      resetTokenRef.current = { ...nextTokens };
      try { diagPush('timeline', { type: 'playerEventInput.resetTokens:init', eventId: activeEventStorageId || '', tokenKeys: Object.keys(nextTokens || {}).length }); } catch {}
      return;
    }

    const prevTokens = resetTokenRef.current || {};
    const changedEvIds = Object.keys(nextTokens).filter((evId) => String(nextTokens[evId] || '') !== String(prevTokens[evId] || ''));
    if (changedEvIds.length) {
      try { diagPush('timeline', { type: 'playerEventInput.resetTokens:changed', eventId: activeEventStorageId || '', changedEvIds }); } catch {}
      const nextDraft = cloneEventInputs(inputsByEventServer);
      changedEvIds.forEach((evId) => {
        if (Object.prototype.hasOwnProperty.call(nextDraft, evId)) delete nextDraft[evId];
      });
      draftTouchedRef.current = false;
      pendingSavedInputsSigRef.current = '';
      lastHydratedServerSigRef.current = stringifyEventInputs(nextDraft);
      setDraft(nextDraft);
      setDirty(false);
      setBingoUiState((prev) => {
        const out = { ...(prev || {}) };
        changedEvIds.forEach((evId) => {
          if (out[evId]) out[evId] = { ...(out[evId] || {}), moveIndex: null };
        });
        return out;
      });
      if (activeEventStorageId) {
        const prevPack = readPlayerScopedJson(activeEventStorageId, 'eventInputsServerCachePack', { inputs: {}, resetTokens: {} }) || { inputs: {}, resetTokens: {} };
        const nextPack = {
          inputs: filterCachedEventInputsByResetTokens(prevPack?.inputs, prevPack?.resetTokens, nextTokens),
          resetTokens: { ...nextTokens },
        };
        setServerInputsCachePack(nextPack);
        writePlayerScopedJson(activeEventStorageId, 'eventInputsServerCachePack', nextPack);
        if (hasMeaningfulEventInputs(nextDraft)) {
          writePlayerScopedJson(activeEventStorageId, 'eventInputsDraftCache', nextDraft);
        } else {
          removePlayerScoped(activeEventStorageId, 'eventInputsDraftCache');
        }
      }
    }
    resetTokenRef.current = { ...nextTokens };
  }, [activeEventStorageId, eventData?.eventInputResets, inputsByEventServer]);

  useEffect(() => {
    if (!activeEventStorageId) return;
    const draftEmpty = !hasMeaningfulEventInputs(draft);
    if (!draftEmpty) return;
    const cachedDraft = readPlayerScopedJson(activeEventStorageId, 'eventInputsDraftCache', {});
    if (!hasMeaningfulEventInputs(cachedDraft)) return;
    draftTouchedRef.current = false;
    lastHydratedServerSigRef.current = stringifyEventInputs(cachedDraft);
    setDraft(cloneEventInputs(cachedDraft));
  }, [activeEventStorageId]);

  const inputsByEvent = draft || {};

  const getBingoRoomMemberIds = () => roomMembers.filter(Boolean).map((p) => String(p.id));

  const markBingoCellTouched = (evId, pid, idx) => {
    const evKey = String(evId || '');
    const pidKey = String(pid || '');
    const idxKey = String(idx);
    if (!evKey || !pidKey) return;
    if (!bingoTouchedCellsRef.current[evKey]) bingoTouchedCellsRef.current[evKey] = {};
    if (!bingoTouchedCellsRef.current[evKey][pidKey]) bingoTouchedCellsRef.current[evKey][pidKey] = {};
    bingoTouchedCellsRef.current[evKey][pidKey][idxKey] = true;
  };

  const getBingoTouchedCellMap = (evId, pid) => {
    return bingoTouchedCellsRef.current?.[String(evId || '')]?.[String(pid || '')] || {};
  };

  const isBingoCellTouched = (evId, pid, idx) => {
    return !!getBingoTouchedCellMap(evId, pid)?.[String(idx)];
  };

  const markBingoBoardTouched = (evId, pid) => {
    const evKey = String(evId || '');
    const pidKey = String(pid || '');
    if (!evKey || !pidKey) return;
    if (!bingoTouchedBoardsRef.current[evKey]) bingoTouchedBoardsRef.current[evKey] = {};
    bingoTouchedBoardsRef.current[evKey][pidKey] = true;
  };

  const isBingoBoardTouched = (evId, pid) => {
    return !!bingoTouchedBoardsRef.current?.[String(evId || '')]?.[String(pid || '')];
  };

  const markBingoSharedTouched = (evId, roomKey) => {
    const evKey = String(evId || '');
    const rk = String(roomKey || '');
    if (!evKey || !rk) return;
    if (!bingoTouchedSharedRef.current[evKey]) bingoTouchedSharedRef.current[evKey] = {};
    bingoTouchedSharedRef.current[evKey][rk] = true;
  };

  const isBingoSharedTouched = (evId, roomKey) => {
    return !!bingoTouchedSharedRef.current?.[String(evId || '')]?.[String(roomKey || '')];
  };

  const getBingoInputCellValue = (evId, pid, valueIndex) => {
    if (!evId || !pid) return '';
    const draftVal = inputsByEvent?.[evId]?.person?.[pid]?.values?.[valueIndex];
    if (isBingoCellTouched(evId, pid, valueIndex)) return draftVal ?? '';
    const serverVal = inputsByEventServer?.[evId]?.person?.[pid]?.values?.[valueIndex];
    if (serverVal !== undefined && serverVal !== null) return serverVal;
    return draftVal ?? '';
  };

  const getBingoUiForEvent = (evId) => (bingoUiState?.[evId] && typeof bingoUiState[evId] === 'object' ? bingoUiState[evId] : {});

  const setBingoActiveParticipant = (evId, pid) => {
    setBingoUiState((prev) => ({
      ...prev,
      [evId]: { ...(prev?.[evId] || {}), pid: String(pid || ''), moveIndex: null },
    }));
  };

  const clearBingoMoveIndex = (evId) => {
    setBingoUiState((prev) => ({
      ...prev,
      [evId]: { ...(prev?.[evId] || {}), moveIndex: null },
    }));
  };

  const getBingoRoomShared = (evId) => getBingoRoomMemberIds().some((pid) => !!inputsByEvent?.[evId]?.person?.[pid]?.roomShared);

  const getBingoPersonState = (evId, pid, selectedHoles) => extractBingoPersonInput(inputsByEvent?.[evId]?.person?.[pid], selectedHoles);
  const getBingoPersonStateSaved = (evId, pid, selectedHoles) => extractBingoPersonInput(inputsByEventServer?.[evId]?.person?.[pid], selectedHoles);
  const getBingoRoomSharedSaved = (evId) => getBingoRoomMemberIds().some((pid) => !!inputsByEventServer?.[evId]?.person?.[pid]?.roomShared);

  const getBingoEventDef = (evId) => events.find((item) => String(item?.id) === String(evId));

  const getBingoLargeOrder = (evId) => {
    const roomIds = getBingoRoomMemberIds();
    const roomKey = String(roomIdx || '');
    const draftOrder = inputsByEvent?.[evId]?.shared?.largeBingoOrders?.[roomKey];
    const serverOrder = inputsByEventServer?.[evId]?.shared?.largeBingoOrders?.[roomKey];
    const touched = isBingoSharedTouched(evId, roomKey);
    return normalizeBingoLargeOrder(touched ? (draftOrder || serverOrder) : (serverOrder || draftOrder), roomIds);
  };

  const getBingoLargeLeaderId = (evId) => {
    const roomIds = getBingoRoomMemberIds();
    const roomKey = String(roomIdx || '');
    const draftLeader = inputsByEvent?.[evId]?.shared?.largeBingoLeaders?.[roomKey];
    const serverLeader = inputsByEventServer?.[evId]?.shared?.largeBingoLeaders?.[roomKey];
    const touched = isBingoSharedTouched(evId, roomKey);
    const savedLeader = String((touched ? (draftLeader || serverLeader) : (serverLeader || draftLeader)) || '');
    if (savedLeader && roomIds.includes(savedLeader)) return savedLeader;
    return String(roomIds[0] || '');
  };

  const patchBingoLargeOrder = async (evId, nextOrder) => {
    const roomKey = String(roomIdx || '');
    if (!evId || !roomKey) return;
    const roomIds = getBingoRoomMemberIds();
    const normalizedOrder = normalizeBingoLargeOrder(nextOrder, roomIds);
    const leaderId = getBingoLargeLeaderId(evId) || String(roomIds[0] || '');

    const all = cloneEventInputs(draft || {});
    const slot = { ...(all[evId] || {}) };
    const shared = { ...(slot.shared || {}) };
    const largeBingoOrders = { ...(shared.largeBingoOrders || {}) };
    const largeBingoLeaders = { ...(shared.largeBingoLeaders || {}) };
    largeBingoOrders[roomKey] = normalizedOrder;
    largeBingoLeaders[roomKey] = leaderId;
    slot.shared = { ...shared, largeBingoOrders, largeBingoLeaders };
    all[evId] = slot;
    markBingoSharedTouched(evId, roomKey);
    applyDraft(all, false);

    // Big빙고판 배치는 방 전체 공유값이므로 저장 버튼을 기다리지 않고 즉시 저장합니다.
    // setDoc(..., { merge:true })의 중첩 merge를 사용해 다른 참가자의 점수 입력값은 덮어쓰지 않습니다.
    try {
      const targetEventId = eventId || ctxId;
      if (targetEventId) {
        await updateDoc(doc(db, 'events', targetEventId), {
          [`eventInputs.${evId}.shared.largeBingoOrders.${roomKey}`]: normalizedOrder,
          [`eventInputs.${evId}.shared.largeBingoLeaders.${roomKey}`]: leaderId,
        });
      }
    } catch (e) {
      console.warn('[PlayerEventInput] Big bingo order immediate save failed:', e);
      setDirty(true);
    }
  };

  const applyBingoLargeOrderSlot = (evId, slotIndex) => {
    const roomIds = getBingoRoomMemberIds();
    const leaderId = getBingoLargeLeaderId(evId);
    const mine = String(selfParticipantId || ctxParticipant?.id || ctxParticipant?.uid || '');
    if (!leaderId || !mine || leaderId !== mine) {
      window.alert('Big빙고판 배치는 방 리더만 수정할 수 있습니다.');
      return;
    }
    const idx = Number(slotIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) return;
    const ui = getBingoUiForEvent(evId);
    const currentMove = Number.isInteger(ui?.largeMoveIndex) ? ui.largeMoveIndex : -1;
    if (currentMove < 0) {
      setBingoUiState((prev) => ({
        ...prev,
        [evId]: { ...(prev?.[evId] || {}), largeMoveIndex: idx },
      }));
      return;
    }
    const order = getBingoLargeOrder(evId);
    if (currentMove !== idx) {
      const next = [...order];
      const temp = next[currentMove];
      next[currentMove] = next[idx];
      next[idx] = temp;
      patchBingoLargeOrder(evId, next);
    }
    setBingoUiState((prev) => ({
      ...prev,
      [evId]: { ...(prev?.[evId] || {}), largeMoveIndex: null },
    }));
  };

  const rememberBingoBoardDraft = (evId, pid, board, selectedHoles, roomShared = false) => {
    const key = `${evId}:${pid}`;
    const safeBoard = normalizeBingoBoard(board, selectedHoles);
    bingoBoardDraftRef.current[key] = { board: safeBoard, roomShared: !!roomShared };
  };

  const restoreBingoBoardToValue = (evId, pid, obj, selectedHoles) => {
    if (!obj || typeof obj !== 'object') return obj;
    const key = `${evId}:${pid}`;
    const safeBoard = normalizeBingoBoard(obj.board, selectedHoles);
    if (safeBoard.some(Boolean)) {
      rememberBingoBoardDraft(evId, pid, safeBoard, selectedHoles, !!obj.roomShared);
      return { ...obj, board: safeBoard };
    }

    const cached = bingoBoardDraftRef.current?.[key];
    if (cached) {
      return { ...obj, board: [...(cached.board || [])], roomShared: !!cached.roomShared };
    }

    const serverState = extractBingoPersonInput(inputsByEventServer?.[evId]?.person?.[pid], selectedHoles);
    if (serverState.board.some(Boolean)) {
      rememberBingoBoardDraft(evId, pid, serverState.board, selectedHoles, !!serverState.roomShared);
      return { ...obj, board: [...serverState.board], roomShared: !!serverState.roomShared };
    }

    return obj;
  };

  const getBingoEditorPid = (evId, selectedHoles) => {
    const roomIds = getBingoRoomMemberIds();
    const ui = getBingoUiForEvent(evId);
    const mine = String(selfParticipantId || ctxParticipant?.id || '');
    if (roomIds.includes(String(ui?.pid || ''))) return String(ui.pid);
    if (mine && roomIds.includes(mine)) return mine;
    const withBoard = roomIds.find((pid) => getBingoPersonState(evId, pid, selectedHoles).board.some(Boolean));
    return withBoard || roomIds[0] || '';
  };

  const patchBingoBoard = (evId, selectedHoles, basePid, nextBoard, sharedMode) => {
    const roomIds = getBingoRoomMemberIds();
    const targetIds = sharedMode ? roomIds : [String(basePid || '')].filter(Boolean);
    if (!targetIds.length) return;
    const normalizedBoard = normalizeBingoBoard(nextBoard, selectedHoles);
    const all = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    targetIds.forEach((pid) => {
      const prevState = extractBingoPersonInput(person?.[pid], selectedHoles);
      person[pid] = {
        ...prevState,
        values: [...prevState.values],
        board: [...normalizedBoard],
        roomShared: !!sharedMode,
      };
      rememberBingoBoardDraft(evId, pid, normalizedBoard, selectedHoles, !!sharedMode);
      markBingoBoardTouched(evId, pid);
    });
    slot.person = person;
    all[evId] = slot;
    applyDraft(all);
  };

  const setBingoRoomShared = (evId, selectedHoles, sharedMode) => {
    const roomIds = getBingoRoomMemberIds();
    if (!roomIds.length) return;
    const basePid = getBingoEditorPid(evId, selectedHoles);
    const baseState = getBingoPersonState(evId, basePid || roomIds[0], selectedHoles);
    const sourceBoard = normalizeBingoBoard(baseState.board, selectedHoles);
    const currentShared = getBingoRoomShared(evId);
    if (currentShared === !!sharedMode) return;

    const hasAnyBoard = roomIds.some((pid) => getBingoPersonState(evId, pid, selectedHoles).board.some(Boolean));
    const owner = String((roomMembers.find((p) => String(p?.id) === String(basePid || ''))?.nickname) || selfParticipant?.nickname || ctxParticipant?.nickname || '현재 닉네임');
    const message = sharedMode
      ? (hasAnyBoard
          ? `${owner}의 빙고판 기준으로 공통입력으로 전환합니다. 계속하시겠습니까?`
          : '공통입력으로 전환합니다. 계속하시겠습니까?')
      : '각자입력으로 전환합니다. 계속하시겠습니까?';
    const ok = window.confirm(message);
    if (!ok) return;

    const all = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    roomIds.forEach((pid) => {
      const prevState = extractBingoPersonInput(person?.[pid], selectedHoles);
      person[pid] = {
        ...prevState,
        values: [...prevState.values],
        board: [...(sharedMode ? sourceBoard : prevState.board)],
        roomShared: !!sharedMode,
      };
      markBingoBoardTouched(evId, pid);
    });
    slot.person = person;
    all[evId] = slot;
    applyDraft(all);
    setDirty(true);
    setBingoUiState((prev) => ({
      ...prev,
      [evId]: { ...(prev?.[evId] || {}), pid: String(basePid || roomIds[0] || ''), moveIndex: null },
    }));
  };

  const applyBingoCommonPlacement = (evId, selectedHoles) => {
    const roomIds = getBingoRoomMemberIds();
    if (!roomIds.length) return;

    const mine = String(selfParticipantId || ctxParticipant?.id || ctxParticipant?.uid || '');
    if (!mine || !roomIds.includes(mine)) {
      window.alert('본인 빙고판을 기준으로만 공통배치를 실행할 수 있습니다.');
      return;
    }

    const baseState = getBingoPersonState(evId, mine, selectedHoles);
    const sourceBoard = normalizeBingoBoard(baseState.board, selectedHoles);
    const targetCellCount = normalizeBingoBoardCellCount(normalizeBingoSelectedHoles(selectedHoles).length === 9 ? 9 : 16);
    const hasFullBoard = sourceBoard.filter(Boolean).length >= Math.min(targetCellCount, normalizeBingoSelectedHoles(selectedHoles).length);
    if (!hasFullBoard) {
      window.alert('본인 빙고판을 먼저 모두 입력한 뒤 공통배치를 실행해 주세요.');
      return;
    }

    const owner = String((roomMembers.find((p) => String(p?.id) === mine)?.nickname) || selfParticipant?.nickname || ctxParticipant?.nickname || '현재 닉네임');
    const ok = window.confirm(`${owner}의 빙고판을 같은 방 참가자 전체에게 공통배치합니다. 계속하시겠습니까?`);
    if (!ok) return;

    const all = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    roomIds.forEach((pid) => {
      const prevState = extractBingoPersonInput(person?.[pid], selectedHoles);
      person[pid] = {
        ...prevState,
        values: [...prevState.values],
        board: [...sourceBoard],
        roomShared: false,
      };
      rememberBingoBoardDraft(evId, pid, sourceBoard, selectedHoles, false);
      markBingoBoardTouched(evId, pid);
    });
    slot.person = person;
    all[evId] = slot;
    applyDraft(all);
    setDirty(true);
    clearBingoMoveIndex(evId);
    setBingoUiState((prev) => ({
      ...prev,
      [evId]: { ...(prev?.[evId] || {}), pid: mine, moveIndex: null },
    }));
  };

  const requestBingoCommonPlacement = (evId, selectedHoles) => {
    const key = String(evId || '');
    if (!key) return;
    const now = Date.now();
    const prevState = bingoCommonPressState?.[key] || {};
    const prevCount = Number(prevState?.count || 0);
    const stillActive = Number(prevState?.expiresAt || 0) > now;
    const nextCount = stillActive ? Math.min(BINGO_COMMON_REQUIRED_PRESS_COUNT, prevCount + 1) : 1;
    const expiresAt = now + BINGO_COMMON_PRESS_WINDOW_MS;

    setBingoCommonPressState((prev) => ({
      ...prev,
      [key]: { count: nextCount, expiresAt },
    }));

    try {
      const oldTimer = bingoCommonPressTimersRef.current?.[key];
      if (oldTimer) clearTimeout(oldTimer);
      bingoCommonPressTimersRef.current[key] = setTimeout(() => {
        setBingoCommonPressState((prev) => {
          const next = { ...(prev || {}) };
          delete next[key];
          return next;
        });
      }, BINGO_COMMON_PRESS_WINDOW_MS);
    } catch {}

    if (nextCount < BINGO_COMMON_REQUIRED_PRESS_COUNT) return;

    try {
      const oldTimer = bingoCommonPressTimersRef.current?.[key];
      if (oldTimer) clearTimeout(oldTimer);
      delete bingoCommonPressTimersRef.current[key];
    } catch {}
    setBingoCommonPressState((prev) => {
      const next = { ...(prev || {}) };
      delete next[key];
      return next;
    });
    applyBingoCommonPlacement(evId, selectedHoles);
  };

  const randomizeBingoBoard = (evId, selectedHoles) => {
    const basePid = String(getBingoEditorPid(evId, selectedHoles) || '');
    if (!basePid) return;
    const mine = String(selfParticipantId || ctxParticipant?.id || ctxParticipant?.uid || '');
    if (!mine || String(basePid) !== String(mine)) {
      window.alert('본인 빙고판만 무작위 배치할 수 있습니다.');
      return;
    }
    const ok = window.confirm('본인 빙고판을 순서 없이 무작위로 배치합니다. 진행하시겠습니까?');
    if (!ok) return;
    patchBingoBoard(evId, selectedHoles, basePid, shuffleArray(selectedHoles.slice(0, selectedHoles.length === 9 ? 9 : 16)), false);
    setDirty(true);
    clearBingoMoveIndex(evId);
  };

  const clearBingoBoard = (evId, selectedHoles) => {
    const basePid = String(getBingoEditorPid(evId, selectedHoles) || '');
    if (!basePid) return;

    const mine = String(selfParticipantId || ctxParticipant?.id || ctxParticipant?.uid || '');
    if (!mine || String(basePid) !== String(mine)) {
      window.alert('본인 빙고판만 초기화할 수 있습니다.');
      return;
    }

    const ok = window.confirm('현재 본인 빙고판을 초기화합니다. 정말 진행하시겠습니까?');
    if (!ok) return;

    patchBingoBoard(evId, selectedHoles, basePid, makeEmptyBingoBoard(selectedHoles.length === 9 ? 9 : 16), false);
    setDirty(true);
    clearBingoMoveIndex(evId);
  };

  const applyBingoBoardCell = (evId, selectedHoles, cellIndex) => {
    const basePid = String(getBingoEditorPid(evId, selectedHoles) || '');
    const sharedMode = getBingoRoomShared(evId);
    const mine = String(selfParticipantId || ctxParticipant?.id || ctxParticipant?.uid || '');
    if (!basePid) return;
    if (!sharedMode && (!mine || String(basePid) !== String(mine))) {
      window.alert('본인 빙고판만 입력/수정할 수 있습니다.');
      return;
    }
    const ui = getBingoUiForEvent(evId);
    const current = getBingoPersonState(evId, basePid, selectedHoles);
    const nextBoard = getBingoBoardNextState(current.board, selectedHoles, cellIndex, ui?.moveIndex, selectedHoles.length === 9 ? 9 : 16);
    patchBingoBoard(evId, selectedHoles, basePid, nextBoard, sharedMode);
    setDirty(true);
    clearBingoMoveIndex(evId);
  };

  const startBingoLongPress = (evId, cellIndex, hasValue) => {
    if (!hasValue) return;
    const key = `${evId}:${cellIndex}`;
    const timer = bingoLongPressTimersRef.current?.[key];
    if (timer) clearTimeout(timer);
    if (bingoLongPressDoneRef.current) delete bingoLongPressDoneRef.current[key];
    bingoLongPressTimersRef.current[key] = setTimeout(() => {
      bingoLongPressDoneRef.current[key] = true;
      setBingoUiState((prev) => ({
        ...prev,
        [evId]: { ...(prev?.[evId] || {}), moveIndex: cellIndex },
      }));
    }, LONG_PRESS_MS);
  };

  const cancelBingoLongPress = (evId, cellIndex) => {
    const key = `${evId}:${cellIndex}`;
    const timer = bingoLongPressTimersRef.current?.[key];
    if (timer) clearTimeout(timer);
    if (bingoLongPressTimersRef.current) delete bingoLongPressTimersRef.current[key];
  };

  const consumeBingoLongPress = (evId, cellIndex) => {
    const key = `${evId}:${cellIndex}`;
    const on = !!bingoLongPressDoneRef.current?.[key];
    if (bingoLongPressDoneRef.current) delete bingoLongPressDoneRef.current[key];
    return on;
  };

  const getServerSingle = (evId, pid) => {
    const v = inputsByEventServer?.[evId]?.person?.[pid];
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const getServerAccum = (evId, pid, attempts) => {
    const arr = inputsByEventServer?.[evId]?.person?.[pid]?.values;
    const base = Array.isArray(arr) ? [...arr] : [];
    while (base.length < attempts) base.push('');
    return base.map((x) => {
      if (x === '' || x == null) return '';
      const n = Number(x);
      return Number.isFinite(n) ? String(n) : '';
    });
  };

  const padPickIds = (arr, count) => {
    const need = Math.max(1, Number(count || 1));
    const base = Array.isArray(arr) ? [...arr] : [];
    while (base.length < need) base.push('');
    return base.slice(0, need).map((x) => String(x || ''));
  };

  const getServerPickIds = (evId, pid, requiredCount) => {
    const arr = normalizeMemberIds(inputsByEventServer?.[evId]?.person?.[pid]);
    return padPickIds(arr, requiredCount);
  };

  const patchValue = (evId, pid, value) => {
    const all  = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    const prev = String(person[pid] ?? '');
    const next = String(value ?? '');
    if (prev === next) return;
    person[pid] = next;
    slot.person = person; all[evId] = slot;
    applyDraft(all);
  };

  const patchAccum = (evId, pid, idx, value, attemptsOverride) => {
    const all  = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    let obj = person[pid] && typeof person[pid]==='object' && Array.isArray(person[pid].values)
      ? { ...person[pid], values:[...person[pid].values] } : { values:[] };
    const bingoDef = getBingoEventDef(evId);
    if (bingoDef?.template === 'bingo') {
      const selectedHoles = normalizeBingoSelectedHoles(bingoDef?.params?.selectedHoles);
      obj = restoreBingoBoardToValue(evId, pid, obj, selectedHoles);
      markBingoCellTouched(evId, pid, idx);
    }
    const atts = Number.isFinite(Number(attemptsOverride)) ? Number(attemptsOverride) : (idx+1);
    while (obj.values.length < atts) obj.values.push('');
    const prev = String(obj.values[idx] ?? '');
    const next = String(value ?? '');
    if (prev === next) return;
    obj.values[idx] = next;
    person[pid]=obj; slot.person=person; all[evId]=slot;
    applyDraft(all);
  };

  const patchPickMember = (evId, pid, idx, value, requiredCount) => {
    const all  = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    const prevObj = person[pid] && typeof person[pid] === 'object' ? { ...person[pid] } : {};
    const arr = padPickIds(normalizeMemberIds(prevObj), requiredCount);
    const next = String(value || '');
    if (arr[idx] === next) return;

    if (next) {
      for (let i = 0; i < arr.length; i += 1) {
        if (i !== idx && arr[i] === next) arr[i] = '';
      }
    }
    arr[idx] = next;

    if (!arr.some(Boolean)) {
      person[pid] = { memberIds: [] };
    } else {
      person[pid] = { ...prevObj, memberIds: arr };
    }

    slot.person = person; all[evId] = slot;
    applyDraft(all);
  };

  const finalizeValue = (evId, pid, raw) => {
    const v = String(raw ?? '').trim();
    const num = v === '' ? NaN : Number(v);

    const all  = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };

    if (!v || Number.isNaN(num)) delete person[pid];
    else person[pid] = num;

    slot.person = person; all[evId] = slot;
    applyDraft(all);
  };
  const finalizeAccum = (evId, pid, idx, raw, attemptsOverride) => {
    const v = String(raw ?? '').trim();
    const num = v === '' ? NaN : Number(v);

    const all  = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    let obj = person[pid] && typeof person[pid]==='object' && Array.isArray(person[pid].values)
      ? { ...person[pid], values:[...person[pid].values] } : { values:[] };
    const bingoDef = getBingoEventDef(evId);
    let bingoSelectedHolesForSave = null;
    if (bingoDef?.template === 'bingo') {
      bingoSelectedHolesForSave = normalizeBingoSelectedHoles(bingoDef?.params?.selectedHoles);
      obj = restoreBingoBoardToValue(evId, pid, obj, bingoSelectedHolesForSave);
      markBingoCellTouched(evId, pid, idx);
    }
    const atts = Number.isFinite(Number(attemptsOverride)) ? Number(attemptsOverride) : (idx+1);
    while (obj.values.length < atts) obj.values.push('');

    obj.values[idx] = Number.isNaN(num) ? '' : num;
    const hasBingoBoardForSave = bingoSelectedHolesForSave
      ? normalizeBingoBoard(obj.board, bingoSelectedHolesForSave).some(Boolean)
      : false;
    if (!obj.values.some(s => String(s).trim() !== '') && !hasBingoBoardForSave) delete person[pid];
    else person[pid] = obj;

    slot.person = person; all[evId] = slot;
    applyDraft(all);
  };

  const patchBonus = (evId, pid, idxOrVal, value, isAccum, attemptsOverride) => {
    const all = { ...(draft || {}) };
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    const obj = person[pid] && typeof person[pid]==='object'
      ? { ...person[pid] } : {};
    if (isAccum) {
      const arr = Array.isArray(obj.bonus) ? [...obj.bonus] : [];
      const atts = Number.isFinite(Number(attemptsOverride)) ? Number(attemptsOverride) : (Number(idxOrVal)+1);
      while (arr.length < atts) arr.push('');
      const prev = String(arr[idxOrVal] ?? '');
      const next = String(value ?? '');
      if (prev !== next) {
        arr[idxOrVal] = next;
        obj.bonus = arr;
      }
    } else {
      const prev = String(obj.bonus ?? '');
      const next = String(value ?? '');
      if (prev !== next) obj.bonus = next;
    }
    person[pid] = obj; slot.person = person; all[evId] = slot;
    applyDraft(all);
  };

  const calcPopupWidth = (evId) => {
    try {
      const ev = events.find(e => e.id === evId);
      const opts = (ev && ev.template === 'range-convert-bonus' && Array.isArray(ev.params?.bonus))
        ? ev.params.bonus : [];
      const labels = [
        ...opts.map(b => `${b.label}${b.score != null ? ` (+${b.score})` : ''}`),
        '선택 해제',
      ];
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = '14px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      const textW = Math.max(...labels.map(s => ctx.measureText(String(s)).width || 0));
      const PADDING_X = 16;
      const SHADOW_BORDER = 8;
      const W = Math.ceil(textW + PADDING_X + SHADOW_BORDER);
      return Math.min(Math.max(W, 90), 168);
    } catch {
      return 136;
    }
  };

  const [bonusPopup, setBonusPopup] = useState({ open:false, x:0, y:0, evId:null, pid:null, idx:0, attempts:0, w:136 });
  const openBonusPopup = (evId, pid, idx, attempts, e) => {
    e.stopPropagation();
    const w  = calcPopupWidth(evId);
    const r  = e.currentTarget.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 360;
    const GAP = 8;
    let x = r.left + r.width / 2;
    const half = w / 2;
    if (x + half + GAP > vw) x = vw - (half + GAP);
    if (x - half - GAP < 0)  x = half + GAP;
    const y = r.bottom + 6;
    setBonusPopup({ open:true, x, y, evId, pid, idx, attempts, w });
  };
  const closeBonusPopup = () => setBonusPopup({ open:false, x:0, y:0, evId:null, pid:null, idx:0, attempts:0, w:136 });
  useEffect(()=>{ const onDoc=()=>setBonusPopup(p=>(p.open?{...p,open:false}:p)); document.addEventListener('click',onDoc); return()=>document.removeEventListener('click',onDoc); },[]);

  const sortedParticipants = useMemo(() => {
    const arr = Array.isArray(participants) ? [...participants] : [];
    arr.sort((a, b) => {
      const roomDiff = (Number(a?.room ?? 999) - Number(b?.room ?? 999));
      if (roomDiff) return roomDiff;
      const groupDiff = (Number(getParticipantGroupNo(a) || 999) - Number(getParticipantGroupNo(b) || 999));
      if (groupDiff) return groupDiff;
      return String(a?.nickname || '').localeCompare(String(b?.nickname || ''), 'ko');
    });
    return arr;
  }, [participants]);

  const participantById = useMemo(() => {
    return new Map(sortedParticipants.map((p) => [String(p?.id), p]));
  }, [sortedParticipants]);

  const getPickOptions = (ev, slotIdx) => {
    const cfg = getPickLineupConfig(ev);
    if (cfg.mode === 'jo') {
      const groupNo = cfg.openGroups[slotIdx];
      return sortedParticipants.filter((p) => Number(getParticipantGroupNo(p)) === Number(groupNo));
    }
    return sortedParticipants;
  };

  // 개인/조 선택 대결 메뉴는 Portal에서 다시 렌더링되므로,
  // 방 멤버(roomMembers)가 스냅샷 갱신 순간 잠깐 비거나 재정렬되어도
  // 선택자 본인은 전체 참가자 목록에서 한 번 더 찾도록 보강합니다.
  const getPickSelectorById = (pid) => {
    const key = String(pid ?? '');
    if (!key) return null;
    return roomMembers.find((item) => String(item?.id ?? '') === key)
      || participantById.get(key)
      || null;
  };

  const getGroupRoomBattleRows = (ev) => getGroupRoomHoleBattleRows(ev, participants, { roomNames, roomCount: allRoomNos.length || roomNames.length || 0, currentRoomNo: roomIdx, currentParticipantId: selfParticipantId, currentParticipantNickname: String(selfParticipant?.nickname || '') });

  const getRankScorePairMap = (evId) => {
    const draftPairs = inputsByEvent?.[evId]?.shared?.rankScorePairs;
    const serverPairs = inputsByEventServer?.[evId]?.shared?.rankScorePairs;
    return normalizeRankScorePairs(draftPairs || serverPairs || {});
  };

  const getRankScorePairRows = (evId) => {
    const pairs = getRankScorePairMap(evId);
    const seen = new Set();
    const rows = [];
    Object.entries(pairs).forEach(([aId, bId]) => {
      const aKey = String(aId || '');
      const bKey = String(bId || '');
      if (!aKey || !bKey || seen.has(aKey) || seen.has(bKey)) return;
      const a = participantById.get(aKey);
      const b = participantById.get(bKey);
      if (!a || !b) return;
      seen.add(aKey);
      seen.add(bKey);
      rows.push({ a, b });
    });
    return rows;
  };

  const patchRankScorePair = async (evId, me, partner) => {
    if (!evId || !me || !partner) return;
    const meId = String(me.id);
    const partnerId = String(partner.id);
    const currentPairs = getRankScorePairMap(evId);
    const pairs = { ...currentPairs };

    [meId, partnerId].forEach((pid) => {
      const prev = pairs[pid];
      if (prev != null) delete pairs[String(prev)];
      delete pairs[pid];
    });
    pairs[meId] = partnerId;
    pairs[partnerId] = meId;

    const all = cloneEventInputs(draft || {});
    const slot = { ...(all[evId] || {}) };
    slot.shared = { ...(slot.shared || {}), rankScorePairs: pairs };
    all[evId] = slot;
    applyDraft(all);
    setDirty(true);

    try {
      const merged = cloneEventInputs(inputsByEventServer || {});
      const mSlot = { ...(merged[evId] || {}) };
      mSlot.person = { ...(mSlot.person || {}), ...((slot.person && typeof slot.person === 'object') ? slot.person : {}) };
      mSlot.shared = { ...(mSlot.shared || {}), rankScorePairs: pairs };
      merged[evId] = mSlot;
      if (typeof updateEventImmediate === 'function') {
        await updateEventImmediate({ eventInputs: merged }, false);
        const savedClone = cloneEventInputs(merged);
        pendingSavedInputsSigRef.current = stringifyEventInputs(savedClone);
        if (activeEventStorageId) {
          const nextPack = {
            inputs: savedClone,
            resetTokens: { ...liveEventInputResetTokens },
          };
          setServerInputsCachePack(nextPack);
          writePlayerScopedJson(activeEventStorageId, 'eventInputsServerCachePack', nextPack);
          writePlayerScopedJson(activeEventStorageId, 'eventInputsDraftCache', savedClone);
        }
      }
    } catch (e) {
      console.warn('[PlayerEventInput] rank-score pair save failed:', e);
    }
  };

  const handleRankScorePairPick = (evId, rankCfg) => {
    const mine = selfParticipant || participantById.get(String(selfParticipantId ?? ''));
    if (!mine) return;
    const mineId = String(mine.id);
    const pairs = getRankScorePairMap(evId);
    if (pairs[mineId]) return;
    const mySide = getRankScoreGroupSide(mine, rankCfg);
    if (!mySide) {
      alert('포볼 선택은 운영자가 지정한 A/B 그룹 참가자만 사용할 수 있습니다.');
      return;
    }
    const targetSide = mySide === 'A' ? 'B' : 'A';
    const candidates = (participants || []).filter((p) => {
      const pid = String(p?.id ?? '');
      if (!pid || pid === mineId) return false;
      if (pairs[pid]) return false;
      return getRankScoreGroupSide(p, rankCfg) === targetSide;
    });
    if (!candidates.length) {
      alert('선택 가능한 상대 그룹 참가자가 없습니다.');
      return;
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    patchRankScorePair(evId, mine, pick);
    alert(`${mine.nickname || '참가자'}님은 ${pick.nickname || '상대'}님과 포볼팀으로 배정되었습니다.`);
  };


  const patchHiddenOpponent = async (evId, opponentId) => {
    const mine = selfParticipant || participantById.get(String(selfParticipantId ?? ''));
    if (!evId || !mine) return;
    const meId = String(mine.id || '');
    const targetId = String(opponentId || '');
    if (!meId) return;

    const all = cloneEventInputs(draft || {});
    const slot = { ...(all[evId] || {}) };
    const person = { ...(slot.person || {}) };
    if (!targetId) delete person[meId];
    else person[meId] = { opponentId: targetId, selectedAt: Date.now() };
    slot.person = person;
    all[evId] = slot;
    applyDraft(all);
    setDirty(true);

    try {
      const merged = cloneEventInputs(inputsByEventServer || {});
      const mSlot = { ...(merged[evId] || {}) };
      mSlot.person = { ...(mSlot.person || {}) };
      if (!targetId) delete mSlot.person[meId];
      else mSlot.person[meId] = person[meId];
      merged[evId] = mSlot;
      if (typeof updateEventImmediate === 'function') {
        await updateEventImmediate({ eventInputs: merged, inputsUpdatedAt: Date.now() }, false);
        const savedClone = cloneEventInputs(merged);
        pendingSavedInputsSigRef.current = stringifyEventInputs(savedClone);
        hydrateDraftFromServer(savedClone);
        if (activeEventStorageId) {
          const nextPack = { inputs: savedClone, resetTokens: { ...liveEventInputResetTokens } };
          setServerInputsCachePack(nextPack);
          writePlayerScopedJson(activeEventStorageId, 'eventInputsServerCachePack', nextPack);
          writePlayerScopedJson(activeEventStorageId, 'eventInputsDraftCache', savedClone);
        }
        setDirty(false);
      }
    } catch (e) {
      console.warn('[PlayerEventInput] hidden opponent save failed:', e);
      alert('히든 상대 선택 저장 중 오류가 발생했습니다.');
    }
  };


  const handleHiddenFourballRandomPick = async (ev, hiddenCfg) => {
    const mine = selfParticipant || participantById.get(String(selfParticipantId ?? ''));
    if (!ev || !mine) return;
    const cfg = normalizeHiddenEventParams(hiddenCfg || ev?.params);
    if (cfg.selectionLocked) {
      alert('선택이 마감되어 더 이상 수정할 수 없습니다.');
      return;
    }
    const mineId = String(mine.id || '');
    const hiddenDraftSlot = (inputsByEvent?.[ev.id] && typeof inputsByEvent[ev.id] === 'object') ? inputsByEvent[ev.id] : {};
    const hiddenServerSlot = (inputsByEventServer?.[ev.id] && typeof inputsByEventServer[ev.id] === 'object') ? inputsByEventServer[ev.id] : {};
    const hiddenEffectiveSlot = Object.keys(hiddenDraftSlot || {}).length ? hiddenDraftSlot : hiddenServerSlot;
    const hiddenData = computeHiddenEvent(ev, participants, hiddenEffectiveSlot, { roomNames, roomCount: allRoomNos.length || roomNames.length || 0 });
    const pairs = hiddenData?.pairMap || {};
    if (pairs[mineId]) return;

    const mySide = getRankScoreGroupSide(mine, { pairGroups: cfg.pairGroups });
    if (!mySide) {
      alert('포볼 선택은 운영자가 지정한 A/B 그룹 참가자만 사용할 수 있습니다.');
      return;
    }
    const targetSide = mySide === 'A' ? 'B' : 'A';
    const candidates = (participants || []).filter((p) => {
      const pid = String(p?.id ?? '');
      if (!pid || pid === mineId) return false;
      if (pairs[pid]) return false;
      return getRankScoreGroupSide(p, { pairGroups: cfg.pairGroups }) === targetSide;
    });
    if (!candidates.length) {
      alert('선택 가능한 상대 그룹 참가자가 없습니다.');
      return;
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    await patchHiddenOpponent(ev.id, pick.id);
    alert(`${mine.nickname || '참가자'}님은 ${pick.nickname || '상대'}님과 히든 포볼팀으로 배정되었습니다.`);
  };

  const getGroupRoomBattleCellIds = (evId, rowKey, holeNo, allowedIds = []) => {
    const shared = getBattleSharedInputs(inputsByEvent?.[evId] || {});
    return getBattleCellIds(shared, rowKey, holeNo, allowedIds);
  };

  const patchGroupRoomBattleCell = (ev, row, holeNo, memberId) => {
    const cfg = normalizeGroupRoomHoleBattleParams(ev?.params, { participants, roomNames, roomCount: allRoomNos.length || roomNames.length || 0 });
    const all = { ...(draft || {}) };
    const slot = { ...(all[ev.id] || {}) };
    const shared = getBattleSharedInputs(slot);
    const rows = { ...(shared.rows || {}) };
    const rowEntry = { ...(rows[row.key] || {}) };
    const holes = { ...(rowEntry.holes || {}) };
    const currentIds = getBattleCellIds(shared, row.key, holeNo, row.memberIds);
    const usage = countParticipantUsageForRow(shared, row.key);
    const nextId = String(memberId || '');

    let nextIds = [...currentIds];
    if (!nextId) {
      nextIds = [];
    } else if (nextIds.includes(nextId)) {
      nextIds = nextIds.filter((id) => id !== nextId);
    } else {
      const currentCountForMember = Number(usage[nextId] || 0) - (currentIds.includes(nextId) ? 1 : 0);
      if (currentCountForMember >= cfg.maxPerParticipant) {
        return;
      }
      if (nextIds.length >= cfg.pickCount) {
        return;
      }
      nextIds = [...nextIds, nextId];
    }

    holes[String(holeNo)] = nextIds;
    rowEntry.holes = holes;
    rows[row.key] = rowEntry;
    slot.shared = { ...shared, rows };
    all[ev.id] = slot;
    applyDraft(all);
  };

  const saveDraft = async () => {
    try{
      try { diagPush('timeline', { type: 'playerEventInput.saveDraft:start', eventId: activeEventStorageId || '', dirty: !!dirty }); } catch {}
      await ensureMembership((eventId || ctxId), roomIdx);

      const targetEventId = eventId || ctxId;
      if (!targetEventId) return;

      const buildMergedEventInputs = (baseSource = {}) => {
        const base = (baseSource && typeof baseSource === 'object') ? baseSource : {};
        const src  = draft || {};
        const roomPids = new Set(roomMembers.filter(Boolean).map(p=>String(p.id)));
        const merged = { ...base };

        Object.entries(src).forEach(([evId, slot])=>{
          const sPerson = slot?.person || {};
          const evDef = events.find((item) => String(item?.id) === String(evId));
          const allowedPids = evDef?.template === 'group-room-hole-battle'
            ? new Set(getGroupRoomBattleScoreParticipants(evDef, participants, { roomNames, roomCount: allRoomNos.length || roomNames.length || 0, currentRoomNo: roomIdx, currentParticipantId: selfParticipantId, currentParticipantNickname: String(selfParticipant?.nickname || '') }).map((p) => String(p?.id || '')).filter(Boolean))
            : roomPids;
          if (!merged[evId]) merged[evId] = {};
          const mSlot = { ...(merged[evId]||{}) };
          const mPerson = { ...(mSlot.person||{}) };

          Object.entries(sPerson).forEach(([pid, rawVal])=>{
            if (!allowedPids.has(String(pid))) return;
            let val = rawVal;
            if (evDef?.template === 'bingo' && typeof val === 'object' && val && Array.isArray(val.values)) {
              const selectedHoles = normalizeBingoSelectedHoles(evDef?.params?.selectedHoles);
              val = restoreBingoBoardToValue(evId, pid, { ...val, values: [...val.values], board: Array.isArray(val.board) ? [...val.board] : [] }, selectedHoles);
              const prevState = extractBingoPersonInput(mPerson?.[pid], selectedHoles);
              const nextState = extractBingoPersonInput(val, selectedHoles);
              const touchedCells = getBingoTouchedCellMap(evId, pid);
              const touchedCellKeys = Object.keys(touchedCells || {}).filter((k) => touchedCells[k]);
              const mergedValues = [...prevState.values];
              while (mergedValues.length < Math.max(prevState.values.length, nextState.values.length, 18)) mergedValues.push('');
              touchedCellKeys.forEach((idxKey) => {
                const valueIdx = Number(idxKey);
                if (Number.isInteger(valueIdx) && valueIdx >= 0) mergedValues[valueIdx] = nextState.values[valueIdx] ?? '';
              });
              const boardTouched = isBingoBoardTouched(evId, pid);
              val = {
                ...val,
                values: mergedValues,
                board: boardTouched ? [...nextState.board] : [...prevState.board],
                roomShared: boardTouched ? !!nextState.roomShared : !!prevState.roomShared,
              };
            }
            const isEmptyPick = typeof val === 'object' && val && Array.isArray(val.memberIds) && !val.memberIds.some(Boolean);
            const isEmptyBingo = typeof val === 'object' && val && Array.isArray(val.values) && Array.isArray(val.board)
              && !val.values.some((x) => String(x ?? '').trim() !== '')
              && !val.board.some((x) => String(x ?? '').trim() !== '')
              && !val.roomShared;
            const isEmptyBattleScore = evDef?.template === 'group-room-hole-battle' && typeof val === 'object' && val && Array.isArray(val.values)
              && !val.values.some((x) => String(x ?? '').trim() !== '');
            if (val === '' || val == null || isEmptyPick || isEmptyBingo || isEmptyBattleScore || (typeof val==='object' && !Array.isArray(val.values) && !Object.keys(val).length)) {
              delete mPerson[pid];
            } else {
              mPerson[pid] = val;
            }
          });

          mSlot.person = mPerson;
          if (slot?.shared && typeof slot.shared === 'object') {
            const clonedShared = JSON.parse(JSON.stringify(slot.shared));
            if (evDef?.template === 'bingo') {
              const mergedShared = { ...(mSlot.shared || {}) };
              Object.entries(clonedShared).forEach(([sharedKey, sharedVal]) => {
                if (sharedKey === 'largeBingoOrders' || sharedKey === 'largeBingoLeaders') {
                  const prevMap = { ...(mergedShared[sharedKey] || {}) };
                  Object.entries(sharedVal && typeof sharedVal === 'object' ? sharedVal : {}).forEach(([roomKey, roomVal]) => {
                    if (isBingoSharedTouched(evId, roomKey)) prevMap[roomKey] = roomVal;
                  });
                  mergedShared[sharedKey] = prevMap;
                } else {
                  mergedShared[sharedKey] = sharedVal;
                }
              });
              mSlot.shared = mergedShared;
            } else {
              mSlot.shared = { ...(mSlot.shared || {}), ...clonedShared };
            }
          }
          merged[evId] = mSlot;
        });

        return merged;
      };

      let merged = {};
      try {
        await runTransaction(db, async (tx) => {
          const ref = doc(db, 'events', targetEventId);
          const snap = await tx.get(ref);
          const freshBase = (snap.exists() && snap.data()?.eventInputs && typeof snap.data().eventInputs === 'object')
            ? snap.data().eventInputs
            : {};
          merged = buildMergedEventInputs(freshBase);
          tx.update(ref, {
            eventInputs: merged,
            inputsUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
      } catch (txErr) {
        console.warn('[PlayerEventInput] eventInputs transaction failed; fallback to direct update:', txErr);
        merged = buildMergedEventInputs(inputsByEventServer || {});
        if (typeof updateEventImmediate === 'function') {
          await updateEventImmediate({ eventInputs: merged, inputsUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp() }, false);
        } else {
          await updateDoc(doc(db, 'events', targetEventId), { eventInputs: merged, inputsUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        }
      }
      const savedClone = cloneEventInputs(merged);
      pendingSavedInputsSigRef.current = stringifyEventInputs(savedClone);
      hydrateDraftFromServer(savedClone);
      if (activeEventStorageId) {
        const nextPack = {
          inputs: savedClone,
          resetTokens: { ...liveEventInputResetTokens },
        };
        setServerInputsCachePack(nextPack);
        writePlayerScopedJson(activeEventStorageId, 'eventInputsServerCachePack', nextPack);
        if (hasMeaningfulEventInputs(savedClone)) {
          writePlayerScopedJson(activeEventStorageId, 'eventInputsDraftCache', savedClone);
        } else {
          removePlayerScoped(activeEventStorageId, 'eventInputsDraftCache');
        }
      }
      setDirty(false);
      try {
        diagMerge('playerEventInput', { lastSaveAt: Date.now(), eventId: activeEventStorageId || '', savedEventInputsCount: Object.keys(savedClone || {}).length });
        diagPush('timeline', { type: 'playerEventInput.saveDraft:success', eventId: activeEventStorageId || '', savedEventInputsCount: Object.keys(savedClone || {}).length });
      } catch {}
      alert('저장되었습니다.');
    }catch(e){
      console.error('saveDraft error', e);
      try { diagPush('timeline', { type: 'playerEventInput.saveDraft:fail', eventId: activeEventStorageId || '', error: String(e?.message || e || '') }); } catch {}
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  useEffect(() => {
    const roomPids = new Set(roomMembers.filter(Boolean).map(p => String(p.id)));

    const draftEmpty = !hasMeaningfulEventInputs(draft);
    const serverHasData = hasMeaningfulEventInputs(inputsByEventServer);
    if (!draftTouchedRef.current && draftEmpty && serverHasData) {
      setDirty(false);
      return;
    }

    const eq = (a, b) => a === b;
    const toNumOrNull = (x) => {
      if (x === '' || x == null) return null;
      const n = Number(x);
      return Number.isFinite(n) ? n : null;
    };

    const hasDiff = () => {
      for (const ev of events) {
        const evId = ev.id;
        const isAccum = ev.inputMode === 'accumulate';
        const attempts = Math.max(2, Math.min(Number(ev.attempts || 4), 20));

        const dSlot = draft?.[evId]?.person || {};
        const sSlot = inputsByEventServer?.[evId]?.person || {};

        if (ev.template === 'group-room-hole-battle') {
          const dShared = JSON.stringify(getBattleSharedInputs(draft?.[evId] || {}));
          const sShared = JSON.stringify(getBattleSharedInputs(inputsByEventServer?.[evId] || {}));
          if (!eq(dShared, sShared)) return true;
          const relevant = getGroupRoomBattleScoreParticipants(ev, participants, { roomNames, roomCount: allRoomNos.length || roomNames.length || 0, currentRoomNo: roomIdx, currentParticipantId: selfParticipantId, currentParticipantNickname: String(selfParticipant?.nickname || '') });
          const holes = Array.isArray(ev?.params?.selectedHoles) ? ev.params.selectedHoles : [];
          for (const p of relevant) {
            const pid = String(p?.id || '');
            const baseArr = holes.map((holeNo) => {
              const raw = inputsByEventServer?.[evId]?.person?.[pid]?.values?.[Number(holeNo) - 1];
              if (raw === '' || raw == null) return '';
              const n = Number(raw);
              return Number.isFinite(n) ? String(n) : '';
            });
            const draftArr = holes.map((holeNo) => {
              const raw = draft?.[evId]?.person?.[pid]?.values?.[Number(holeNo) - 1];
              if (raw === '' || raw == null) return '';
              const n = Number(raw);
              return Number.isFinite(n) ? String(n) : '';
            });
            if (baseArr.length !== draftArr.length) return true;
            for (let i = 0; i < draftArr.length; i += 1) {
              if (!eq(baseArr[i], draftArr[i])) return true;
            }
          }
          continue;
        }

        for (const pid of roomPids) {
          if (ev.template === 'pick-lineup') {
            const requiredCount = getPickLineupRequiredCount(ev);
            const baseArr = getServerPickIds(evId, pid, requiredCount);
            const dArr = padPickIds(normalizeMemberIds(dSlot?.[pid]), requiredCount);
            if (dArr.length !== baseArr.length) return true;
            for (let i = 0; i < dArr.length; i += 1) {
              if (!eq(dArr[i], baseArr[i])) return true;
            }
          } else if (ev.template === 'bingo') {
            const selectedHoles = normalizeBingoSelectedHoles(ev?.params?.selectedHoles);
            const baseState = extractBingoPersonInput(sSlot?.[pid], selectedHoles);
            const draftState = extractBingoPersonInput(dSlot?.[pid], selectedHoles);
            const baseVals = baseState.values.map((x) => {
              if (x === '' || x == null) return '';
              const n = Number(x);
              return Number.isFinite(n) ? String(n) : '';
            });
            const draftVals = draftState.values.map((x) => {
              if (x === '' || x == null) return '';
              const n = Number(x);
              return Number.isFinite(n) ? String(n) : '';
            });
            if (baseVals.length !== draftVals.length) return true;
            for (let i = 0; i < draftVals.length; i += 1) {
              if (!eq(draftVals[i], baseVals[i])) return true;
            }
            const baseBoard = normalizeBingoBoard(baseState.board, selectedHoles).map((x) => String(x || ''));
            const draftBoard = normalizeBingoBoard(draftState.board, selectedHoles).map((x) => String(x || ''));
            if (baseBoard.length !== draftBoard.length) return true;
            for (let i = 0; i < draftBoard.length; i += 1) {
              if (!eq(draftBoard[i], baseBoard[i])) return true;
            }
            if (!!draftState.roomShared !== !!baseState.roomShared) return true;
          } else if (isAccum) {
            const baseArr = getServerAccum(evId, pid, attempts);
            const dVals = (() => {
              const v = dSlot?.[pid]?.values;
              const arr = Array.isArray(v) ? [...v] : [];
              while (arr.length < attempts) arr.push('');
              return arr.map((x) => {
                if (x === '' || x == null) return '';
                const n = Number(x);
                return Number.isFinite(n) ? String(n) : '';
              });
            })();

            if (dVals.length !== baseArr.length) return true;
            for (let i = 0; i < dVals.length; i += 1) {
              if (!eq(dVals[i], baseArr[i])) return true;
            }
          } else {
            const sNum = getServerSingle(evId, pid);
            const dRaw = dSlot?.[pid];
            const dNum = toNumOrNull(dRaw);
            if (!eq(sNum ?? null, dNum ?? null)) return true;
          }
        }
      }
      return false;
    };

    setDirty(hasDiff());
  }, [draft, inputsByEventServer, roomMembers, events]);

  return (
    <div className={baseCss.page}>
      <div className={baseCss.content}>

        {events.map(ev => {
          const isHoleRankForce = ev.template === 'hole-rank-force';
          const isBingo = ev.template === 'bingo';
          const selectedHoles = isHoleRankForce ? normalizeSelectedHoles(ev?.params?.selectedHoles) : [];
          const bingoSelectedHoles = isBingo ? normalizeBingoSelectedHoles(ev?.params?.selectedHoles) : [];
          const forcedRanks = isHoleRankForce ? normalizeForcedRanks(ev?.params?.forcedRanks) : {};
          const hasForcedViewer = isHoleRankForce && Object.keys(forcedRanks || {}).length > 0;
          const isAccum  = isHoleRankForce ? true : (ev.inputMode === 'accumulate');
          const attempts = isHoleRankForce ? selectedHoles.length : Math.max(2, Math.min(Number(ev.attempts || 4), 20));
          const NICK_PCT = 35;
          const ONE_PCT  = isHoleRankForce ? Math.max(10, 53 / Math.max(selectedHoles.length || 1, 1)) : (65 / 4);
          const TOTAL_PCT = isHoleRankForce ? 12 : 0;
          const tableWidthPct = isAccum ? (NICK_PCT + attempts * ONE_PCT + TOTAL_PCT) : 100;
          const bonusOpts = (ev.template === 'range-convert-bonus' && Array.isArray(ev.params?.bonus)) ? ev.params.bonus : [];
          const pickCfg = ev.template === 'pick-lineup' ? getPickLineupConfig(ev) : null;
          const orderedRoomRows = orderSlotsByPairs(
            participants.filter((p) => Number(p?.room) === (Number.isFinite(roomIdx) ? roomIdx : NaN)),
            participants
          );

          const rawSubtotal = isHoleRankForce
            ? selectedHoles.map((holeNo) => {
                let sum = 0;
                let hasAny = false;
                orderedRoomRows.forEach((p) => {
                  const raw = p ? (inputsByEventServer?.[ev.id]?.person?.[p.id]?.values?.[holeNo - 1] ?? '') : '';
                  const n = Number(raw);
                  if (Number.isFinite(n)) {
                    sum += n;
                    hasAny = true;
                  }
                });
                return { holeNo, sum, hasAny };
              })
            : [];
          const rawGrandTotal = rawSubtotal.reduce((acc, item) => acc + (Number.isFinite(item.sum) ? item.sum : 0), 0);
          const rawGrandHasAny = rawSubtotal.some((item) => item.hasAny);

          const forcedData = hasForcedViewer
            ? computeHoleRankForce(ev, participants, inputsByEvent, { roomNames })
            : null;
          const forcedRoom = hasForcedViewer
            ? (forcedData?.rooms || []).find((room) => Number(room?.roomNo) === Number(roomIdx))
            : null;
          const forcedSubtotal = forcedRoom
            ? selectedHoles.map((holeNo) => {
                let sum = 0;
                let hasAny = false;
                (forcedRoom?.slots || []).forEach((slot) => {
                  const n = Number(slot?.effectiveHoleScores?.[holeNo]);
                  if (Number.isFinite(n)) {
                    sum += n;
                    hasAny = true;
                  }
                });
                return { holeNo, sum, hasAny };
              })
            : [];
          const forcedGrandTotal = forcedSubtotal.reduce((acc, item) => acc + (Number.isFinite(item.sum) ? item.sum : 0), 0);
          const forcedGrandHasAny = forcedSubtotal.some((item) => item.hasAny);


          if (ev.template === 'hidden-event') {
            const hiddenCfg = normalizeHiddenEventParams(ev?.params);
            const hiddenLocked = !!hiddenCfg.selectionLocked;
            const mine = selfParticipant || participantById.get(String(selfParticipantId ?? ''));
            const mineId = String(mine?.id || '');
            const hiddenDraftSlot = (inputsByEvent?.[ev.id] && typeof inputsByEvent[ev.id] === 'object') ? inputsByEvent[ev.id] : {};
            const hiddenServerSlot = (inputsByEventServer?.[ev.id] && typeof inputsByEventServer[ev.id] === 'object') ? inputsByEventServer[ev.id] : {};
            const hiddenEffectiveSlot = Object.keys(hiddenDraftSlot || {}).length ? hiddenDraftSlot : hiddenServerSlot;
            const hiddenData = computeHiddenEvent(ev, participants, hiddenEffectiveSlot, { roomNames, roomCount: allRoomNos.length || roomNames.length || 0 });
            const hiddenRoomLabel = (p) => {
              const n = Number(p?.room ?? 0);
              if (!Number.isFinite(n) || n < 1) return '-';
              return (roomNames?.[n - 1] && String(roomNames[n - 1]).trim()) ? String(roomNames[n - 1]).trim() : `${n}번방`;
            };
            const getHiddenCandidates = () => {
              const arr = (Array.isArray(participants) ? [...participants] : []).filter((p) => String(p?.id || '') !== mineId);
              arr.sort((a, b) => {
                const groupDiff = (Number(getParticipantGroupNo(a) || 999) - Number(getParticipantGroupNo(b) || 999));
                if (groupDiff) return groupDiff;
                const roomDiff = (Number(a?.room ?? 999) - Number(b?.room ?? 999));
                if (roomDiff) return roomDiff;
                return String(a?.nickname || '').localeCompare(String(b?.nickname || ''), 'ko');
              });
              return arr;
            };
            const hiddenSelectStyle = (key) => ({
              height: 38,
              border: hiddenSelectFocusId === key ? '2px solid #2563eb' : '1px solid #d7dfec',
              borderRadius: 10,
              padding: '0 10px',
              fontSize: 14,
              background: '#fff',
              outline: 'none',
              boxSizing: 'border-box',
              width: '100%',
            });

            if (hiddenCfg.mode === 'fourball') {
              const isSelfFourball = hiddenCfg.fourballMode === 'self';
              const pairs = isSelfFourball
                ? (hiddenData?.pairMap || {})
                : normalizeHiddenFourballPairs(hiddenEffectiveSlot?.shared?.hiddenFourballPairs || hiddenServerSlot?.shared?.hiddenFourballPairs || {});
              const minePairId = mineId ? pairs[mineId] : '';
              const minePair = minePairId ? participantById.get(String(minePairId)) : null;
              const rows = Array.isArray(hiddenData?.teamRows) ? hiddenData.teamRows : [];
              const hiddenPairCfg = { pairGroups: hiddenCfg.pairGroups };
              const pairLabelA = getRankScorePairGroupLabel(hiddenCfg.pairGroups, 'A');
              const pairLabelB = getRankScorePairGroupLabel(hiddenCfg.pairGroups, 'B');
              const pairHeaderA = splitRankScorePairLabel(pairLabelA);
              const pairHeaderB = splitRankScorePairLabel(pairLabelB);
              const mineSide = mine ? getRankScoreGroupSide(mine, hiddenPairCfg) : '';
              const hasHiddenPairCandidates = isSelfFourball && mine && !!mineSide && !minePairId && !hiddenLocked && (participants || []).some((p) => {
                const pid = String(p?.id ?? '');
                if (!pid || pid === String(mine.id)) return false;
                if (pairs[pid]) return false;
                return getRankScoreGroupSide(p, hiddenPairCfg) && getRankScoreGroupSide(p, hiddenPairCfg) !== mineSide;
              });

              return (
                <div key={ev.id} className={`${baseCss.card} ${tCss.eventCard}`}>
                  <div className={baseCss.cardHeader}>
                    <div className={`${baseCss.cardTitle} ${tCss.eventTitle}`}>{ev.title}</div>
                  </div>

                  <div style={{ padding: '0 12px 12px' }}>
                    <div style={{ border: '1px solid #dbe7ff', background: '#f5f8ff', borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 1.45, color: '#344054' }}>
                      <b style={{ color: '#1d4ed8' }}>히든 포볼</b> · {isSelfFourball ? '참가자가 버튼을 누르면 비밀리에 무작위 2인팀 배정' : '운영자가 비밀로 2인1팀 배정한 뒤, 추후 오픈'}
                    </div>

                    {isSelfFourball && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
                        <div style={{ fontSize: 15, fontWeight: 900, color: '#183153' }}>포볼팀 배정 현황</div>
                        <button
                          type="button"
                          onClick={() => handleHiddenFourballRandomPick(ev, hiddenCfg)}
                          disabled={!mine || !!minePairId || !hasHiddenPairCandidates || hiddenLocked}
                          style={{
                            width: 92,
                            height: 32,
                            borderRadius: 10,
                            border: '1px solid #bcd0ff',
                            background: '#eef4ff',
                            color: '#2457d6',
                            fontSize: 12,
                            fontWeight: 800,
                            opacity: (!mine || !!minePairId || !hasHiddenPairCandidates || hiddenLocked) ? 0.5 : 1,
                            pointerEvents: (!mine || !!minePairId || !hasHiddenPairCandidates || hiddenLocked) ? 'none' : undefined,
                          }}
                        >
                          {minePair ? '배정완료' : '포볼선택'}
                        </button>
                      </div>
                    )}

                    {minePair && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>
                        내 팀원: {minePair.nickname || '-'}
                      </div>
                    )}

                    {hiddenLocked && isSelfFourball && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#be123c', fontWeight: 800 }}>
                        선택이 마감되어 더 이상 수정할 수 없습니다.
                      </div>
                    )}

                    {!hiddenCfg.revealed && (
                      <div style={{ marginTop: 10, border: '1px dashed #d7dfec', borderRadius: 12, padding: 12, fontSize: 13, color: '#667085' }}>
                        {minePair ? '비공개 팀 배정 완료, 공개 전까지 팀원은 숨김 처리' : (isSelfFourball ? '아직 포볼팀이 배정되지 않았습니다.' : '아직 운영자 포볼팀 배정 전입니다.')}
                      </div>
                    )}

                    {hiddenCfg.revealed && (
                      <div className={`${baseCss.tableWrap} ${tCss.noOverflow}`} style={{ marginTop: 10 }}>
                        <table className={tCss.table} style={{ width: '100%' }}>
                          <colgroup>
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '34%' }} />
                            <col style={{ width: '34%' }} />
                            <col style={{ width: '18%' }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>팀</th>
                              <th>
                                {pairHeaderA.title}<span style={{ fontWeight: 400 }}> {pairHeaderA.groups}</span>
                              </th>
                              <th>
                                {pairHeaderB.title}<span style={{ fontWeight: 400 }}> {pairHeaderB.groups}</span>
                              </th>
                              <th>G합계</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.length === 0 && (
                              <tr><td colSpan={4} style={{ color: '#999' }}>{isSelfFourball ? '아직 배정된 팀이 없습니다.' : '배정된 팀이 없습니다.'}</td></tr>
                            )}
                            {rows.map((row, idx) => {
                              const members = Array.isArray(row.members) ? row.members : [];
                              const left = members.find((m) => getRankScoreGroupSide(m, hiddenPairCfg) === 'A') || members[0] || null;
                              const right = members.find((m) => getRankScoreGroupSide(m, hiddenPairCfg) === 'B') || members.find((m) => String(m?.id || '') !== String(left?.id || '')) || null;
                              const hdSum = Number(left?.handicap || 0) + Number(right?.handicap || 0);
                              return (
                                <tr key={`hidden-fourball-${ev.id}-${row.key}`}>
                                  <td>{idx + 1}</td>
                                  <td>{left?.name || '-'}</td>
                                  <td>{right?.name || '-'}</td>
                                  <td style={{ color: '#d00000', fontWeight: 800 }}>{Number.isFinite(hdSum) ? hdSum : '-'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            const mySelection = mineId ? (hiddenEffectiveSlot?.person?.[mineId] || hiddenServerSlot?.person?.[mineId] || null) : null;
            const selectedOpponentId = getHiddenOpponentId(mySelection);
            const selectedOpponent = selectedOpponentId ? participantById.get(String(selectedOpponentId)) : null;
            const hiddenCandidates = getHiddenCandidates();
            const adjustment = (mine && selectedOpponent) ? getHiddenHandicapAdjustment(mine, selectedOpponent, hiddenCfg) : 0;
            const rows = Array.isArray(hiddenData?.matchRows) ? hiddenData.matchRows : [];
            const focusKey = `${ev.id}:hidden-personal`;

            return (
              <div key={ev.id} className={`${baseCss.card} ${tCss.eventCard}`}>
                <div className={baseCss.cardHeader}>
                  <div className={`${baseCss.cardTitle} ${tCss.eventTitle}`}>{ev.title}</div>
                </div>

                <div style={{ padding: '0 12px 12px' }}>
                  <div style={{ border: '1px solid #dbe7ff', background: '#f5f8ff', borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 1.45, color: '#344054' }}>
                    <b style={{ color: '#1d4ed8' }}>히든 1대1</b> · 상대를 비밀리에 선택, 운영자가 공개전 까지 숨김처리
                  </div>

                  <label style={{ display: 'grid', gap: 6, marginTop: 10, fontSize: 12, fontWeight: 900, color: '#344054' }}>
                    내 히든 상대 선택
                    <select
                      value={selectedOpponentId}
                      onChange={(e) => patchHiddenOpponent(ev.id, e.target.value)}
                      onFocus={() => setHiddenSelectFocusId(focusKey)}
                      onBlur={() => setHiddenSelectFocusId('')}
                      disabled={!mineId || hiddenLocked}
                      style={hiddenSelectStyle(focusKey)}
                    >
                      <option value="">상대 선택</option>
                      {hiddenCandidates.map((p) => (
                        <option key={`hidden-candidate-${ev.id}-${p.id}`} value={p.id}>
                          {getParticipantGroupNo(p) ? `${getParticipantGroupNo(p)}조 · ` : ''}{p.nickname || '-'} {p.room ? `(${hiddenRoomLabel(p)})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedOpponent && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#667085', lineHeight: 1.45 }}>
                      선택 완료: <b>{selectedOpponent.nickname}</b> · 조간 추가 G핸디 <b>{adjustment > 0 ? '+' : ''}{adjustment}</b>
                    </div>
                  )}

                  {hiddenLocked && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#be123c', fontWeight: 800 }}>
                      선택이 마감되어 더 이상 수정할 수 없습니다.
                    </div>
                  )}

                  {!hiddenCfg.revealed && (
                    <div style={{ marginTop: 10, border: '1px dashed #d7dfec', borderRadius: 12, padding: 12, fontSize: 13, color: '#667085' }}>
                      전체 지목 결과 비공개, 운영자가 공개하면 확인 가능
                    </div>
                  )}

                  {hiddenCfg.revealed && (
                    <div className={`${baseCss.tableWrap} ${tCss.noOverflow}`} style={{ marginTop: 10 }}>
                      <table className={tCss.table} style={{ width: '100%', tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: '32%' }} />
                          <col style={{ width: '32%' }} />
                          <col style={{ width: '18%' }} />
                          <col style={{ width: '18%' }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>선택자</th>
                            <th>상대방</th>
                            <th>결과</th>
                            <th>승패</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!rows.length && <tr><td colSpan={4} style={{ color: '#999' }}>선택된 상대가 없습니다.</td></tr>}
                          {rows.map((row) => (
                            <tr key={`hidden-personal-${ev.id}-${row.key}`}>
                              <td>{row.name}</td>
                              <td>{row.opponentName}</td>
                              <td>{row.value} : {row.opponentValue}</td>
                              <td style={{ fontWeight: 900, color: row.status === 'win' ? '#1d4ed8' : row.status === 'lose' ? '#be123c' : '#64748b' }}>{row.resultText}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (ev.template === 'rank-score-game') {
            const rankCfg = normalizeRankScoreGameParams(ev?.params);
            const isManualRank = rankCfg.rankingSource === 'manual';
            const isPairGame = rankCfg.gameType === 'randomPair';
            const rankPairs = getRankScorePairMap(ev.id);
            const mine = selfParticipant || participantById.get(String(selfParticipantId ?? ''));
            const minePairId = mine ? rankPairs[String(mine.id)] : '';
            const minePair = minePairId ? participantById.get(String(minePairId)) : null;
            const mineSide = mine ? getRankScoreGroupSide(mine, rankCfg) : '';
            const pairRows = getRankScorePairRows(ev.id);
            const pairLabelA = getRankScorePairGroupLabel(rankCfg.pairGroups, 'A');
            const pairLabelB = getRankScorePairGroupLabel(rankCfg.pairGroups, 'B');
            const pairHeaderA = splitRankScorePairLabel(pairLabelA);
            const pairHeaderB = splitRankScorePairLabel(pairLabelB);
            const hasPairCandidates = mine && !minePairId && (participants || []).some((p) => {
              const pid = String(p?.id ?? '');
              if (!pid || pid === String(mine.id)) return false;
              if (rankPairs[pid]) return false;
              return getRankScoreGroupSide(p, rankCfg) && getRankScoreGroupSide(p, rankCfg) !== mineSide;
            });

            return (
              <div key={ev.id} className={`${baseCss.card} ${tCss.eventCard}`}>
                <div className={baseCss.cardHeader}>
                  <div className={`${baseCss.cardTitle} ${tCss.eventTitle}`}>{ev.title}</div>
                </div>

                {isManualRank && (
                  <>
                    <div className={`${baseCss.tableWrap} ${tCss.noOverflow}`}>
                      <table className={tCss.table} style={{ width: '100%' }}>
                        <colgroup>
                          <col style={{ width: `${NICK_PCT}%` }} />
                          <col style={{ width: '65%' }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>닉네임</th>
                            <th>순위</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderedRoomRows.map((p, rIdx) => {
                            const cellValue = p ? (inputsByEvent?.[ev.id]?.person?.[p.id] ?? '') : '';
                            return (
                              <tr key={`rank-score-${ev.id}-${rIdx}`}>
                                <td>{p ? p.nickname : ''}</td>
                                <td className={tCss.cellEditable}>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    className={tCss.cellInput}
                                    value={cellValue}
                                    onChange={(e) => p && patchValue(ev.id, p.id, e.target.value)}
                                    onBlur={(e) => p && finalizeValue(ev.id, p.id, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                    placeholder="예: 1, 2, 3"
                                    data-focus-evid={ev.id}
                                    data-focus-pid={p ? p.id : ''}
                                    data-focus-idx={0}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {isPairGame && (
                  <div style={{ padding: isManualRank ? '10px 0 0' : '0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0 12px 8px', paddingTop: 4 }}>
                      <div style={{ fontSize: 15, fontWeight: 900, color: '#183153' }}>포볼팀 배정 현황</div>
                      <button
                        type="button"
                        onClick={() => handleRankScorePairPick(ev.id, rankCfg)}
                        disabled={!mine || !!minePairId || !hasPairCandidates}
                        style={{
                          width: 92,
                          height: 32,
                          borderRadius: 10,
                          marginTop: 4,
                          border: '1px solid #bcd0ff',
                          background: '#eef4ff',
                          color: '#2457d6',
                          fontSize: 12,
                          fontWeight: 800,
                          opacity: (!mine || !!minePairId || !hasPairCandidates) ? 0.5 : 1,
                          pointerEvents: (!mine || !!minePairId || !hasPairCandidates) ? 'none' : undefined,
                        }}
                      >
                        {minePair ? '배정완료' : '포볼선택'}
                      </button>
                    </div>

                    {minePair && (
                      <div style={{ margin: '0 12px 8px', fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>
                        내 팀원: {minePair.nickname || '-'}
                      </div>
                    )}

                    <div className={`${baseCss.tableWrap} ${tCss.noOverflow}`}>
                      <table className={tCss.table} style={{ width: '100%' }}>
                        <colgroup>
                          <col style={{ width: '14%' }} />
                          <col style={{ width: '34%' }} />
                          <col style={{ width: '34%' }} />
                          <col style={{ width: '18%' }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>팀</th>
                            <th>
                              {pairHeaderA.title}<span style={{ fontWeight: 400 }}> {pairHeaderA.groups}</span>
                            </th>
                            <th>
                              {pairHeaderB.title}<span style={{ fontWeight: 400 }}> {pairHeaderB.groups}</span>
                            </th>
                            <th>G합계</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pairRows.length === 0 && (
                            <tr>
                              <td colSpan={4} style={{ color: '#999' }}>아직 배정된 팀이 없습니다.</td>
                            </tr>
                          )}
                          {pairRows.map((row, idx) => {
                            const aSide = getRankScoreGroupSide(row.a, rankCfg);
                            const left = aSide === 'A' ? row.a : row.b;
                            const right = aSide === 'A' ? row.b : row.a;
                            const hdSum = Number(left?.handicap || 0) + Number(right?.handicap || 0);
                            return (
                              <tr key={`rank-pair-${ev.id}-${idx}`}>
                                <td>{idx + 1}</td>
                                <td>{left?.nickname || '-'}</td>
                                <td>{right?.nickname || '-'}</td>
                                <td style={{ color: '#d00000', fontWeight: 800 }}>{Number.isFinite(hdSum) ? hdSum : '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          if (ev.template === 'group-room-hole-battle') {
            const battleCfg = normalizeGroupRoomHoleBattleParams(ev?.params, { participants, roomNames, roomCount: allRoomNos.length || roomNames.length || 0 });
            const battleSelectedHoles = Array.isArray(battleCfg.selectedHoles) ? battleCfg.selectedHoles : [];
            const battleLocked = !!ev?.params?.selectionLocked;
            const battleScoreParticipants = getGroupRoomBattleScoreParticipants(ev, participants, {
              roomNames,
              roomCount: allRoomNos.length || roomNames.length || 0,
              currentRoomNo: roomIdx,
              currentParticipantId: selfParticipantId,
              currentParticipantNickname: String(selfParticipant?.nickname || ''),
            });
            const battleData = computeGroupRoomHoleBattle(ev, participants, inputsByEvent?.[ev.id] || {}, {
              roomNames,
              roomCount: allRoomNos.length || roomNames.length || 0,
              currentRoomNo: roomIdx,
              currentParticipantId: selfParticipantId,
              currentParticipantNickname: String(selfParticipant?.nickname || ''),
            });
            const isBattleMatchLike = battleCfg.mode !== 'person' && (battleCfg.battleType === 'matchplay' || battleCfg.battleType === 'fourball');
            const isBattleRoomTeamSelection = battleCfg.mode === 'room' && isBattleMatchLike && battleCfg?.roomTeams?.selectionMode === 'team';
            const battleSelfRoomTeamKey = (() => {
              if (battleCfg.mode !== 'room' || !isBattleMatchLike) return '';
              const roomKey = String(roomIdx || '');
              const roomMode = String(battleCfg?.roomTeams?.roomAssignments?.[roomKey] || '').toUpperCase();
              if (roomMode === 'A' || roomMode === 'B') return roomMode;
              if (roomMode === 'SPLIT') {
                const split = String(battleCfg?.roomTeams?.splitMembers?.[String(selfParticipantId || '')] || '').toUpperCase();
                if (split === 'A' || split === 'B') return split;
              }
              return '';
            })();
            const battlePreviewData = isBattleMatchLike
              ? computeGroupRoomHoleBattle(ev, participants, inputsByEventServer?.[ev.id] || {}, {
                  roomNames,
                  roomCount: allRoomNos.length || roomNames.length || 0,
                  currentRoomNo: roomIdx,
                  currentParticipantId: selfParticipantId,
                  currentParticipantNickname: String(selfParticipant?.nickname || ''),
                })
              : battleData;
            const battleSelectionRows = (() => {
              if (battleCfg.mode === 'group') {
                if (battleLocked) {
                  return getGroupRoomHoleBattleRows(ev, participants, { roomNames, roomCount: allRoomNos.length || roomNames.length || 0 });
                }
                return Array.isArray(battleData.inputRows) ? battleData.inputRows : [];
              }
              if (battleCfg.mode === 'room') {
                const allRows = Array.isArray(battleData.inputRows) ? battleData.inputRows : [];
                if (isBattleRoomTeamSelection) {
                  if (battleLocked || !battleSelfRoomTeamKey) return allRows;
                  const mine = allRows.filter((row) => String(row?.roomTeamKey || '') === battleSelfRoomTeamKey);
                  return mine.length ? mine : allRows;
                }
                if (isBattleMatchLike) {
                  if (battleLocked) return allRows;
                  const splitRows = allRows.filter((row) => Number(row?.roomNo) === Number(roomIdx) && String(row?.roomTeamMode || '').toUpperCase() === 'SPLIT');
                  if (splitRows.length) return splitRows;
                  const mineTeamRows = battleSelfRoomTeamKey
                    ? allRows.filter((row) => String(row?.roomTeamKey || '') === battleSelfRoomTeamKey)
                    : [];
                  if (mineTeamRows.length) {
                    const ownRoomRows = mineTeamRows.filter((row) => Number(row?.roomNo) === Number(roomIdx));
                    return ownRoomRows.length ? ownRoomRows : mineTeamRows;
                  }
                }
                const mine = allRows.filter((row) => Number(row?.roomNo) === Number(roomIdx));
                return mine.length ? mine : allRows.slice(0, 1);
              }
              return Array.isArray(battleData.inputRows) ? battleData.inputRows : [];
            })();
            const battleSelectionWidth = Math.max(100, 110 + battleSelectedHoles.length * 72);
            const battleScoreWidth = Math.max(100, 110 + battleSelectedHoles.length * 62 + 54);
            const battlePreviewShowRank = battleCfg.mode === 'person';
            const battlePreviewAllRowsBase = (battleCfg.mode === 'person' || (battleCfg.mode === 'room' && isBattleMatchLike))
              ? (battlePreviewData.rows || [])
              : getGroupRoomHoleBattleRows(ev, participants, { roomNames, roomCount: allRoomNos.length || roomNames.length || 0 });
            const battlePreviewExpanded = !!battlePreviewExpandedMap?.[ev.id];
            const battlePreviewRowsBase = (() => {
              if (battleCfg.mode !== 'room' || isBattleMatchLike || battlePreviewExpanded || isBattleRoomTeamSelection) return battlePreviewAllRowsBase;
              const mine = battlePreviewAllRowsBase.find((row) => Number(row?.roomNo) === Number(roomIdx));
              if (mine) return [mine];
              return battlePreviewAllRowsBase.slice(0, 1);
            })();
            const battlePreviewRowsResolved = battlePreviewRowsBase.map((rowBase) => (battlePreviewData.rows || []).find((item) => String(item?.key) === String(rowBase?.key)) || rowBase);
            const battlePreviewRankByKey = new Map((battlePreviewData.rows || []).map((row, idx) => [String(row?.key || ''), idx + 1]));
            const battlePreviewWidth = Math.max(100, 110 + battleSelectedHoles.length * 62 + 54 + (battlePreviewShowRank ? 54 : 0));
            const getBattleResultStyle = (hole) => {
              const text = String(hole?.displayValue || hole?.resultText || '');
              if (text === 'UP' || /UP$/.test(text)) return { color: '#dc2626', fontWeight: 800 };
              if (text === 'DOWN' || /DOWN$/.test(text)) return { color: '#2563eb', fontWeight: 800 };
              if (text === 'AS') return { color: '#111827', fontWeight: 800 };
              return null;
            };
            const canEditBattleSelection = (row) => {
              if (battleLocked) return false;
              if (battleCfg.mode !== 'group') return true;

              const memberIds = Array.isArray(row?.memberIds) ? row.memberIds.map(String).filter(Boolean) : [];
              const memberNames = (Array.isArray(row?.members) ? row.members : []).map((member) => String(member?.nickname || '').trim().toLowerCase()).filter(Boolean);
              const isMine = (selfParticipantId && memberIds.includes(selfParticipantId))
                || (selfParticipantNickname && memberNames.includes(selfParticipantNickname));
              if (!isMine) return false;

              const leaders = Array.isArray(row?.leaderIds) ? row.leaderIds.map(String).filter(Boolean) : [];
              if (!leaders.length) return true;

              const leaderNames = (Array.isArray(row?.leaders) ? row.leaders : []).map((member) => String(member?.nickname || '').trim().toLowerCase()).filter(Boolean);
              return (selfParticipantId && leaders.includes(selfParticipantId))
                || (selfParticipantNickname && leaderNames.includes(selfParticipantNickname));
            };
            const battleScoreSubtotal = battleSelectedHoles.map((holeNo) => {
              let sum = 0;
              let hasAny = false;
              battleScoreParticipants.forEach((member) => {
                const raw = inputsByEvent?.[ev.id]?.person?.[member?.id]?.values?.[holeNo - 1] ?? '';
                const n = Number(raw);
                if (Number.isFinite(n)) {
                  sum += n;
                  hasAny = true;
                }
              });
              return { holeNo, sum, hasAny };
            });
            const battleScoreGrandTotal = battleScoreSubtotal.reduce((acc, item) => acc + (Number.isFinite(item.sum) ? item.sum : 0), 0);
            const battleScoreGrandHasAny = battleScoreSubtotal.some((item) => item.hasAny);
            const battlePreviewSubtotal = battleSelectedHoles.map((holeNo) => {
              if (isBattleMatchLike) {
                return { holeNo, sum: 0, hasAny: false };
              }
              let sum = 0;
              let hasAny = false;
              battlePreviewRowsResolved.forEach((row) => {
                const item = Array.isArray(row?.holes) ? row.holes.find((hole) => Number(hole?.holeNo) === Number(holeNo)) : null;
                const n = Number(item?.value);
                if (Number.isFinite(n)) {
                  sum += n;
                  hasAny = true;
                }
              });
              return { holeNo, sum, hasAny };
            });
            const battlePreviewGrandTotal = battlePreviewSubtotal.reduce((acc, item) => acc + (Number.isFinite(item.sum) ? item.sum : 0), 0);
            const battlePreviewGrandHasAny = battlePreviewSubtotal.some((item) => item.hasAny);

            return (
              <div key={ev.id} className={`${baseCss.card} ${tCss.eventCard}`}>
                <div className={baseCss.cardHeader}>
                  <div className={`${baseCss.cardTitle} ${tCss.eventTitle}`}>{ev.title}</div>
                </div>

                {battleLocked && <div className={tCss.lockNotice}>닉네임 선택 마감, 홀별 점수 입력은 가능</div>}

                <div className={`${baseCss.tableWrap} ${tCss.noOverflow}`}>
                  <table className={tCss.table} style={{ width: `${battleSelectionWidth}px` }}>
                    <colgroup>
                      <col style={{ width: '110px' }} />
                      {battleSelectedHoles.map((holeNo) => <col key={`battle-head-${holeNo}`} style={{ width: '72px' }} />)}
                    </colgroup>
                    <thead>
                      <tr>
                        <th>닉네임</th>
                        {battleSelectedHoles.map((holeNo) => <th key={`battle-head-cell-${holeNo}`}>{holeNo}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {battleSelectionRows.map((row) => (
                        <tr key={`battle-row-${row.key}`}>
                          <td className={tCss.pickInputNick}>{row.name}</td>
                          {battleSelectedHoles.map((holeNo) => {
                            const ids = isBattleRoomTeamSelection
                              ? (Array.isArray(row?.memberIds) ? row.memberIds.map(String).filter(Boolean) : [])
                              : getGroupRoomBattleCellIds(ev.id, row.key, holeNo, row.memberIds);
                            const buttonText = isBattleRoomTeamSelection ? String(row?.name || '') : getGroupRoomCellText(ids, participantById);
                            const editable = isBattleRoomTeamSelection ? false : canEditBattleSelection(row);
                            const canInspectLockedCell = battleLocked && (ids.length > 0 || isBattleRoomTeamSelection);
                            return (
                              <td key={`battle-cell-${row.key}-${holeNo}`} className={tCss.cellEditable}>
                                <div className={tCss.pickMenuHolder} onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    className={tCss.pickSelectButton}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!editable) return;
                                      const same = battleMenuState?.evId === ev.id && String(battleMenuState?.rowKey) === String(row.key) && Number(battleMenuState?.holeNo) === Number(holeNo) && !battleMenuState?.viewOnly;
                                      if (same) {
                                        setBattleMenuState(null);
                                        return;
                                      }
                                      openBattleMenuAt(ev.id, row.key, holeNo, row.members, e.currentTarget);
                                    }}
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      if (!canInspectLockedCell) return;
                                      startBattleInspectLongPress(ev.id, row.key, holeNo, row.members, e.currentTarget);
                                    }}
                                    onPointerUp={() => cancelEventLongPress(`battle:${ev.id}:${row.key}:${holeNo}`)}
                                    onPointerCancel={() => cancelEventLongPress(`battle:${ev.id}:${row.key}:${holeNo}`)}
                                    onPointerLeave={() => cancelEventLongPress(`battle:${ev.id}:${row.key}:${holeNo}`)}
                                    onTouchStart={(e) => {
                                      e.stopPropagation();
                                      if (!canInspectLockedCell) return;
                                      startBattleInspectLongPress(ev.id, row.key, holeNo, row.members, e.currentTarget);
                                    }}
                                    onTouchEnd={() => cancelEventLongPress(`battle:${ev.id}:${row.key}:${holeNo}`)}
                                    onTouchCancel={() => cancelEventLongPress(`battle:${ev.id}:${row.key}:${holeNo}`)}
                                    disabled={!battleLocked && !editable}
                                    title={isBattleRoomTeamSelection
                                      ? (Array.isArray(row?.members) ? row.members.map((member) => String(member?.nickname || '')).filter(Boolean).join(' / ') : String(buttonText || ''))
                                      : buttonText}
                                  >
                                    <span className={tCss.pickSelectText}>{buttonText}</span>
                                  </button>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className={`${baseCss.tableWrap} ${tCss.noOverflow}`} style={{ marginTop: 12 }}>
                  <table className={tCss.table} style={{ width: `${battleScoreWidth}px` }}>
                    <colgroup>
                      <col style={{ width: '110px' }} />
                      {battleSelectedHoles.map((holeNo) => <col key={`battle-score-col-${holeNo}`} style={{ width: '62px' }} />)}
                      <col style={{ width: '54px' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>닉네임</th>
                        {battleSelectedHoles.map((holeNo) => <th key={`battle-score-head-${holeNo}`}>{holeNo}</th>)}
                        <th>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {battleScoreParticipants.map((member) => {
                        const rowRawValues = battleSelectedHoles.map((holeNo) => inputsByEvent?.[ev.id]?.person?.[member?.id]?.values?.[holeNo - 1] ?? '');
                        const rowValues = rowRawValues.map((raw) => {
                          const n = Number(raw);
                          return Number.isFinite(n) ? n : 0;
                        });
                        const rowHasValue = rowRawValues.some((raw) => String(raw ?? '').trim() !== '');
                        const rowTotal = rowValues.reduce((sum, n) => sum + n, 0);
                        const rowTotalDisplay = rowHasValue ? formatDisplayNumber(rowTotal) : '';
                        return (
                          <tr key={`battle-score-row-${member?.id}`}>
                            <td>{member?.nickname || ''}</td>
                            {battleSelectedHoles.map((holeNo) => {
                              const valueIndex = holeNo - 1;
                              const cellValue = inputsByEvent?.[ev.id]?.person?.[member?.id]?.values?.[valueIndex] ?? '';
                              const inputKey = `${ev.id}:${member?.id}:${valueIndex}`;
                              return (
                                <td key={`battle-score-cell-${member?.id}-${holeNo}`} className={tCss.cellEditable}>
                                  <input
                                    ref={(el) => {
                                      if (el) eventInputRefs.current[inputKey] = el;
                                      else delete eventInputRefs.current[inputKey];
                                    }}
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    className={tCss.cellInput}
                                    value={cellValue}
                                    onChange={(e) => patchAccum(ev.id, member.id, valueIndex, e.target.value, 18)}
                                    onBlur={(e) => finalizeAccum(ev.id, member.id, valueIndex, e.target.value, 18)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      startEventLongMinus(ev.id, member.id, valueIndex, cellValue, 18);
                                    }}
                                    onPointerUp={() => cancelEventLongPress(inputKey)}
                                    onPointerCancel={() => cancelEventLongPress(inputKey)}
                                    onPointerLeave={() => cancelEventLongPress(inputKey)}
                                    onTouchStart={(e) => {
                                      e.stopPropagation();
                                      startEventLongMinus(ev.id, member.id, valueIndex, cellValue, 18);
                                    }}
                                    onTouchEnd={() => cancelEventLongPress(inputKey)}
                                    onTouchCancel={() => cancelEventLongPress(inputKey)}
                                  />
                                </td>
                              );
                            })}
                            <td className={tCss.totalCell}>{rowTotalDisplay}</td>
                          </tr>
                        );
                      })}
                      <tr className={tCss.subtotalRow}>
                        <td className={tCss.subtotalLabel}>소계</td>
                        {battleScoreSubtotal.map((item) => <td key={`battle-score-sub-${item.holeNo}`} className={tCss.subtotalBlue}>{item.hasAny ? formatDisplayNumber(item.sum) : ''}</td>)}
                        <td className={tCss.subtotalRed}>{battleScoreGrandHasAny ? formatDisplayNumber(battleScoreGrandTotal) : ''}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className={`${tCss.viewerWrap} ${getForcedPreviewPresetClass(tCss)}`}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0 12px 8px' }}>
                    <div className={tCss.viewerTitle} style={{ margin: 0 }}>선택 미리보기</div>
                    {battleCfg.mode === 'room' && !isBattleMatchLike && battlePreviewAllRowsBase.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setBattlePreviewExpandedMap((prev) => ({ ...prev, [ev.id]: !battlePreviewExpanded }))}
                        style={{ border: '1px solid #cbd8ea', background: '#fff', color: '#21457f', borderRadius: 10, padding: '6px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
                      >
                        {battlePreviewExpanded ? '접기' : '펼쳐보기'}
                      </button>
                    )}
                  </div>
                  <div className={`${baseCss.tableWrap} ${tCss.noOverflow} ${tCss.viewerTableWrap} ${tCss.previewFrame}`}>
                    <table className={tCss.table} style={{ width: `${battlePreviewWidth}px` }}>
                      <colgroup>
                        <col style={{ width: '110px' }} />
                        {battleSelectedHoles.map((holeNo) => <col key={`battle-preview-col-${holeNo}`} style={{ width: '62px' }} />)}
                        <col style={{ width: '54px' }} />
                        {battlePreviewShowRank && <col style={{ width: '54px' }} />}
                      </colgroup>
                      <thead>
                        <tr>
                          <th>닉네임</th>
                          {battleSelectedHoles.map((holeNo) => <th key={`battle-preview-head-${holeNo}`}>{holeNo}</th>)}
                          <th>합계</th>
                          {battlePreviewShowRank && <th>순위</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {battlePreviewRowsResolved.map((row) => {
                          const battleRowHasResult = Array.isArray(row?.holes)
                            && row.holes.some((item) => String(item?.displayValue || item?.resultText || '').trim());
                          return (
                            <tr key={`battle-preview-row-${row.key}`}>
                              <td>{row.name}</td>
                              {battleSelectedHoles.map((holeNo) => {
                                const hole = Array.isArray(row?.holes) ? row.holes.find((item) => Number(item?.holeNo) === Number(holeNo)) : null;
                                if (isBattleMatchLike) {
                                  const text = String(hole?.displayValue || hole?.resultText || '');
                                  return <td key={`battle-preview-cell-${row.key}-${holeNo}`} style={getBattleResultStyle(hole)}>{text}</td>;
                                }
                                const value = Number(hole?.value);
                                return <td key={`battle-preview-cell-${row.key}-${holeNo}`}>{Number.isFinite(value) ? formatDisplayNumber(value) : ''}</td>;
                              })}
                              <td className={tCss.totalCell} style={isBattleMatchLike && battleRowHasResult ? getBattleResultStyle({ displayValue: row.displayValue }) : null}>{isBattleMatchLike ? (battleRowHasResult ? (row.displayValue || '') : '') : formatDisplayNumber(row.value)}</td>
                              {battlePreviewShowRank && <td className={tCss.subtotalBlue}>{battlePreviewRankByKey.get(String(row?.key || '')) || ''}</td>}
                            </tr>
                          );
                        })}
                        {!isBattleMatchLike && (
                          <tr className={tCss.subtotalRow}>
                            <td className={tCss.subtotalLabel}>소계</td>
                            {battlePreviewSubtotal.map((item) => <td key={`battle-preview-sub-${item.holeNo}`} className={tCss.subtotalBlue}>{item.hasAny ? formatDisplayNumber(item.sum) : ''}</td>)}
                            <td className={tCss.subtotalRed}>{battlePreviewGrandHasAny ? formatDisplayNumber(battlePreviewGrandTotal) : ''}</td>
                            {battlePreviewShowRank && <td className={tCss.subtotalBlue}></td>}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          }

          if (isBingo) {
            const bingoBoardCellCount = normalizeBingoBoardCellCount(ev?.params?.boardCellCount);
            const bingoGridSize = getBingoGridSize(bingoBoardCellCount);
            const bingoScoreHoleCount = normalizeBingoScoreHoleCount(ev?.params?.scoreHoleCount);
            const bingoInputHoles = bingoScoreHoleCount === 18
              ? Array.from({ length: 18 }, (_, i) => i + 1)
              : bingoSelectedHoles;
            const bingoNickPct = 34;
            const bingoOnePct = Math.max(9.5, 54 / Math.max(bingoInputHoles.length || 1, 1));
            const bingoTotalPct = 12;
            const bingoTableWidthPct = bingoNickPct + bingoInputHoles.length * bingoOnePct + bingoTotalPct;
            const bingoSharedMode = getBingoRoomShared(ev.id);
            const bingoEditorPid = getBingoEditorPid(ev.id, bingoSelectedHoles);
            const bingoUi = getBingoUiForEvent(ev.id);
            const bingoEditorState = getBingoPersonState(ev.id, bingoEditorPid, bingoSelectedHoles);
            const bingoEditorBoard = normalizeBingoBoard(bingoEditorState.board, bingoSelectedHoles);
            const bingoSpecialZones = normalizeBingoSpecialZones(ev?.params?.specialZones, bingoBoardCellCount);
            const bingoLocked = !!ev?.params?.inputLocked;
            const bingoMinePid = String(selfParticipantId || ctxParticipant?.id || ctxParticipant?.uid || '');
            const bingoOwnSelected = !!bingoMinePid && String(bingoEditorPid || '') === String(bingoMinePid);
            const bingoCanEditBoard = !!bingoSharedMode || bingoOwnSelected;
            const bingoRawSubtotal = bingoInputHoles.map((holeNo) => {
              let sum = 0;
              let hasAny = false;
              orderedRoomRows.forEach((p) => {
                const raw = p ? (inputsByEventServer?.[ev.id]?.person?.[p.id]?.values?.[holeNo - 1] ?? '') : '';
                const n = Number(raw);
                if (Number.isFinite(n)) {
                  sum += n;
                  hasAny = true;
                }
              });
              return { holeNo, sum, hasAny };
            });
            const bingoRawGrandTotal = bingoRawSubtotal.reduce((acc, item) => acc + (Number.isFinite(item.sum) ? item.sum : 0), 0);
            const bingoRawGrandHasAny = bingoRawSubtotal.some((item) => item.hasAny);
            const bingoPreviewRows = roomMembers.filter(Boolean).map((p) => {
              const rowState = getBingoPersonStateSaved(ev.id, p.id, bingoSelectedHoles);
              const sharedState = getBingoPersonStateSaved(ev.id, bingoEditorPid, bingoSelectedHoles);
              const board = bingoSharedMode ? normalizeBingoBoard(sharedState.board, bingoSelectedHoles, bingoBoardCellCount) : normalizeBingoBoard(rowState.board, bingoSelectedHoles, bingoBoardCellCount);
              const holeValues = getBingoHoleValues(rowState.values, bingoSelectedHoles);
              return {
                pid: String(p.id),
                name: String(p.nickname || ''),
                board,
                holeValues,
                bingoCount: computeBingoCount(board, holeValues, bingoBoardCellCount),
              };
            });
            const bingoLargeOrder = getBingoLargeOrder(ev.id);
            const bingoLargePreview = bingoBoardCellCount === 9
              ? buildLargeBingoPreview(bingoPreviewRows, bingoLargeOrder, bingoSpecialZones)
              : null;
            const bingoLeaderId = getBingoLargeLeaderId(ev.id);
            const bingoMineId = String(selfParticipantId || ctxParticipant?.id || ctxParticipant?.uid || '');
            const bingoCanEditLarge = !!bingoLeaderId && !!bingoMineId && bingoLeaderId === bingoMineId;

            return (
              <div key={ev.id} className={`${baseCss.card} ${tCss.eventCard}`}>
                <div className={baseCss.cardHeader}>
                  <div className={`${baseCss.cardTitle} ${tCss.eventTitle}`}>{ev.title}</div>
                </div>

                {bingoLocked && <div className={tCss.lockNotice}>{bingoBoardCellCount === 9 ? 'Mini빙고판' : '빙고판 배치'} 입력 마감, 홀별 점수 입력은 가능</div>}

                <div className={`${baseCss.tableWrap} ${tCss.noOverflow}`}>
                  <table className={tCss.table} style={{ width: `${bingoTableWidthPct}%` }}>
                    <colgroup>
                      <col style={{ width: `${bingoNickPct}%` }} />
                      {bingoInputHoles.map((holeNo) => <col key={`bingo-col-${holeNo}`} style={{ width: `${bingoOnePct}%` }} />)}
                      <col style={{ width: `${bingoTotalPct}%` }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>닉네임</th>
                        {bingoInputHoles.map((holeNo) => (<th key={`bingo-head-${holeNo}`}>{holeNo}</th>))}
                        <th>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderedRoomRows.map((p, rIdx) => {
                        const rowRawValues = bingoInputHoles.map((holeNo) => (p ? (inputsByEventServer?.[ev.id]?.person?.[p.id]?.values?.[holeNo - 1] ?? '') : ''));
                        const rowValues = rowRawValues.map((raw) => {
                          const n = Number(raw);
                          return Number.isFinite(n) ? n : 0;
                        });
                        const rowHasValue = rowRawValues.some((raw) => String(raw ?? '').trim() !== '');
                        const rowTotal = rowValues.reduce((sum, n) => sum + n, 0);
                        const rowTotalDisplay = p ? (rowHasValue ? formatDisplayNumber(rowTotal) : '') : '';
                        return (
                          <tr key={`bingo-row-${rIdx}`}>
                            <td>{p ? p.nickname : ''}</td>
                            {bingoInputHoles.map((holeNo) => {
                              const valueIndex = holeNo - 1;
                              const cellValue = p ? getBingoInputCellValue(ev.id, p.id, valueIndex) : '';
                              const inputKey = `${ev.id}:${p ? p.id : 'empty'}:${valueIndex}`;
                              return (
                                <td key={`bingo-cell-${rIdx}-${holeNo}`} className={tCss.cellEditable}>
                                  <input
                                    ref={(el) => {
                                      if (el) eventInputRefs.current[inputKey] = el;
                                      else delete eventInputRefs.current[inputKey];
                                    }}
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    className={tCss.cellInput}
                                    value={cellValue}
                                    disabled={!p}
                                    onChange={e => p && patchAccum(ev.id, p.id, valueIndex, e.target.value, 18)}
                                    onBlur={e => p && finalizeAccum(ev.id, p.id, valueIndex, e.target.value, 18)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                    onPointerDown={(e) => {
                                      if (p) {
                                        e.stopPropagation();
                                        startEventLongMinus(ev.id, p.id, valueIndex, cellValue, 18);
                                      }
                                    }}
                                    onPointerUp={() => cancelEventLongPress(inputKey)}
                                    onPointerCancel={() => cancelEventLongPress(inputKey)}
                                    onPointerLeave={() => cancelEventLongPress(inputKey)}
                                    onTouchStart={(e) => {
                                      if (p) {
                                        e.stopPropagation();
                                        startEventLongMinus(ev.id, p.id, valueIndex, cellValue, 18);
                                      }
                                    }}
                                    onTouchEnd={() => cancelEventLongPress(inputKey)}
                                    onTouchCancel={() => cancelEventLongPress(inputKey)}
                                    data-focus-evid={ev.id}
                                    data-focus-pid={p ? p.id : ''}
                                    data-focus-idx={valueIndex}
                                  />
                                </td>
                              );
                            })}
                            <td className={tCss.totalCell}>{rowTotalDisplay}</td>
                          </tr>
                        );
                      })}
                      <tr className={tCss.subtotalRow}>
                        <td className={tCss.subtotalLabel}>합계</td>
                        {bingoRawSubtotal.map((item) => (
                          <td key={`bingo-sub-${item.holeNo}`} className={tCss.subtotalBlue}>
                            {item.hasAny ? formatDisplayNumber(item.sum) : ''}
                          </td>
                        ))}
                        <td className={tCss.subtotalRed}>{bingoRawGrandHasAny ? formatDisplayNumber(bingoRawGrandTotal) : ''}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ padding: '12px' }}>
                  <div style={{ border: '1px solid #dde6f2', borderRadius: 16, background: '#fff', padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                      <div style={{ fontSize: 17, fontWeight: 900, color: '#16376c' }}>{bingoBoardCellCount === 9 ? 'Mini빙고판' : '빙고판 배치'}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button
                          type="button"
                          disabled={bingoLocked}
                          onClick={() => randomizeBingoBoard(ev.id, bingoSelectedHoles)}
                          style={{ border: '1px solid #80a7ff', background: '#edf4ff', color: '#2457d6', fontWeight: 800, borderRadius: 8, padding: '7px 9px', fontSize: 12, opacity: bingoLocked ? 0.55 : 1 }}
                        >
                          랜덤배치
                        </button>
                        <button
                          type="button"
                          disabled={bingoLocked}
                          onClick={() => requestBingoCommonPlacement(ev.id, bingoSelectedHoles)}
                          style={{ border: '1px solid #f0a35a', background: '#fff4e6', color: '#b45309', fontWeight: 800, borderRadius: 8, padding: '7px 9px', fontSize: 12, opacity: bingoLocked ? 0.55 : 1 }}
                        >
                          공통배치
                        </button>
                        <button
                          type="button"
                          disabled={bingoLocked}
                          onClick={() => clearBingoBoard(ev.id, bingoSelectedHoles)}
                          style={{ border: '1px solid #f0a0a0', background: '#fff1f2', color: '#be123c', fontWeight: 800, borderRadius: 8, padding: '7px 9px', fontSize: 12, opacity: bingoLocked ? 0.55 : 1 }}
                        >
                          초기화
                        </button>
                      </div>
                    </div>

                    {(() => {
                      const commonState = bingoCommonPressState?.[ev.id] || {};
                      const commonCount = Number(commonState?.count || 0);
                      if (!commonCount || bingoLocked) return null;
                      const remain = Math.max(0, BINGO_COMMON_REQUIRED_PRESS_COUNT - commonCount);
                      return (
                        <div style={{ marginBottom: 10, border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', borderRadius: 10, padding: '8px 10px', fontSize: 12, fontWeight: 800, lineHeight: 1.45 }}>
                          이 메뉴는 다른 참가자가 입력한 모든 빙고판이 변경될 수 있습니다.
                          {remain > 0 ? ` 계속 진행하려면 공통배치를 ${remain}번 더 눌러주세요.` : ''}
                        </div>
                      );
                    })()}

                    {!bingoCanEditBoard && (
                      <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 700, color: '#b94a48' }}>
                        본인 빙고판만 입력/수정할 수 있습니다.
                      </div>
                    )}

                    {!bingoSharedMode && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
                        {roomMembers.filter(Boolean).map((p) => {
                          const active = String(bingoEditorPid) === String(p.id);
                          return (
                            <button
                              key={`bingo-tab-${p.id}`}
                              type="button"
                              onClick={() => setBingoActiveParticipant(ev.id, p.id)}
                              style={{ minHeight: 40, borderRadius: 999, border: active ? '1.5px solid #5d8df6' : '1px solid #222', background: active ? '#edf4ff' : '#fff', color: '#222', fontSize: 14, lineHeight: 1.15, fontWeight: 900, padding: '0 8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                              title={p.nickname}
                            >
                              {p.nickname}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${bingoGridSize}, minmax(0, 1fr))`, gap: 8, marginBottom: 8 }}>
                      {bingoEditorBoard.map((holeNo, idx) => {
                        const moveIndex = Number.isInteger(bingoUi?.moveIndex) ? bingoUi.moveIndex : -1;
                        const isMove = moveIndex === idx;
                        const isSpecial = bingoSpecialZones.includes(idx + 1);
                        return (
                          <button
                            key={`bingo-editor-${idx}`}
                            type="button"
                            tabIndex={-1}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              if (consumeBingoLongPress(ev.id, idx)) return;
                              if (bingoLocked) return;
                              applyBingoBoardCell(ev.id, bingoSelectedHoles, idx);
                            }}
                            onPointerDown={() => !bingoLocked && startBingoLongPress(ev.id, idx, !!holeNo)}
                            onPointerUp={() => cancelBingoLongPress(ev.id, idx)}
                            onPointerCancel={() => cancelBingoLongPress(ev.id, idx)}
                            onPointerLeave={() => cancelBingoLongPress(ev.id, idx)}
                            onTouchStart={() => !bingoLocked && startBingoLongPress(ev.id, idx, !!holeNo)}
                            onTouchEnd={() => cancelBingoLongPress(ev.id, idx)}
                            onTouchCancel={() => cancelBingoLongPress(ev.id, idx)}
                            style={{ aspectRatio: '1 / 1', borderRadius: 12, border: isMove ? '2px solid #5d8df6' : '1px solid #222', background: isMove ? '#edf4ff' : (isSpecial ? '#fff3a6' : '#fff'), fontSize: 30, fontWeight: 900, color: holeNo ? '#111' : '#b0b8c5', outline: 'none', WebkitTapHighlightColor: 'transparent', opacity: bingoLocked ? 0.72 : 1 }}
                          >
                            <span style={{ fontSize: holeNo ? 33 : 18, lineHeight: 1 }}>{holeNo || ''}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
                      빈칸을 누르면 선택된 홀 번호가 순서대로 들어갑니다. 수정할 때는 번호가 있는 칸을 길게 누른 뒤 이동할 칸을 터치해 주세요.
                    </div>
                  </div>

                  <div style={{ marginTop: 12, border: '1px solid #dde6f2', borderRadius: 16, background: '#f8fbff', padding: 12 }}>
                    <div style={{ fontSize: 17, fontWeight: 900, color: '#16376c', marginBottom: 10 }}>{bingoBoardCellCount === 9 ? '실시간 Mini빙고판 미리보기' : '실시간 빙고판 미리보기'}</div>
                    <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
                      {bingoPreviewRows.map((row) => (
                        <div key={`bingo-preview-${row.pid}`} style={{ flex: '0 0 100%', minWidth: '100%', scrollSnapAlign: 'start' }}>
                          <BingoPreviewCard
                            name={row.name}
                            bingoCount={row.bingoCount}
                            board={row.board}
                            holeValues={row.holeValues}
                            specialZones={bingoSpecialZones}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {bingoBoardCellCount === 9 && bingoLargePreview && (
                    <div style={{ marginTop: 12, border: '1px solid #e9d5ff', borderRadius: 16, background: '#fbf8ff', padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 17, fontWeight: 900, color: '#16376c' }}>Big빙고판 배치</div>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{bingoCanEditLarge ? '두 칸을 차례로 눌러 4명의 Mini빙고판 위치변경.' : '방 리더가 4명의 3×3 Mini빙고판 위치를 정합니다.'}</div>
                        </div>
                        <span style={{ border: '1px solid #c4b5fd', background: '#ede9fe', color: '#5b21b6', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 900 }}>{bingoCanEditLarge ? '리더' : '보기'}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
                        {bingoLargeOrder.map((pid, idx) => {
                          const member = roomMembers.filter(Boolean).find((p) => String(p.id) === String(pid));
                          const largeMoveIndex = Number.isInteger(bingoUi?.largeMoveIndex) ? bingoUi.largeMoveIndex : -1;
                          const active = largeMoveIndex === idx;
                          return (
                            <button
                              key={`large-order-${ev.id}-${idx}`}
                              type="button"
                              disabled={!bingoCanEditLarge || bingoLocked}
                              onClick={() => applyBingoLargeOrderSlot(ev.id, idx)}
                              style={{ minHeight: 42, borderRadius: 12, border: active ? '2px solid #7c3aed' : '1px solid #d8b4fe', background: active ? '#ede9fe' : '#fff', color: '#3b0764', fontWeight: 900, fontSize: 14, opacity: (!bingoCanEditLarge || bingoLocked) ? 0.72 : 1 }}
                            >
                              {idx + 1}. {member?.nickname || '-'}
                            </button>
                          );
                        })}
                      </div>
                      <LargeBingoPreviewCard total={bingoLargePreview.total} cells={bingoLargePreview.cells} />
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (pickCfg) {
            const requiredCount = getPickLineupRequiredCount(ev);
            const slotLabels = pickCfg.mode === 'jo'
              ? pickCfg.openGroups.map((groupNo) => `${groupNo}조`)
              : Array.from({ length: requiredCount }, (_, i) => `선택${i + 1}`);
            const isFourJo = pickCfg.mode === 'jo' && requiredCount === 4;
            const pickNickColPx = 108;
            const pickPreviewNickPx = pickCfg.mode === 'jo' ? 102 : 100;
            const pickPreviewTotalPx = 42;
            const locked = !!ev?.params?.selectionLocked;
            const previewRows = roomMembers.map((p) => {
              if (!p) return { selectorName: '', cells: slotLabels.map(() => ''), teamLine: '', handicapSum: '', hasAny: false };
              const rowIds = padPickIds(normalizeMemberIds(inputsByEvent?.[ev.id]?.person?.[p.id]), requiredCount);
              const members = rowIds.map((id) => participantById.get(String(id))).filter(Boolean);
              const cells = [members.map((m) => String(m.nickname || '')).filter(Boolean).join(' / ')];
              const handicapSum = members.reduce((sum, m) => {
                const override = Number(ev?.params?.handicapOverrides?.[String(m?.id)]);
                return sum + (Number.isFinite(override) ? override : (Number(m?.handicap ?? 0) || 0));
              }, 0);
              const teamLine = getPickPreviewLineText(cells);
              return {
                selectorName: String(p?.nickname || ''),
                cells,
                teamLine,
                handicapSum: members.length ? handicapSum : '',
                hasAny: members.length > 0,
              };
            });
            const hasPreviewRows = previewRows.some((row) => row.hasAny);

            return (
              <div key={ev.id} className={`${baseCss.card} ${tCss.eventCard}`}>
                <div className={baseCss.cardHeader}>
                  <div className={`${baseCss.cardTitle} ${tCss.eventTitle}`}>{ev.title}</div>
                </div>

                <div style={{ padding: '0 12px 8px', fontSize: 12, color: '#667085', lineHeight: 1.5 }}>
                  {pickCfg.mode === 'jo'
                    ? `오픈 조: ${pickCfg.openGroups.map((g) => `${g}조`).join(', ')}${pickCfg.lastPlaceHalf && pickCfg.openGroups.length === 4 ? ' · 꼴등반띵 적용' : ''}`
                    : `전체 참가자 중 ${pickCfg.pickCount}명 선택`}
                </div>

                {locked && <div className={tCss.lockNotice}>선택이 마감되어 더 이상 수정할 수 없습니다.</div>}

                <div className={`${baseCss.tableWrap} ${tCss.noOverflow}`}>
                  <table className={tCss.table} style={{ width: '100%' }}>
                    <colgroup>
                      <col style={{ width: `${pickNickColPx}px` }} />
                      {slotLabels.map((_, idx) => <col key={idx} style={{ width: `calc((100% - ${pickNickColPx}px) / ${Math.max(requiredCount, 1)})` }} />)}
                    </colgroup>
                    <thead>
                      <tr>
                        <th>닉네임</th>
                        {slotLabels.map((label, idx) => <th key={idx}>{label}</th>)}
                      </tr>
                    </thead>

                    <tbody>
                      {roomMembers.map((p, rIdx) => {
                        const rowIds = p
                          ? padPickIds(normalizeMemberIds(inputsByEvent?.[ev.id]?.person?.[p.id]), requiredCount)
                          : padPickIds([], requiredCount);

                        return (
                          <tr key={rIdx}>
                            <td className={tCss.pickInputNick}>{p ? p.nickname : ''}</td>
                            {slotLabels.map((_, idx) => {
                              const options = getPickOptions(ev, idx);
                              const selectedId = p ? (rowIds[idx] || '') : '';
                              const selectedOpt = options.find((opt) => String(opt?.id ?? '') === String(selectedId));
                              const buttonText = selectedOpt ? displayPickOption(selectedOpt) : '선택';
                              return (
                                <td key={idx} className={tCss.cellEditable}>
                                  <div className={tCss.pickMenuHolder} onClick={(e) => e.stopPropagation()}>
                                    <select
                                      className={`${tCss.pickNativeSelect} ${isFourJo ? tCss.pickNativeSelectCompact : ''}`}
                                      value={selectedId}
                                      onChange={(e) => {
                                        if (!p || locked) return;
                                        setPickMenuState(null);
                                        patchPickMember(ev.id, String(p.id ?? ''), idx, e.target.value, requiredCount);
                                      }}
                                      disabled={!p || locked}
                                      title={buttonText}
                                    >
                                      <option value="">
                                        {selectedOpt ? '선택 해제' : (options.length ? '선택' : '선택할 참가자 없음')}
                                      </option>
                                      {options.map((opt) => {
                                        const value = String(opt?.id ?? '');
                                        const selectedElsewhere = rowIds.includes(value) && rowIds[idx] !== value;
                                        const lockedByCurrentSelection = !!selectedId && String(selectedId) !== value;
                                        return (
                                          <option
                                            key={value}
                                            value={value}
                                            disabled={selectedElsewhere || lockedByCurrentSelection}
                                          >
                                            {displayPickOption(opt)}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {hasPreviewRows && (
                  <div className={tCss.pickPreviewWrap}>
                    <div className={tCss.pickPreviewTitle}>선택 미리보기</div>
                    <div className={`${baseCss.tableWrap} ${tCss.noOverflow} ${tCss.pickPreviewTableWrap} ${tCss.previewFrame}`}>
                      <table className={`${tCss.table} ${tCss.pickPreviewTable}`}>
                        <colgroup>
                          <col style={{ width: `${pickPreviewNickPx}px` }} />
                          <col />
                          <col style={{ width: `${pickPreviewTotalPx}px` }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>닉네임</th>
                            <th>선택팀</th>
                            <th>합계</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, idx) => (
                            <tr key={`pick-preview-${idx}`}>
                              <td className={`${tCss.pickPreviewCell} ${tCss.pickPreviewStrong} ${pickCfg.mode === 'jo' ? tCss.pickPreviewNickWide : tCss.pickPreviewNick}`}>{row.selectorName}</td>
                              <td
                                className={`${tCss.pickPreviewCell} ${getPickPreviewLineClass(tCss, row.teamLine, pickCfg.mode === 'jo')}`}
                                title={row.teamLine}
                              >
                                {row.teamLine}
                              </td>
                              <td className={`${tCss.pickPreviewCell} ${tCss.pickPreviewHandicap}`}>{row.handicapSum !== '' ? row.handicapSum : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={ev.id} className={`${baseCss.card} ${tCss.eventCard}`}>
              <div className={baseCss.cardHeader}>
                <div className={`${baseCss.cardTitle} ${tCss.eventTitle}`}>{ev.title}</div>
              </div>

              <div className={`${baseCss.tableWrap} ${tCss.noOverflow}`}>
                <table className={tCss.table} style={{ width: isAccum ? `${tableWidthPct}%` : '100%' }}>
                  <colgroup>
                    <col style={{ width: `${NICK_PCT}%` }} />
                    {isAccum
                      ? Array.from({ length: attempts }, (_,i) => <col key={i} style={{ width: `${ONE_PCT}%` }} />)
                      : <col style={{ width: '65%' }} />
                    }
                    {isHoleRankForce && <col style={{ width: `${TOTAL_PCT}%` }} />}
                  </colgroup>

                  <thead>
                    <tr>
                      <th>닉네임</th>
                      {isAccum
                        ? (isHoleRankForce
                          ? selectedHoles.map((holeNo) => (<th key={holeNo}>{holeNo}</th>))
                          : Array.from({length: attempts}, (_,i)=>(<th key={i}>{`입력${i+1}`}</th>)))
                        : <th>입력값</th>}
                      {isHoleRankForce && <th>합계</th>}
                    </tr>
                  </thead>

                  <tbody>
                    {orderedRoomRows.map((p, rIdx) => {
                      const rowRawValues = isHoleRankForce
                        ? selectedHoles.map((holeNo) => (p ? (inputsByEvent?.[ev.id]?.person?.[p.id]?.values?.[holeNo - 1] ?? '') : ''))
                        : (isAccum
                          ? Array.from({ length: attempts }, (_, i) => (p ? (inputsByEvent?.[ev.id]?.person?.[p.id]?.values?.[i] ?? '') : ''))
                          : []);
                      const rowValues = rowRawValues.map((raw) => {
                        const n = Number(raw);
                        return Number.isFinite(n) ? n : 0;
                      });
                      const rowHasValue = rowRawValues.some((raw) => String(raw ?? '').trim() !== '');
                      const rowTotal = rowValues.reduce((sum, n) => sum + n, 0);
                      const rowTotalDisplay = p ? (rowHasValue ? formatDisplayNumber(rowTotal) : '') : '';

                      return (
                        <tr key={rIdx}>
                          <td>{p ? p.nickname : ''}</td>

                          {isAccum ? (
                            (isHoleRankForce ? selectedHoles : Array.from({length: attempts}, (_,i)=>i+1)).map((holeOrIdx, cellIdx) => {
                              const valueIndex = isHoleRankForce ? (holeOrIdx - 1) : cellIdx;
                              const cellValue = p ? (inputsByEvent?.[ev.id]?.person?.[p.id]?.values?.[valueIndex] ?? '') : '';
                              const inputKey = `${ev.id}:${p ? p.id : 'empty'}:${valueIndex}`;
                              return (
                                <td
                                  key={holeOrIdx}
                                  className={tCss.cellEditable}
                                  onClick={(e)=>{ if (bonusOpts.length) openBonusPopup(ev.id, p?.id, cellIdx, attempts, e); }}
                                >
                                  <input
                                    ref={(el) => {
                                      if (el) eventInputRefs.current[inputKey] = el;
                                      else delete eventInputRefs.current[inputKey];
                                    }}
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    className={tCss.cellInput}
                                    value={cellValue}
                                    onChange={e=> p && patchAccum(ev.id, p.id, valueIndex, e.target.value, isHoleRankForce ? 18 : attempts)}
                                    onBlur={e=> p && finalizeAccum(ev.id, p.id, valueIndex, e.target.value, isHoleRankForce ? 18 : attempts)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                    onPointerDown={(e) => {
                                      if (isHoleRankForce && p) {
                                        e.stopPropagation();
                                        startEventLongMinus(ev.id, p.id, valueIndex, cellValue, 18);
                                      }
                                    }}
                                    onPointerUp={() => cancelEventLongPress(inputKey)}
                                    onPointerCancel={() => cancelEventLongPress(inputKey)}
                                    onPointerLeave={() => cancelEventLongPress(inputKey)}
                                    onTouchStart={(e) => {
                                      if (isHoleRankForce && p) {
                                        e.stopPropagation();
                                        startEventLongMinus(ev.id, p.id, valueIndex, cellValue, 18);
                                      }
                                    }}
                                    onTouchEnd={() => cancelEventLongPress(inputKey)}
                                    onTouchCancel={() => cancelEventLongPress(inputKey)}
                                    data-focus-evid={ev.id}
                                    data-focus-pid={p ? p.id : ''}
                                    data-focus-idx={valueIndex}
                                  />
                                </td>
                              );
                            })
                          ) : (
                            <td
                              className={tCss.cellEditable}
                              onClick={(e)=>{ if (bonusOpts.length) openBonusPopup(ev.id, p?.id, 0, 1, e); }}
                            >
                              <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                className={tCss.cellInput}
                                value={p ? (inputsByEvent?.[ev.id]?.person?.[p.id] ?? '') : ''}
                                onChange={(e)=> p && patchValue(ev.id, p.id, e.target.value)}
                                onBlur={(e)=> p && finalizeValue(ev.id, p.id, e.target.value)}
                                data-focus-evid={ev.id}
                                data-focus-pid={p ? p.id : ''}
                                data-focus-idx={0}
                              />
                            </td>
                          )}

                          {isHoleRankForce && <td className={tCss.totalCell}>{rowTotalDisplay}</td>}
                        </tr>
                      );
                    })}

                    {isHoleRankForce && (
                      <tr className={tCss.subtotalRow}>
                        <td className={tCss.subtotalLabel}>소계</td>
                        {rawSubtotal.map((item) => (
                          <td key={`raw-sub-${item.holeNo}`} className={tCss.subtotalBlue}>
                            {item.hasAny ? formatDisplayNumber(item.sum) : ''}
                          </td>
                        ))}
                        <td className={tCss.subtotalRed}>
                          {rawGrandHasAny ? formatDisplayNumber(rawGrandTotal) : ''}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {hasForcedViewer && forcedRoom && (
                <div className={`${tCss.viewerWrap} ${getForcedPreviewPresetClass(tCss)}`}>
                  <div className={tCss.viewerTitle}>환산 적용 미리보기</div>
                  <div className={`${baseCss.tableWrap} ${tCss.noOverflow} ${tCss.viewerTableWrap} ${tCss.previewFrame}`}>
                    <table className={tCss.table} style={{ width: `${tableWidthPct}%` }}>
                      <colgroup>
                        <col style={{ width: `${NICK_PCT}%` }} />
                        {Array.from({ length: attempts }, (_,i) => <col key={i} style={{ width: `${ONE_PCT}%` }} />)}
                        <col style={{ width: `${TOTAL_PCT}%` }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>닉네임</th>
                          {selectedHoles.map((holeNo) => (<th key={`viewer-head-${holeNo}`}>{holeNo}</th>))}
                          <th>합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderedRoomRows.map((p, rIdx) => {
                          const forcedSlot = p ? (forcedRoom?.slots || []).find((slot) => String(slot?.participantId ?? '') === String(p.id)) : null;
                          const viewerRawValues = selectedHoles.map((holeNo) => forcedSlot?.effectiveHoleScores?.[holeNo]);
                          const viewerHasValue = viewerRawValues.some((value) => Number.isFinite(Number(value)));
                          const viewerTotal = Number(forcedSlot?.total);
                          return (
                            <tr key={`viewer-${rIdx}`}>
                              <td>{p ? p.nickname : ''}</td>
                              {selectedHoles.map((holeNo) => {
                                const value = forcedSlot?.effectiveHoleScores?.[holeNo];
                                return (
                                  <td key={`viewer-${rIdx}-${holeNo}`}>
                                    {formatDisplayNumber(value)}
                                  </td>
                                );
                              })}
                              <td className={tCss.totalCell}>
                                {viewerHasValue && Number.isFinite(viewerTotal) ? formatDisplayNumber(viewerTotal) : ''}
                              </td>
                            </tr>
                          );
                        })}

                        <tr className={tCss.subtotalRow}>
                          <td className={tCss.subtotalLabel}>소계</td>
                          {forcedSubtotal.map((item) => (
                            <td key={`forced-sub-${item.holeNo}`} className={tCss.subtotalBlue}>
                              {item.hasAny ? formatDisplayNumber(item.sum) : ''}
                            </td>
                          ))}
                          <td className={tCss.subtotalRed}>
                            {forcedGrandHasAny ? formatDisplayNumber(forcedGrandTotal) : ''}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}


        {pickMenuState && (() => {
          const activeEvent = events.find((item) => String(item?.id ?? '') === String(pickMenuState.evId ?? '')) || pickMenuState.eventSnapshot || null;
          const requiredCount = getPickLineupRequiredCount(activeEvent);
          const selector = getPickSelectorById(pickMenuState.pid) || pickMenuState.selectorSnapshot || null;
          const selectorKey = String(selector?.id ?? pickMenuState.pid ?? '');
          const rowIds = selector
            ? padPickIds(normalizeMemberIds(inputsByEvent?.[String(pickMenuState.evId ?? '')]?.person?.[selectorKey]), requiredCount)
            : padPickIds([], requiredCount);
          const options = activeEvent ? getPickOptions(activeEvent, pickMenuState.idx) : (Array.isArray(pickMenuState.optionsSnapshot) ? pickMenuState.optionsSnapshot : []);
          const selectedId = selector ? (rowIds[pickMenuState.idx] || '') : '';
          const portalNode = typeof document !== 'undefined' ? document.body : null;
          if (!portalNode || !activeEvent || !selector) return null;

          return createPortal(
            <div
              className={tCss.pickMenuOverlay}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) {
                  e.stopPropagation();
                  setPickMenuState(null);
                }
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
              }}
            >
              <div
                className={tCss.pickMenu}
                style={{ left: pickMenuState.left, top: pickMenuState.top, width: pickMenuState.width, position:'fixed' }}
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStartCapture={(e) => { beginPickMenuGesture(e); }}
                onTouchMoveCapture={(e) => { movePickMenuGesture(e); e.stopPropagation(); }}
                onTouchEndCapture={() => { finishPickMenuGesture(); }}
                onTouchCancelCapture={() => { finishPickMenuGesture(); }}
                onScrollCapture={() => {
                  const state = pickMenuGestureRef.current || {};
                  if (state.dragging) pickMenuGestureRef.current = { ...state, lastMoveAt: Date.now() };
                }}
                onTouchMove={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className={`${tCss.pickMenuOption} ${!selectedId ? tCss.pickMenuOptionActive : ''}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    if (shouldIgnorePickMenuClick()) return;
                    patchPickMember(activeEvent.id, selectorKey, pickMenuState.idx, '', requiredCount);
                  }}
                >
                  선택 해제
                </button>
                {!options.length && (
                  <button
                    type="button"
                    className={tCss.pickMenuOption}
                    onPointerDown={(e) => e.stopPropagation()}
                    disabled
                  >
                    선택할 참가자가 없습니다.
                  </button>
                )}
                {options.map((opt) => {
                  const value = String(opt?.id ?? '');
                  const selectedElsewhere = rowIds.includes(value) && rowIds[pickMenuState.idx] !== value;
                  const active = String(selectedId) === value;
                  const disabled = !!selectedId || selectedElsewhere;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={`${tCss.pickMenuOption} ${active ? tCss.pickMenuOptionActive : ''}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => {
                        if (shouldIgnorePickMenuClick()) return;
                        if (disabled) return;
                        patchPickMember(activeEvent.id, selectorKey, pickMenuState.idx, value, requiredCount);
                        setPickMenuState(null);
                      }}
                      disabled={disabled}
                      title={displayPickOption(opt)}
                    >
                      {displayPickOption(opt)}
                    </button>
                  );
                })}
              </div>
            </div>,
            portalNode
          );
        })()}

        {battleMenuState && (() => {
          const activeEvent = events.find((item) => item.id === battleMenuState.evId);
          const portalNode = typeof document !== 'undefined' ? document.body : null;
          if (!portalNode || !activeEvent) return null;
          const cfg = normalizeGroupRoomHoleBattleParams(activeEvent?.params, { participants, roomNames, roomCount: allRoomNos.length || roomNames.length || 0 });
          const rows = cfg.mode === 'group'
            ? getGroupRoomHoleBattleRows(activeEvent, participants, { roomNames, roomCount: allRoomNos.length || roomNames.length || 0 })
            : getGroupRoomHoleBattleInputRows(activeEvent, participants, { roomNames, roomCount: allRoomNos.length || roomNames.length || 0, currentRoomNo: roomIdx, currentParticipantId: selfParticipantId, currentParticipantNickname: String(selfParticipant?.nickname || '') });
          const row = rows.find((item) => String(item.key) === String(battleMenuState.rowKey));
          if (!row) return null;
          const activeBattleSource = battleMenuState?.viewOnly ? inputsByEventServer : inputsByEvent;
          const shared = getBattleSharedInputs(activeBattleSource?.[battleMenuState.evId] || {});
          const viewOnly = !!battleMenuState?.viewOnly;
          const isBattleRoomTeamSelection = activeEvent?.params?.mode === 'room' && (activeEvent?.params?.battleType === 'matchplay' || activeEvent?.params?.battleType === 'fourball') && activeEvent?.params?.roomTeams?.selectionMode === 'team' && row?.roomSelectionMode === 'team';
          const currentIds = isBattleRoomTeamSelection
            ? (Array.isArray(row?.memberIds) ? row.memberIds.map(String).filter(Boolean) : [])
            : getBattleCellIds(shared, row.key, battleMenuState.holeNo, row.memberIds);
          const usage = isBattleRoomTeamSelection ? {} : countParticipantUsageForRow(shared, row.key);
          const battleMenuSelfTeamKey = (() => {
            const roomKey = String(roomIdx || '');
            const roomMode = String(cfg?.roomTeams?.roomAssignments?.[roomKey] || '').toUpperCase();
            if (roomMode === 'A' || roomMode === 'B') return roomMode;
            if (roomMode === 'SPLIT') {
              const split = String(cfg?.roomTeams?.splitMembers?.[String(selfParticipantId || '')] || '').toUpperCase();
              if (split === 'A' || split === 'B') return split;
            }
            return '';
          })();
          const battleMenuMembers = (!viewOnly && cfg.mode === 'room' && (cfg.battleType === 'matchplay' || cfg.battleType === 'fourball') && String(row?.roomTeamMode || '').toUpperCase() === 'SPLIT' && battleMenuSelfTeamKey)
            ? (Array.isArray(row?.members) ? row.members.filter((member) => {
                const split = String(cfg?.roomTeams?.splitMembers?.[String(member?.id || '')] || '').toUpperCase();
                return split === battleMenuSelfTeamKey;
              }) : [])
            : (Array.isArray(row?.members) ? row.members : []);
          const orderedMembers = [
            ...battleMenuMembers.filter((member) => currentIds.includes(String(member?.id || ''))),
            ...battleMenuMembers.filter((member) => !currentIds.includes(String(member?.id || ''))),
          ];
          return createPortal(
            <div
              className={tCss.pickMenuOverlay}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) {
                  e.stopPropagation();
                  setBattleMenuState(null);
                }
              }}
            >
              <div
                className={tCss.pickMenu}
                style={{ left: battleMenuState.left, top: battleMenuState.top, width: battleMenuState.width, position:'fixed' }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ padding: '6px 10px 8px', fontSize: 12, color: '#667085', borderBottom: '1px solid #eef2f7' }}>
                  {row.name} · {battleMenuState.holeNo}홀 · {isBattleRoomTeamSelection ? `${currentIds.length}명` : `${currentIds.length}/${cfg.pickCount}명`}{viewOnly ? ' · 선택 보기' : ''}
                </div>
                {!viewOnly && (
                  <button
                    type="button"
                    className={`${tCss.pickMenuOption} ${!currentIds.length ? tCss.pickMenuOptionActive : ''}`}
                    onClick={() => {
                      patchGroupRoomBattleCell(activeEvent, row, battleMenuState.holeNo, '');
                      setBattleMenuState(null);
                    }}
                  >
                    선택 해제
                  </button>
                )}
                {orderedMembers.map((member) => {
                  const value = String(member?.id || '');
                  const active = currentIds.includes(value);
                  const used = Number(usage[value] || 0);
                  const disabled = viewOnly || (!active && (currentIds.length >= cfg.pickCount || used >= cfg.maxPerParticipant));
                  return (
                    <button
                      key={`battle-menu-${value}`}
                      type="button"
                      className={`${tCss.pickMenuOption} ${active ? tCss.pickMenuOptionActive : ''}`}
                      onClick={() => {
                        if (disabled) return;
                        patchGroupRoomBattleCell(activeEvent, row, battleMenuState.holeNo, value);
                        const nextCount = active ? Math.max(0, currentIds.length - 1) : Math.min(Number(cfg.pickCount || 1), currentIds.length + 1);
                        const keepOpen = !active && Number(cfg.pickCount || 1) > 1 && nextCount < Number(cfg.pickCount || 1);
                        if (!keepOpen) setBattleMenuState(null);
                      }}
                      disabled={disabled}
                      title={displayPickOption(member)}
                    >
                      <span>{displayPickOption(member)}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: active ? '#1d4ed8' : '#98a2b3' }}>{used}/{cfg.maxPerParticipant}</span>
                    </button>
                  );
                })}
              </div>
            </div>,
            portalNode
          );
        })()}

              {bonusPopup.open && (()=>{ 
                const evv = events.find(e=> e.id===bonusPopup.evId);
                const opts = (evv && evv.template==='range-convert-bonus' && Array.isArray(evv.params?.bonus)) ? evv.params.bonus : [];
                const onPick = (label)=>{
                  const isAccum2 = !!(evv && evv.inputMode==='accumulate');
                  patchBonus(bonusPopup.evId, bonusPopup.pid, bonusPopup.idx, label || '', isAccum2, bonusPopup.attempts);
                  closeBonusPopup();
                  setTimeout(()=>{
                    const sel = `[data-focus-evid="${bonusPopup.evId}"][data-focus-pid="${bonusPopup.pid}"][data-focus-idx="${bonusPopup.idx}"]`;
                    const el  = document.querySelector(sel);
                    if (el && typeof el.focus === 'function') el.focus();
                  },0);
                };
                return (
                  <div
                    className={tCss.bonusPopup}
                    style={{
                      position:'fixed', left:bonusPopup.x, top:bonusPopup.y, transform:'translate(-50%,0)',
                      zIndex:1000, background:'#fff', border:'1px solid #e5e7eb', borderRadius:8,
                      boxShadow:'0 8px 24px rgba(0,0,0,.12)', width: bonusPopup.w
                    }}
                    onClick={(e)=>e.stopPropagation()}
                  >
                    {opts.map((b,i)=>(
                      <button key={i}
                        onClick={()=>onPick(b.label)}
                        style={{display:'block', width:'100%', padding:'6px 10px', border:0, background:'transparent', textAlign:'left', whiteSpace:'nowrap'}}
                      >
                        {b.label}{b.score!=null?` (+${b.score})`:''}
                      </button>
                    ))}
                    <button
                      onClick={()=>onPick('')}
                      style={{display:'block', width:'100%', padding:'6px 10px', border:0, background:'transparent', textAlign:'left', color:'#6b7280', whiteSpace:'nowrap'}}
                    >
                      선택 해제
                    </button>
                  </div>
                );
              })()}

            </div>
          );
        })}

        <div className={baseCss.footerNav}>
          <button className={`${baseCss.navBtn} ${baseCss.navPrev}`} onClick={()=>nav(`/player/home/${eventId}/2`)}>← 이전</button>
          <button
            className={`${baseCss.navBtn}`}
            onClick={saveDraft}
            disabled={!dirty}
            aria-disabled={!dirty}
            style={!dirty
              ? { opacity: 0.5, pointerEvents: 'none' }
              : { boxShadow: '0 0 0 2px rgba(59,130,246,.35) inset', fontWeight: 600 }
            }
          >
            저장
          </button>
          <button
            className={`${baseCss.navBtn} ${baseCss.navNext}`}
            onClick={()=>{ if (!nextDisabled) nav(`/player/home/${eventId}/4`); }}
            disabled={nextDisabled}
            aria-disabled={nextDisabled}
            data-disabled={nextDisabled ? '1' : '0'}
            style={nextDisabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          >
            다음 →
          </button>
        </div>
      </div>
    </div>
  );
}
