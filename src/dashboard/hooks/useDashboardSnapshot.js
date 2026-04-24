// /src/dashboard/hooks/useDashboardSnapshot.js

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot } from 'firebase/firestore';
import { EventContext } from '../../contexts/EventContext';
import { db } from '../../firebase';

function toMillis(v) {
  if (!v) return 0;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000 + Math.floor((v?.nanoseconds || 0) / 1e6);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatDateRange(start, end) {
  if (!start && !end) return '-';
  return `${start || '-'} ~ ${end || '-'}`;
}

function formatLastUpdated(timestamp) {
  return timestamp ? new Date(timestamp).toLocaleString('ko-KR') : '-';
}

function getModeLabel(mode) {
  if (mode === 'fourball' || mode === 'agm') return 'AGM 포볼';
  return '스트로크';
}

function normalizeTemplateLabel(template = '') {
  switch (String(template || '')) {
    case 'bingo': return '빙고';
    case 'group-battle': return '그룹/개인 대결';
    case 'group-room-hole-battle': return '그룹/방/개인 홀별 지목전';
    case 'hole-rank-force': return '홀별 강제 순위 점수';
    case 'pick-lineup': return '개인/조 선택 대결';
    default: return template || '일반 이벤트';
  }
}

function normalizeTargetLabel(target = 'person') {
  switch (String(target || 'person')) {
    case 'room': return '방';
    case 'jo': return '조';
    case 'team': return '팀';
    case 'group': return '그룹';
    case 'person':
    default:
      return '개인';
  }
}

function parseRoomNo(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v).replace(/[^\d]/g, '');
  return s ? Number(s) : NaN;
}

function roomNoToIndex(roomNames = [], no) {
  const target = parseRoomNo(no);
  if (!Number.isFinite(target)) return NaN;
  for (let i = 0; i < roomNames.length; i += 1) {
    if (parseRoomNo(roomNames[i]) === target) return i;
  }
  return NaN;
}

function getParticipantKey(p = {}, fallbackIndex = 0) {
  return String(p?.id ?? p?.uid ?? p?.userId ?? p?.code ?? fallbackIndex);
}

function getParticipantsFromEvent(eventData = {}) {
  const primary = Array.isArray(eventData?.participants) ? eventData.participants : [];
  if (primary.length) return primary;
  const mode = eventData?.mode === 'fourball' || eventData?.mode === 'agm' ? 'fourball' : 'stroke';
  return mode === 'fourball'
    ? (Array.isArray(eventData?.participantsFourball) ? eventData.participantsFourball : [])
    : (Array.isArray(eventData?.participantsStroke) ? eventData.participantsStroke : []);
}

function hasCodeJoinSignal(p = {}) {
  return p?.codeEntered === true || p?.entered === true || p?.checkedIn === true
    || !!p?.enterCodeAt || !!p?.enteredAt || !!p?.joinedAt || !!p?.checkedInAt;
}

function isCheckedIn(participant = {}, checkedInSet = new Set()) {
  return hasCodeJoinSignal(participant) || checkedInSet.has(getParticipantKey(participant));
}

const PRESENCE_ACTIVE_WINDOW_MS = 90 * 1000;

function getPresenceIdentity(doc = {}) {
  return String(
    doc?.identityKey || doc?.participantId || doc?.authCode || doc?.uid || doc?.nickname || doc?.sessionId || ''
  ).trim();
}

function getPresenceFreshAt(doc = {}) {
  return Math.max(
    toMillis(doc?.lastSeenAt),
    toMillis(doc?.updatedAt),
    Number(doc?.lastSeenAtClient) || 0,
    Number(doc?.updatedAtClient) || 0,
    Number(doc?.lastActivityAtClient) || 0,
    0,
  );
}

function countActivePresence(presenceDocs = []) {
  const list = Array.isArray(presenceDocs) ? presenceDocs : [];
  if (!list.length) return 0;
  const now = Date.now();
  const latestByIdentity = new Map();

  list.forEach((item) => {
    const key = getPresenceIdentity(item);
    if (!key) return;
    const freshAt = getPresenceFreshAt(item);
    const prev = latestByIdentity.get(key);
    if (!prev || freshAt > prev.freshAt) {
      latestByIdentity.set(key, { item, freshAt });
    }
  });

  let count = 0;
  latestByIdentity.forEach(({ item, freshAt }) => {
    const state = String(item?.state || '').toLowerCase();
    if (state === 'closed' || state === 'idle') return;
    if (item?.isOnline === false) return;
    if (!freshAt || (now - freshAt) > PRESENCE_ACTIVE_WINDOW_MS) return;
    count += 1;
  });

  return count;
}

