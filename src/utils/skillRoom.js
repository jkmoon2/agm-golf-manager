// /src/utils/skillRoom.js
// 특별방(유사 G핸디 참가자 반강제 배정) 공용 유틸
// - 내부 저장 키/파일명(skillRoomConfig)은 기존 버전과의 하위 호환을 위해 그대로 유지
// - 설정 저장 위치: events/{eventId}.skillRoomConfig
// - 0조는 특별방 참가자를 표시하기 위한 예약 조 번호로 지원
// - Admin 강제 배정은 기존 동작을 유지하고, 자동/수동/Player 배정에서만 제한을 적용

const normId = (v) => String(v ?? '').trim();
const toRoomNo = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
};

export const EMPTY_SKILL_ROOM_CONFIG = Object.freeze({
  enabled: false,
  groups: [],
});

export function normalizeSkillRoomConfig(raw = {}, opt = {}) {
  const roomCount = Number(opt?.roomCount || 0);
  const participants = Array.isArray(opt?.participants) ? opt.participants : [];
  const participantIds = new Set(participants.map((p) => normId(p?.id)).filter(Boolean));
  const hasParticipantList = participantIds.size > 0;

  const src = raw && typeof raw === 'object' ? raw : {};
  const usedRooms = new Set();
  const usedParticipants = new Set();
  const groups = [];

  (Array.isArray(src.groups) ? src.groups : []).forEach((g, idx) => {
    if (!g || typeof g !== 'object') return;
    const roomNo = toRoomNo(g.roomNo ?? g.room ?? g.roomNumber);
    if (!roomNo) return;
    if (roomCount > 0 && roomNo > roomCount) return;
    // 한 방을 여러 특별방 그룹이 동시에 예약하면 의미가 모호해지므로 첫 그룹만 유지
    if (usedRooms.has(roomNo)) return;
    usedRooms.add(roomNo);

    const ids = [];
    const rawIds = Array.isArray(g.participantIds) ? g.participantIds : [];
    rawIds.forEach((idRaw) => {
      const id = normId(idRaw);
      if (!id || usedParticipants.has(id)) return;
      if (hasParticipantList && !participantIds.has(id)) return;
      usedParticipants.add(id);
      ids.push(id);
    });

    groups.push({
      id: normId(g.id) || `skill-room-${idx + 1}`,
      roomNo,
      participantIds: ids,
      includeInRoomRanking: g.includeInRoomRanking !== false,
      participateInEvents: g.participateInEvents !== false,
    });
  });

  return {
    enabled: src.enabled === true,
    groups,
  };
}

export function isSkillRoomEnabled(raw, opt = {}) {
  const cfg = normalizeSkillRoomConfig(raw, opt);
  return cfg.enabled && cfg.groups.length > 0;
}

export function isSpecialGroupParticipant(participant) {
  return Number(participant?.group) === 0;
}

export function getSkillRoomGroupForParticipant(raw, participantId, opt = {}) {
  const pid = normId(participantId);
  if (!pid) return null;
  const cfg = normalizeSkillRoomConfig(raw, opt);
  if (!cfg.enabled) return null;
  return cfg.groups.find((g) => g.participantIds.includes(pid)) || null;
}

export function getSkillRoomParticipantIdSet(raw, opt = {}) {
  const cfg = normalizeSkillRoomConfig(raw, opt);
  const set = new Set();
  if (!cfg.enabled) return set;
  cfg.groups.forEach((g) => g.participantIds.forEach((id) => set.add(normId(id))));
  return set;
}

export function getSkillReservedRoomSet(raw, opt = {}) {
  const cfg = normalizeSkillRoomConfig(raw, opt);
  if (!cfg.enabled) return new Set();
  return new Set(cfg.groups.map((g) => Number(g.roomNo)).filter(Number.isFinite));
}

export function getUnconfiguredSpecialGroupParticipants(raw, participants = [], opt = {}) {
  const list = Array.isArray(participants) ? participants : [];
  const cfg = normalizeSkillRoomConfig(raw, { ...opt, participants: list });
  const selectedIds = getSkillRoomParticipantIdSet(cfg, { ...opt, participants: list });
  return list.filter((p) => (
    p && p.id != null && String(p.nickname || '').trim() &&
    isSpecialGroupParticipant(p) && !selectedIds.has(normId(p.id))
  ));
}

