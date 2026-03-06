// /src/events/groupBattle.js
// 그룹/개인 대결(group-battle) 계산 유틸
// - metric: score | result
// - mode: group | single
// - 정렬: rankOrder asc/desc
// - 동점 처리: 그룹=멤버 G핸디 합 낮은 쪽 우선 / 개인=G핸디 낮은 쪽 우선
// - 반땅룰 미적용(확정)

export function computeMetricValue(metric, p, handicapOverride) {
  const score = Number(p?.score ?? 0) || 0;
  const baseHd = Number(p?.handicap ?? 0) || 0;
  const ov = Number(handicapOverride);
  const hd = Number.isFinite(ov) ? ov : baseHd;

  // group-battle의 "결과"는 항상 (점수 - G핸디)로 고정 (반땅 미적용)
  if (metric === 'score') return score;
  return score - hd;
}

export function computeGroupBattle(eventDef, participants = [], opt = {}) {
  const params = eventDef?.params || {};
  const mode = params.mode === 'single' ? 'single' : 'group';
  const metric = params.metric === 'score' ? 'score' : 'result';
  const order = (eventDef?.rankOrder === 'desc') ? 'desc' : 'asc';
  const sign = order === 'desc' ? -1 : 1;

  // 이벤트 전용 G핸디 오버라이드(다른 페이지/참가자 데이터와 연동 금지)
  const handicapOverrides = (params.handicapOverrides && typeof params.handicapOverrides === 'object')
    ? params.handicapOverrides
    : {};

  const roomNames = Array.isArray(opt.roomNames) ? opt.roomNames : [];
  const nameOfRoom = (roomNo) => {
    const n = Number(roomNo);
    if (!Number.isFinite(n) || n < 1) return '';
    return roomNames[n - 1]?.trim() || `${n}번방`;
  };

  const byId = new Map((participants || []).map(p => [String(p.id), p]));

  if (mode === 'single') {
    const ids = Array.isArray(params.memberIds) ? params.memberIds.map(String) : [];
    const rows = ids
      .map(id => byId.get(String(id)))
      .filter(Boolean)
      .map(p => {
        const baseHandicap = Number(p.handicap ?? 0) || 0;
        const ov = Number(handicapOverrides[String(p.id)]);
        const handicap = Number.isFinite(ov) ? ov : baseHandicap;
        const score = Number(p.score ?? 0) || 0;
        return {
          id: String(p.id),
          name: p.nickname || '',
          room: p.room ?? null,
          roomLabel: nameOfRoom(p.room),
          handicap,
          score,
          value: computeMetricValue(metric, p, handicapOverrides[String(p.id)]),
        };
      });

    rows.sort((a, b) => {
      // value 우선, 동점이면 handicap 낮은 쪽 우선
      return sign * (a.value - b.value) || (a.handicap - b.handicap);
    });

    return { kind: 'person', metric, order, rows };
  }

  // group mode
  const groups = Array.isArray(params.groups) ? params.groups : [];
  const out = groups.map((g, gi) => {
    const memberIds = Array.isArray(g?.memberIds) ? g.memberIds.map(String) : [];
    const members = memberIds
      .map(id => byId.get(String(id)))
      .filter(Boolean)
      .map(p => {
        const baseHandicap = Number(p.handicap ?? 0) || 0;
        const ov = Number(handicapOverrides[String(p.id)]);
        const handicap = Number.isFinite(ov) ? ov : baseHandicap;
        const score = Number(p.score ?? 0) || 0;
        const value = computeMetricValue(metric, p, handicapOverrides[String(p.id)]);
        return {
          id: String(p.id),
          name: p.nickname || '',
          room: p.room ?? null,
          roomLabel: nameOfRoom(p.room),
          handicap,
          score,
          value,
        };
      });

    const total = members.reduce((s, m) => s + (Number(m.value) || 0), 0);
    const hdSum = members.reduce((s, m) => s + (Number(m.handicap) || 0), 0);

    // 멤버 표시는 방번호 기준으로 안정적으로 정렬
    members.sort((a, b) => (Number(a.room ?? 999) - Number(b.room ?? 999)) || String(a.name).localeCompare(String(b.name)));

    return {
      key: g?.key || `g${gi + 1}`,
      name: String(g?.name ?? `그룹${gi + 1}`),
      value: total,
      handicapSum: hdSum,
      members,
    };
  });

  out.sort((a, b) => {
    return sign * (a.value - b.value) || (a.handicapSum - b.handicapSum);
  });

  return { kind: 'group', metric, order, rows: out };
}