function isCommittedAssignment(participant = {}) {
  const roomIndex = Number(participant?.roomIndex);
  const roomNo = parseRoomNo(participant?.roomNo);
  const roomRaw = parseRoomNo(participant?.room);
  const hasRoom = Number.isFinite(roomIndex) || Number.isFinite(roomNo) || Number.isFinite(roomRaw);
  const flagged = participant?.assigned === true
    || ['self', 'admin'].includes(String(participant?.assignmentState || '').toLowerCase())
    || ['self', 'admin'].includes(String(participant?.assignSource || '').toLowerCase())
    || participant?.confirmed === true
    || participant?.roomLocked === true
    || participant?.finalized === true
    || participant?.roomCommitted === true;
  return flagged || (hasRoom && flagged);
}

function hasAnyScore(participant = {}) {
  const score = participant?.score;
  return score !== '' && score != null && Number.isFinite(Number(score));
}

function hasMeaningfulEventInputValue(value) {
  if (value == null || value === '') return false;
  if (typeof value !== 'object') return String(value).trim() !== '';
  if (Array.isArray(value.values) && value.values.some((x) => String(x ?? '').trim() !== '')) return true;
  if (Array.isArray(value.board) && value.board.some((x) => String(x ?? '').trim() !== '')) return true;
  if (Array.isArray(value.memberIds) && value.memberIds.some(Boolean)) return true;
  if (value.roomShared) return true;
  return Object.keys(value).length > 0;
}

function hasParticipantEventInput(eventId, participantId, eventInputsRoot = {}) {
  const slot = eventInputsRoot?.[eventId];
  if (!slot || typeof slot !== 'object') return false;
  const person = slot.person && typeof slot.person === 'object' ? slot.person : {};
  return hasMeaningfulEventInputValue(person?.[String(participantId)]);
}

function countParticipantsWithEventInput(eventId, participants = [], eventInputsRoot = {}) {
  return participants.reduce((acc, p) => acc + (hasParticipantEventInput(eventId, p?.id, eventInputsRoot) ? 1 : 0), 0);
}

function extractMembers(roomDoc = {}) {
  let arr = roomDoc?.members || roomDoc?.players || roomDoc?.list || roomDoc?.team || roomDoc?.people;
  if (Array.isArray(arr)) return arr;

  const members = [];
  const tryPush = (x) => {
    if (!x) return;
    if (typeof x === 'object') members.push(x);
    else members.push({ id: x });
  };

  if (Array.isArray(roomDoc?.pairs)) {
    roomDoc.pairs.forEach((pair) => {
      if (!pair) return;
      tryPush(pair.p1 ?? pair.a ?? pair.left);
      tryPush(pair.p2 ?? pair.b ?? pair.right);
    });
  }
  if (Array.isArray(roomDoc?.singles)) roomDoc.singles.forEach((pid) => tryPush(pid));
  if (roomDoc?.a || roomDoc?.b) {
    tryPush(roomDoc.a);
    tryPush(roomDoc.b);
  }
  if (roomDoc?.p1 || roomDoc?.p2) {
    tryPush(roomDoc.p1);
    tryPush(roomDoc.p2);
  }
  return members;
}

function buildCheckedInSet(parts, players, playerStates) {
  const set = new Set();
  [parts, players, playerStates].filter(Array.isArray).forEach((arr) => {
    arr.forEach((p, index) => {
      if (hasCodeJoinSignal(p)) set.add(getParticipantKey(p, index));
    });
  });
  return set;
}

function mergeParticipants(base = [], live = []) {
  if (!Array.isArray(base) || !base.length) return Array.isArray(live) ? live : [];
  if (!Array.isArray(live) || !live.length) return base;

  const liveMap = new Map(live.map((p, i) => [getParticipantKey(p, i), p]));
  const merged = base.map((p, i) => {
    const key = getParticipantKey(p, i);
    const override = liveMap.get(key);
    return override ? { ...p, ...override } : p;
  });

  live.forEach((lp, i) => {
    const key = getParticipantKey(lp, i);
    const exists = base.some((bp, bi) => getParticipantKey(bp, bi) === key);
    if (!exists) merged.push(lp);
  });

  return merged;
}

function buildRoomsEffective(mode, roomsLive, fourballRoomsLive) {
  if (mode === 'fourball') {
    return Array.isArray(fourballRoomsLive) && fourballRoomsLive.length ? fourballRoomsLive : [];
  }
  return Array.isArray(roomsLive) && roomsLive.length ? roomsLive : [];
}