/**
 * 자동/수동 배정 시 특정 참가자가 들어갈 수 있는 방.
 * - 특별방 대상 참가자: 자신의 예약 방만
 * - 일반 참가자: 특별방으로 예약된 방을 제외한 기존 방
 * - 0조인데 특별방에 아직 선택되지 않은 참가자: 잘못 일반방으로 섞이지 않도록 후보 없음
 * - 기능 미사용: 기존 모든 방(단, 0조는 특별방 설정이 필요하므로 후보 없음)
 */
export function getSkillAllowedRoomNumbers(raw, participantId, roomNumbers = [], opt = {}) {
  const rooms = (Array.isArray(roomNumbers) ? roomNumbers : [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 1);
  const participants = Array.isArray(opt?.participants) ? opt.participants : [];
  const pid = normId(participantId);
  const participant = participants.find((p) => normId(p?.id) === pid) || null;
  const cfg = normalizeSkillRoomConfig(raw, opt);

  const group = getSkillRoomGroupForParticipant(cfg, participantId, opt);
  if (group) return rooms.includes(Number(group.roomNo)) ? [Number(group.roomNo)] : [];

  // 0조는 특별방 전용 표시값입니다. 특별방 선택 누락 상태로 일반방에 들어가는 것을 막습니다.
  if (isSpecialGroupParticipant(participant)) return [];

  if (!cfg.enabled || !cfg.groups.length) return rooms;

  const reserved = getSkillReservedRoomSet(cfg, opt);
  return rooms.filter((roomNo) => !reserved.has(Number(roomNo)));
}

/**
 * 포볼 파트너 후보 제한.
 * - 일반 참가자용 기존 포볼에서만 사용
 * - 특별방 참가자는 포볼에서도 스트로크 방식(파트너 없음)으로 처리하므로 이 함수로 파트너를 만들지 않음
 * - 일반 참가자: 특별방 대상자를 후보에서 제외
 */
export function filterSkillFourballPartnerPool(raw, selfId, pool = [], opt = {}) {
  const cfg = normalizeSkillRoomConfig(raw, opt);
  const list = Array.isArray(pool) ? pool : [];
  if (!cfg.enabled || !cfg.groups.length) return list;

  const mine = getSkillRoomGroupForParticipant(cfg, selfId, opt);
  if (mine) return [];

  const specialIds = getSkillRoomParticipantIdSet(cfg, opt);
  return list.filter((p) => !specialIds.has(normId(p?.id)) && !isSpecialGroupParticipant(p));
}

export function isSkillRoomEventParticipant(raw, participantId, opt = {}) {
  const cfg = normalizeSkillRoomConfig(raw, opt);
  if (!cfg.enabled || !cfg.groups.length) return true;
  const group = getSkillRoomGroupForParticipant(cfg, participantId, opt);
  if (!group) return true;
  return group.participateInEvents !== false;
}

export function filterSkillRoomEventParticipants(raw, participants = [], opt = {}) {
  const list = Array.isArray(participants) ? participants : [];
  const cfg = normalizeSkillRoomConfig(raw, { ...opt, participants: list });
  if (!cfg.enabled || !cfg.groups.length) return list;

  const excluded = new Set();
  cfg.groups.forEach((g) => {
    if (g.participateInEvents === false) {
      g.participantIds.forEach((id) => excluded.add(normId(id)));
    }
  });
  if (!excluded.size) return list;
  return list.filter((p) => !excluded.has(normId(p?.id)));
}

/** 방 최종순위 계산에서 제외할 특별방 방번호 Set<number> */
export function getSkillRoomRankExcludedRoomSet(raw, opt = {}) {
  const cfg = normalizeSkillRoomConfig(raw, opt);
  const out = new Set();
  if (!cfg.enabled) return out;
  cfg.groups.forEach((g) => {
    if (g.includeInRoomRanking === false) out.add(Number(g.roomNo));
  });
  return out;
}

export function getSkillRoomSummary(raw, opt = {}) {
  const cfg = normalizeSkillRoomConfig(raw, opt);
  if (!cfg.enabled || !cfg.groups.length) return { enabled: false, roomCount: 0, participantCount: 0 };
  const ids = new Set();
  cfg.groups.forEach((g) => g.participantIds.forEach((id) => ids.add(normId(id))));
  return { enabled: true, roomCount: cfg.groups.length, participantCount: ids.size };
}
