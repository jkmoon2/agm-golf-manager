// /src/player/hooks/useEffectivePlayerEventData.js
// Player 화면에서 EventContext(eventData)와 PlayerContext(participants/room 정보)를
// 함께 사용해 더 최신의 참가자/방 정보를 일관되게 고르는 공통 훅

import { useContext, useMemo } from 'react';
import { EventContext } from '../../contexts/EventContext';
import { PlayerContext } from '../../contexts/PlayerContext';

function normalizeMode(mode) {
  return (mode === 'fourball' || mode === 'agm') ? 'fourball' : 'stroke';
}
function participantsFieldByMode(mode) {
  return normalizeMode(mode) === 'fourball' ? 'participantsFourball' : 'participantsStroke';
}
function safeArr(v) { return Array.isArray(v) ? v : []; }
function normId(v) {
  if (v == null) return '';
  return String(v).trim();
}
function normalizeParticipantRecord(p, i = 0) {
  const obj = (p && typeof p === 'object') ? p : {};
  const room = (obj?.room ?? obj?.roomNumber ?? null);
  return { ...obj, id: obj?.id ?? i, room, roomNumber: room };
}
function mergeParticipantsById(base = [], overlay = []) {
  const map = new Map();
  safeArr(base).forEach((p, i) => {
    const n = normalizeParticipantRecord(p, i);
    map.set(normId(n.id) || String(i), n);
  });
  safeArr(overlay).forEach((p, i) => {
    const n = normalizeParticipantRecord(p, i);
    const key = normId(n.id) || String(i);
    map.set(key, { ...(map.get(key) || {}), ...n });
  });
  return Array.from(map.values()).map((p, i) => normalizeParticipantRecord(p, i));
}

export default function useEffectivePlayerEventData() {
  const { eventData } = useContext(EventContext) || {};
  const {
    mode: playerMode,
    roomCount: playerRoomCount,
    roomNames: playerRoomNames,
    roomCapacities: playerRoomCapacities,
    participants: playerParticipants,
  } = useContext(PlayerContext) || {};

  return useMemo(() => {
    const base = (eventData && typeof eventData === 'object') ? eventData : {};
    const liveMode = normalizeMode(playerMode || base?.mode || 'stroke');
    const field = participantsFieldByMode(liveMode);

    const ctxPrimary = safeArr(base?.[field]);
    const ctxLegacy = safeArr(base?.participants);
    const ctxMerged = ctxPrimary.length ? mergeParticipantsById(ctxLegacy, ctxPrimary) : ctxLegacy.map((p, i) => normalizeParticipantRecord(p, i));
    const liveParts = safeArr(playerParticipants).map((p, i) => normalizeParticipantRecord(p, i));

    // PlayerContext participants가 있으면 우선하되, EventContext에만 있는 참가자도 보존
    const mergedParticipants = liveParts.length
      ? mergeParticipantsById(ctxMerged, liveParts)
      : ctxMerged;

    const next = {
      ...base,
      [field]: mergedParticipants,
      participants: mergedParticipants,
    };

    if (!base?.mode && liveMode) next.mode = liveMode;
    if (Number.isFinite(Number(playerRoomCount)) && Number(playerRoomCount) > 0) {
      next.roomCount = Number(playerRoomCount);
    }
    if (Array.isArray(playerRoomNames) && playerRoomNames.length) {
      next.roomNames = playerRoomNames.map((v) => String(v ?? ''));
    }
    if (Array.isArray(playerRoomCapacities) && playerRoomCapacities.length) {
      next.roomCapacities = playerRoomCapacities.slice();
    }

    return next;
  }, [eventData, playerMode, playerRoomCount, playerRoomNames, playerRoomCapacities, playerParticipants]);
}