function buildByRoom({ participants, roomsEffective, roomCount, roomNames }) {
  const arr = Array.from({ length: Math.max(0, roomCount) }, () => []);
  const participantIndex = new Map(participants.map((p, i) => [getParticipantKey(p, i), p]));

  if (Array.isArray(roomsEffective) && roomsEffective.length) {
    roomsEffective.forEach((roomDoc) => {
      let idx = NaN;
      const byIndex = Number(roomDoc?.index ?? roomDoc?.order);
      if (Number.isFinite(byIndex)) idx = byIndex - 1;
      if (Number.isNaN(idx)) {
        const roomNo = parseRoomNo(roomDoc?.roomNo ?? roomDoc?.room ?? roomDoc?.name ?? roomDoc?.rid);
        const mapped = roomNoToIndex(roomNames, roomNo);
        if (Number.isFinite(mapped)) idx = mapped;
      }
      if (!Number.isFinite(idx) || idx < 0 || idx >= arr.length) return;

      extractMembers(roomDoc).forEach((member, mi) => {
        if (typeof member === 'object') {
          const pid = getParticipantKey(member, mi);
          const base = participantIndex.get(pid) || {};
          arr[idx].push({
            ...base,
            ...member,
            handicap: Number(member?.handicap ?? base?.handicap ?? 0),
            score: Number(member?.score ?? base?.score ?? 0),
          });
          return;
        }
        const pid = String(member || '');
        const base = participantIndex.get(pid) || {};
        arr[idx].push(base);
      });
    });
    return arr;
  }

  participants.forEach((participant) => {
    if (!isCommittedAssignment(participant)) return;
    let idx = NaN;
    const roomIndex = Number(participant?.roomIndex);
    if (Number.isFinite(roomIndex)) {
      idx = (roomIndex >= 1 && roomIndex <= roomCount)
        ? roomIndex - 1
        : ((roomIndex >= 0 && roomIndex < roomCount) ? roomIndex : NaN);
    }
    if (!Number.isFinite(idx)) {
      const mapped = roomNoToIndex(roomNames, participant?.roomNo ?? participant?.room ?? participant?.roomLabel);
      if (Number.isFinite(mapped)) idx = mapped;
    }
    if (!Number.isFinite(idx) || idx < 0 || idx >= arr.length) return;
    arr[idx].push(participant);
  });

  return arr;
}

function buildStatusCards({ participants, totalParticipants, checkedInCount, assignedCount, scoreFilledPeople, activeEvents, eventInputsRoot }) {
  const eventInputTarget = activeEvents.length * totalParticipants;
  const eventInputDone = activeEvents.reduce((acc, ev) => acc + countParticipantsWithEventInput(ev.id, participants, eventInputsRoot), 0);

  const makeCard = (id, label, done, total, hint) => ({
    id,
    label,
    done,
    total,
    percent: total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0,
    hint,
  });

  return {
    entry: makeCard('entry', '입장 상태', checkedInCount, totalParticipants, `미입장 ${Math.max(0, totalParticipants - checkedInCount)}명`),
    assignment: makeCard('assignment', '배정 상태', assignedCount, Math.max(1, totalParticipants), `미배정 ${Math.max(0, totalParticipants - assignedCount)}명`),
    score: makeCard('score', '점수 상태', scoreFilledPeople, Math.max(1, totalParticipants), `미입력 ${Math.max(0, totalParticipants - scoreFilledPeople)}명`),
    eventInput: makeCard('eventInput', '이벤트 상태', eventInputDone, Math.max(1, eventInputTarget), `미완료 ${Math.max(0, eventInputTarget - eventInputDone)}건`),
  };
}

function buildRoomCards({ byRoom, roomNames, roomCapacities, activeEvents, eventInputsRoot }) {
  return byRoom.map((members, index) => {
    const groupCount = {};
    members.forEach((member) => {
      const group = String(member?.group ?? '');
      if (!group) return;
      groupCount[group] = (groupCount[group] || 0) + 1;
    });

    const duplicateGroup = Object.values(groupCount).some((count) => Number(count) > 1);
    const missingScoreCount = members.filter((member) => !hasAnyScore(member)).length;
    const eventDelayCount = members.filter((member) => activeEvents.some((event) => !hasParticipantEventInput(event?.id, member?.id, eventInputsRoot))).length;

    const flags = [];
    if (duplicateGroup) flags.push({ label: '중복조', variant: 'critical' });
    if (missingScoreCount > 0) flags.push({ label: `점수미입력 ${missingScoreCount}`, variant: 'warn' });
    if (eventDelayCount > 0 && activeEvents.length > 0) flags.push({ label: `이벤트지연 ${eventDelayCount}`, variant: 'warn' });
    if (!flags.length) flags.push({ label: '정상', variant: 'normal' });

    return {
      roomNo: index + 1,
      roomName: roomNames[index] || `${index + 1}번방`,
      occupancy: {
        current: members.length,
        capacity: Number(roomCapacities[index] || 4),
      },
      members: members.map((member, mi) => ({
        id: getParticipantKey(member, mi),
        nickname: String(member?.nickname || '-'),
        group: Number(member?.group || 0),
        handicap: Number(member?.handicap || 0),
        scoreEntered: hasAnyScore(member),
        eventEntered: activeEvents.length > 0 ? activeEvents.some((event) => hasParticipantEventInput(event?.id, member?.id, eventInputsRoot)) : false,
      })),
      sumHandicap: members.reduce((acc, member) => acc + (Number(member?.handicap) || 0), 0),
      scoreEnteredCount: members.filter((member) => hasAnyScore(member)).length,
      eventEnteredCount: activeEvents.length > 0
        ? members.filter((member) => activeEvents.some((event) => hasParticipantEventInput(event?.id, member?.id, eventInputsRoot))).length
        : 0,
      flags,
    };
  });
}

function buildEventCards({ activeEvents, participants, eventInputsRoot, byRoom, roomNames, roomsEffective }) {
  const roomCount = Math.max(roomNames.length, byRoom.length);
  const pairSet = new Set();

  if (Array.isArray(roomsEffective) && roomsEffective.length) {
    roomsEffective.forEach((roomDoc) => {
      extractMembers(roomDoc).forEach((member, idx) => {
        if (!member || typeof member !== 'object' || member?.partner == null) return;
        const a = String(member?.id ?? idx);
        const b = String(member.partner);
        if (!a || !b) return;
        pairSet.add(a < b ? `${a}:${b}` : `${b}:${a}`);
      });
    });
  }
  if (!pairSet.size) {
    participants.forEach((p, idx) => {
      if (p?.partner == null) return;
      const a = String(p?.id ?? idx);
      const b = String(p.partner);
      if (!a || !b) return;
      pairSet.add(a < b ? `${a}:${b}` : `${b}:${a}`);
    });
  }

  const distinctGroups = Array.from(new Set(participants.map((p) => String(p?.group ?? '')).filter(Boolean))).length;

  return activeEvents.map((event) => {
    const target = String(event?.target || 'person');
    let inputTarget = participants.length;
    let inputDone = countParticipantsWithEventInput(event?.id, participants, eventInputsRoot);

    if (target === 'room') {
      inputTarget = roomCount;
      inputDone = byRoom.reduce((acc, members) => acc + (members.some((member) => hasParticipantEventInput(event?.id, member?.id, eventInputsRoot)) ? 1 : 0), 0);
    } else if (target === 'jo') {
      const groups = new Map();
      participants.forEach((p) => {
        const g = String(p?.group ?? '');
        if (!g) return;
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(p);
      });
      inputTarget = groups.size || distinctGroups || participants.length;
      inputDone = Array.from(groups.values()).reduce((acc, members) => acc + (members.some((member) => hasParticipantEventInput(event?.id, member?.id, eventInputsRoot)) ? 1 : 0), 0);
    } else if (target === 'team') {
      inputTarget = pairSet.size || Math.max(1, Math.floor(participants.length / 2));
      const donePairs = new Set();
      participants.forEach((p, idx) => {
        if (!hasParticipantEventInput(event?.id, p?.id, eventInputsRoot)) return;
        if (p?.partner == null) return;
        const a = String(p?.id ?? idx);
        const b = String(p.partner);
        if (!a || !b) return;
        donePairs.add(a < b ? `${a}:${b}` : `${b}:${a}`);
      });
      inputDone = donePairs.size;
    } else if (target === 'group') {
      const paramGroups = Array.isArray(event?.params?.groups) ? event.params.groups : [];
      inputTarget = paramGroups.length || distinctGroups || participants.length;
      if (paramGroups.length) {
        inputDone = paramGroups.reduce((acc, group) => {
          const ids = Array.isArray(group?.memberIds) ? group.memberIds.map(String) : [];
          return acc + (participants.some((p) => ids.includes(String(p?.id || '')) && hasParticipantEventInput(event?.id, p?.id, eventInputsRoot)) ? 1 : 0);
        }, 0);
      }
    }

    const inputMissing = Math.max(0, inputTarget - inputDone);
    return {
      eventId: String(event?.id || ''),
      title: String(event?.title || event?.name || '이벤트'),
      template: normalizeTemplateLabel(event?.template),
      target: normalizeTargetLabel(target),
      rankOrder: String(event?.rankOrder || 'asc').toUpperCase(),
      enabled: event?.enabled !== false,
      inputDone,
      inputTarget,
      inputMissing,
      status: inputMissing > 0 ? 'delay' : 'ok',
      lastUpdatedAt: '-',
      actions: [
        { id: 'go-event-manager', label: '미리보기', eventId: String(event?.id || '') },
        { id: 'go-event-manager', label: '이벤트 관리', eventId: String(event?.id || '') },
        { id: 'go-step6', label: 'STEP6 확인', eventId: String(event?.id || '') },
      ],
    };
  });
}

function buildAlerts({ totalParticipants, checkedInCount, assignedCount, scoreFilledPeople, roomCards, eventCards }) {
  const alerts = [];
  const missingEntry = Math.max(0, totalParticipants - checkedInCount);
  const missingAssignment = Math.max(0, totalParticipants - assignedCount);
  const missingScore = Math.max(0, totalParticipants - scoreFilledPeople);
  const delayedEvents = eventCards.filter((event) => event.status !== 'ok').length;
  const abnormalRooms = roomCards.filter((room) => room.flags.some((flag) => flag.variant !== 'normal')).length;

  if (missingEntry > 0) {
    alerts.push({
      id: 'missing-entry',
      type: 'missing-entry',
      severity: 'warn',
      title: `미입장 참가자 ${missingEntry}명`,
      description: '참가자 입장 상태를 확인하고 현재 접속 흐름을 점검하세요.',
      actionId: 'go-step4',
      actionLabel: '참가자 확인',
    });
  }
  if (missingAssignment > 0) {
    alerts.push({
      id: 'missing-assignment',
      type: 'missing-assignment',
      severity: 'critical',
      title: `방배정 미완료 ${missingAssignment}명`,
      description: '방배정 화면에서 미배정 참가자를 우선 정리해야 합니다.',
      actionId: 'go-assignment',
      actionLabel: '방배정 이동',
    });
  }
  if (missingScore > 0) {
    alerts.push({
      id: 'missing-score',
      type: 'missing-score',
      severity: 'warn',
      title: `점수 미입력 ${missingScore}명`,
      description: '점수 입력 화면과 결과표 진행 상태를 함께 확인하세요.',
      actionId: 'go-step6',
      actionLabel: '결과표 확인',
    });
  }
  if (delayedEvents > 0) {
    alerts.push({
      id: 'event-delay',
      type: 'event-delay',
      severity: 'warn',
      title: `입력 지연 이벤트 ${delayedEvents}개`,
      description: '이벤트 진행 카드에서 지연 상태 이벤트를 먼저 확인하세요.',
      actionId: 'go-event-manager',
      actionLabel: '이벤트 확인',
    });
  }
  if (abnormalRooms > 0) {
    alerts.push({
      id: 'room-abnormal',
      type: 'room-abnormal',
      severity: 'info',
      title: `이상 방 ${abnormalRooms}개`,
      description: '중복조/점수미입력/이벤트지연이 있는 방을 우선 점검하세요.',
      actionId: 'go-step6',
      actionLabel: '결과표 확인',
    });
  }
  if (!alerts.length && totalParticipants > 0) {
    alerts.push({
      id: 'all-good',
      type: 'ok',
      severity: 'info',
      title: '현재 조치 필요 항목이 없습니다.',
      description: '핵심 상태 카드와 방/이벤트 모니터 기준으로 정상 범위입니다.',
      actionId: 'refresh-now',
      actionLabel: '새로고침',
    });
  }
  return alerts;
}

function resolveLiveState(selectedData = {}) {
  const now = Date.now();
  const candidates = [
    ['updatedAt', toMillis(selectedData?.updatedAt)],
    ['participantsUpdatedAt', toMillis(selectedData?.participantsUpdatedAt)],
    ['scoresUpdatedAt', toMillis(selectedData?.scoresUpdatedAt)],
    ['eventInputsUpdatedAt', toMillis(selectedData?.eventInputsUpdatedAt)],
    ['gateUpdatedAt', toMillis(selectedData?.gateUpdatedAt)],
  ].filter(([, value]) => value > 0);
  const latestPair = candidates.sort((a, b) => b[1] - a[1])[0] || ['none', 0];
  const latest = latestPair[1];
  const freshness = latest ? now - latest : Number.POSITIVE_INFINITY;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { liveState: 'OFFLINE', lastUpdatedAt: latest, lastUpdatedFrom: latestPair[0], freshness };
  }
  if (freshness <= 20_000) return { liveState: 'LIVE', lastUpdatedAt: latest, lastUpdatedFrom: latestPair[0], freshness };
  return { liveState: 'STALE', lastUpdatedAt: latest, lastUpdatedFrom: latestPair[0], freshness };
}

export default function useDashboardSnapshot(selectedEventId) {
  const { eventId: ctxEventId, eventData: ctxEventData, allEvents: ctxAllEvents, overlayScoresToParticipants } = useContext(EventContext) || {};

  const effectiveEventId = selectedEventId || ctxEventId || '';
  const [events, setEvents] = useState(Array.isArray(ctxAllEvents) ? ctxAllEvents : []);
  const [selectedData, setSelectedData] = useState(ctxEventData || null);
  const [participantsLive, setParticipantsLive] = useState(null);
  const [playersLive, setPlayersLive] = useState(null);
  const [playerStatesLive, setPlayerStatesLive] = useState(null);
  const [roomsLive, setRoomsLive] = useState(null);
  const [fourballRoomsLive, setFourballRoomsLive] = useState(null);
  const [eventInputsLive, setEventInputsLive] = useState(null);
  const [presenceLive, setPresenceLive] = useState(null);

  useEffect(() => {
    if (Array.isArray(ctxAllEvents) && ctxAllEvents.length) {
      setEvents(ctxAllEvents);
    }
  }, [ctxAllEvents]);

  useEffect(() => {
    let mounted = true;
    const safeSet = (setter, value) => { if (mounted) setter(value); };

    const unsub = onSnapshot(
      collection(db, 'events'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => String(b?.dateStart || '').localeCompare(String(a?.dateStart || '')));
        safeSet(setEvents, list);
      },
      async () => {
        try {
          const snap = await getDocs(collection(db, 'events'));
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          list.sort((a, b) => String(b?.dateStart || '').localeCompare(String(a?.dateStart || '')));
          safeSet(setEvents, list);
        } catch {}
      }
    );

    return () => {
      mounted = false;
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  useEffect(() => {
    const targetId = effectiveEventId;
    let mounted = true;
    let unsubDoc = null;
    let unsubParts = null;
    let unsubPlayers = null;
    let unsubPStates = null;
    let unsubRooms = null;
    let unsub4Rooms = null;
    let unsubInputs = null;
    let unsubPresence = null;

    const safeSet = (setter, value) => { if (mounted) setter(value); };

    if (targetId) {
      if (String(ctxEventId || '') === String(targetId) && ctxEventData) {
        safeSet(setSelectedData, ctxEventData);
      }

      unsubDoc = onSnapshot(
        doc(db, 'events', targetId),
        (snap) => safeSet(setSelectedData, snap.exists() ? snap.data() : null),
        async () => {
          try {
            const d = await getDoc(doc(db, 'events', targetId));
            safeSet(setSelectedData, d.exists() ? d.data() : null);
          } catch {}
        }
      );

      try {
        unsubParts = onSnapshot(collection(db, 'events', targetId, 'participants'), (snap) => {
          safeSet(setParticipantsLive, snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, () => safeSet(setParticipantsLive, null));
      } catch {}

      try {
        unsubPlayers = onSnapshot(collection(db, 'events', targetId, 'players'), (snap) => {
          safeSet(setPlayersLive, snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, () => safeSet(setPlayersLive, null));
      } catch {}

      try {
        unsubPStates = onSnapshot(collection(db, 'events', targetId, 'playerStates'), (snap) => {
          safeSet(setPlayerStatesLive, snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, () => safeSet(setPlayerStatesLive, null));
      } catch {}

      try {
        unsubRooms = onSnapshot(collection(db, 'events', targetId, 'rooms'), (snap) => {
          safeSet(setRoomsLive, snap.docs.map((d) => ({ rid: d.id, ...d.data() })));
        }, () => safeSet(setRoomsLive, null));
      } catch {}

      try {
        unsub4Rooms = onSnapshot(collection(db, 'events', targetId, 'fourballRooms'), (snap) => {
          safeSet(setFourballRoomsLive, snap.docs.map((d) => ({ rid: d.id, ...d.data() })));
        }, () => safeSet(setFourballRoomsLive, null));
      } catch {}

      try {
        unsubInputs = onSnapshot(collection(db, 'events', targetId, 'eventInputs'), (snap) => {
          const nextMap = {};
          snap.docs.forEach((d) => { nextMap[d.id] = d.data(); });
          safeSet(setEventInputsLive, nextMap);
        }, () => safeSet(setEventInputsLive, null));
      } catch {}

      try {
        unsubPresence = onSnapshot(collection(db, 'events', targetId, 'presence'), (snap) => {
          safeSet(setPresenceLive, snap.docs.map((d) => ({ sessionId: d.id, ...d.data() })));
        }, () => safeSet(setPresenceLive, null));
      } catch {}
    } else {
      safeSet(setSelectedData, ctxEventData || null);
      safeSet(setParticipantsLive, null);
      safeSet(setPlayersLive, null);
      safeSet(setPlayerStatesLive, null);
      safeSet(setRoomsLive, null);
      safeSet(setFourballRoomsLive, null);
      safeSet(setEventInputsLive, null);
      safeSet(setPresenceLive, null);
    }

    return () => {
      mounted = false;
      if (typeof unsubDoc === 'function') unsubDoc();
      if (typeof unsubParts === 'function') unsubParts();
      if (typeof unsubPlayers === 'function') unsubPlayers();
      if (typeof unsubPStates === 'function') unsubPStates();
      if (typeof unsubRooms === 'function') unsubRooms();
      if (typeof unsub4Rooms === 'function') unsub4Rooms();
      if (typeof unsubInputs === 'function') unsubInputs();
      if (typeof unsubPresence === 'function') unsubPresence();
    };
  }, [effectiveEventId, ctxEventId, ctxEventData]);

  const refreshNow = useCallback(async () => {
    try {
      const eventsSnap = await getDocs(collection(db, 'events'));
      const list = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => String(b?.dateStart || '').localeCompare(String(a?.dateStart || '')));
      setEvents(list);

      if (!effectiveEventId) return;

      const targetId = effectiveEventId;
      const [docRes, partRes, playerRes, stateRes, roomRes, fourballRes, inputRes, presenceRes] = await Promise.allSettled([
        getDoc(doc(db, 'events', targetId)),
        getDocs(collection(db, 'events', targetId, 'participants')),
        getDocs(collection(db, 'events', targetId, 'players')),
        getDocs(collection(db, 'events', targetId, 'playerStates')),
        getDocs(collection(db, 'events', targetId, 'rooms')),
        getDocs(collection(db, 'events', targetId, 'fourballRooms')),
        getDocs(collection(db, 'events', targetId, 'eventInputs')),
        getDocs(collection(db, 'events', targetId, 'presence')),
      ]);

      if (docRes.status === 'fulfilled') setSelectedData(docRes.value.exists() ? docRes.value.data() : null);
      if (partRes.status === 'fulfilled') setParticipantsLive(partRes.value.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (playerRes.status === 'fulfilled') setPlayersLive(playerRes.value.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (stateRes.status === 'fulfilled') setPlayerStatesLive(stateRes.value.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (roomRes.status === 'fulfilled') setRoomsLive(roomRes.value.docs.map((d) => ({ rid: d.id, ...d.data() })));
      if (fourballRes.status === 'fulfilled') setFourballRoomsLive(fourballRes.value.docs.map((d) => ({ rid: d.id, ...d.data() })));
      if (inputRes.status === 'fulfilled') {
        const nextMap = {};
        inputRes.value.docs.forEach((d) => { nextMap[d.id] = d.data(); });
        setEventInputsLive(nextMap);
      }
      if (presenceRes.status === 'fulfilled') {
        setPresenceLive(presenceRes.value.docs.map((d) => ({ sessionId: d.id, ...d.data() })));
      }
    } catch {}
  }, [effectiveEventId]);

  return useMemo(() => {
    const availableEvents = Array.isArray(events) ? events : [];

    if (!effectiveEventId) {
      return {
        loading: false,
        empty: true,
        availableEvents,
        meta: {
          eventId: '',
          title: '대회를 선택해 주세요',
          mode: 'stroke',
          modeLabel: getModeLabel('stroke'),
          dateRange: '-',
          liveState: 'STALE',
          lastUpdatedAt: 0,
          lastUpdatedText: '-',
          lastUpdatedFrom: 'none',
        },
        statusCards: {},
        alerts: [],
        roomCards: [],
        eventCards: [],
        quickActions: [],
        debug: {},
      };
    }

    if (!selectedData) {
      return {
        loading: true,
        empty: false,
        availableEvents,
        meta: {
          eventId: effectiveEventId,
          title: '대회 데이터 로딩 중',
          mode: 'stroke',
          modeLabel: getModeLabel('stroke'),
          dateRange: '-',
          liveState: 'STALE',
          lastUpdatedAt: 0,
          lastUpdatedText: '-',
          lastUpdatedFrom: 'loading',
        },
        statusCards: {},
        alerts: [],
        roomCards: [],
        eventCards: [],
        quickActions: [],
        debug: {},
      };
    }

    const mode = selectedData?.mode === 'fourball' || selectedData?.mode === 'agm' ? 'fourball' : 'stroke';
    const roomNames = Array.isArray(selectedData?.roomNames) ? selectedData.roomNames : [];
    const roomCapacities = Array.isArray(selectedData?.roomCapacities) ? selectedData.roomCapacities : [];
    const participantsFromDoc = getParticipantsFromEvent(selectedData);
    const livePeople = Array.isArray(participantsLive) && participantsLive.length
      ? participantsLive
      : (Array.isArray(playersLive) && playersLive.length
        ? playersLive
        : (Array.isArray(playerStatesLive) && playerStatesLive.length ? playerStatesLive : null));

    const mergedParticipants = mergeParticipants(participantsFromDoc, livePeople || []);
    const participants = typeof overlayScoresToParticipants === 'function'
      ? overlayScoresToParticipants(mergedParticipants)
      : mergedParticipants;

    const eventInputsRoot = {
      ...((selectedData?.eventInputs && typeof selectedData.eventInputs === 'object') ? selectedData.eventInputs : {}),
      ...((eventInputsLive && typeof eventInputsLive === 'object') ? eventInputsLive : {}),
    };

    const checkedInSet = buildCheckedInSet(participantsLive, playersLive, playerStatesLive);
    const legacyCheckedInCount = participants.reduce((acc, participant) => acc + (isCheckedIn(participant, checkedInSet) ? 1 : 0), 0);
    const presenceActiveCount = countActivePresence(presenceLive);
    const checkedInCount = presenceActiveCount > 0 ? presenceActiveCount : legacyCheckedInCount;
    const totalParticipants = participantsFromDoc.length || participants.length || 0;
    const roomsEffective = buildRoomsEffective(mode, roomsLive, fourballRoomsLive);
    const assignedCountFromRooms = Array.isArray(roomsEffective) && roomsEffective.length
      ? (() => {
          const seen = new Set();
          roomsEffective.forEach((roomDoc) => {
            extractMembers(roomDoc).forEach((member, idx) => {
              const pid = typeof member === 'object' ? getParticipantKey(member, idx) : String(member || '');
              if (pid) seen.add(pid);
            });
          });
          return seen.size;
        })()
      : null;
    const assignedList = participants.filter(isCommittedAssignment);
    const assignedCount = assignedCountFromRooms ?? assignedList.length;
    const scoreFilledPeople = participants.reduce((acc, participant) => acc + (hasAnyScore(participant) ? 1 : 0), 0);
    const activeEvents = Array.isArray(selectedData?.events) ? selectedData.events.filter((event) => event?.enabled !== false) : [];
    const inferredRoomCount = Math.max(
      Number(selectedData?.roomCount) || 0,
      roomNames.length,
      Array.isArray(roomsEffective) ? roomsEffective.length : 0,
      ...participants.map((p) => Number(parseRoomNo(p?.roomNo ?? p?.room ?? p?.roomLabel) || 0)),
      0,
    );
    const byRoom = buildByRoom({ participants, roomsEffective, roomCount: inferredRoomCount, roomNames });
    const statusCards = buildStatusCards({ participants, totalParticipants, checkedInCount, assignedCount, scoreFilledPeople, activeEvents, eventInputsRoot });
    const roomCards = buildRoomCards({ byRoom, roomNames, roomCapacities, activeEvents, eventInputsRoot });
    const eventCards = buildEventCards({ activeEvents, participants, eventInputsRoot, byRoom, roomNames, roomsEffective });
    const alerts = buildAlerts({ totalParticipants, checkedInCount, assignedCount, scoreFilledPeople, roomCards, eventCards });
    const liveInfo = resolveLiveState(selectedData);

    const quickActions = [
      { id: 'go-step4', label: '업로드' },
      { id: 'go-assignment', label: '방배정' },
      { id: 'go-step6', label: '결과표' },
      { id: 'go-event-manager', label: '이벤트' },
      { id: 'refresh-now', label: '새로고침', onClick: refreshNow },
    ];

    return {
      loading: false,
      empty: false,
      availableEvents,
      meta: {
        eventId: effectiveEventId,
        title: String(selectedData?.title || 'Untitled Event'),
        mode,
        modeLabel: getModeLabel(mode),
        dateRange: formatDateRange(selectedData?.dateStart, selectedData?.dateEnd),
        liveState: liveInfo.liveState,
        lastUpdatedAt: liveInfo.lastUpdatedAt,
        lastUpdatedText: formatLastUpdated(liveInfo.lastUpdatedAt),
        lastUpdatedFrom: liveInfo.lastUpdatedFrom,
      },
      statusCards,
      alerts,
      roomCards,
      eventCards,
      quickActions,
      debug: {
        participantsUpdatedAt: toMillis(selectedData?.participantsUpdatedAt),
        scoresUpdatedAt: toMillis(selectedData?.scoresUpdatedAt),
        eventInputsUpdatedAt: toMillis(selectedData?.eventInputsUpdatedAt),
        snapshotFreshnessMs: liveInfo.freshness,
        sourceSummary: {
          participantsFromDoc: participantsFromDoc.length,
          participantsMerged: participants.length,
          activeEvents: activeEvents.length,
          roomCount: inferredRoomCount,
          hasEventInputs: Object.keys(eventInputsRoot).length,
          presenceDocsCount: Array.isArray(presenceLive) ? presenceLive.length : 0,
          presenceActiveCount: countActivePresence(presenceLive),
          presenceLatestFreshAt: Array.isArray(presenceLive) && presenceLive.length
            ? Math.max(...presenceLive.map((x) => getPresenceFreshAt(x)))
            : 0,
        },
      },
    };
  }, [
    events,
    effectiveEventId,
    selectedData,
    participantsLive,
    playersLive,
    playerStatesLive,
    roomsLive,
    fourballRoomsLive,
    eventInputsLive,
    presenceLive,
    overlayScoresToParticipants,
    refreshNow,
  ]);
}
