// /src/player/screens/PlayerEventConfirm.jsx
// (변경사항: JSX는 이전 버전과 동일 — 표/레이아웃/중앙정렬/네비 모두 그대로 유지)
// 카드 폭 조정은 CSS에서 처리합니다.

import React, { useMemo, useContext, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PlayerContext } from '../../contexts/PlayerContext';
import { EventContext }   from '../../contexts/EventContext';
import StickyNavBar       from '../components/StickyNavBar';

import baseCss from './PlayerRoomTable.module.css';
import styles  from './PlayerRoomSelect.module.css';
import tCss    from './PlayerEventConfirm.module.css';

import { buildTeamsByRoom } from '../../events/utils';
import { computeGroupBattle } from '../../events/groupBattle';
import { computePickLineup } from '../../events/pickLineup';
import { computeHoleRankForce } from '../../events/holeRankForce';
import { computeGroupRoomHoleBattle } from '../../events/groupRoomHoleBattle';
import { buildBingoRoomRowsFromPersonRows, computeBingo } from '../../events/bingo';

const asNum = (v) => (v === '' || v == null ? NaN : Number(v));
const isFiniteNum = (n) => Number.isFinite(n);

// 소수점 1자리 표시(정수면 소수점 생략)
const fmtScore = (n) => {
  if (!isFiniteNum(n)) return '-';
  const r = Math.round(n * 10) / 10;
  return (r % 1 === 0) ? String(r) : r.toFixed(1);
};

function evaluateValue(template, params, rawValue){
  const v = asNum(rawValue);
  if (!isFiniteNum(v)) return NaN;
  switch (template) {
    case 'number-convert': {
      const factor = asNum(params?.factor);
      return Number.isFinite(factor) ? v * factor : v;
    }
    case 'range-convert':
    case 'range-convert-bonus': {
      const table = Array.isArray(params?.table) ? params.table : [];
      for (const item of table) {
        const min = asNum(item?.min), max = asNum(item?.max);
        if (Number.isFinite(min) && Number.isFinite(max) && v >= min && v <= max) {
          return asNum(item?.score);
        }
      }
      return NaN;
    }
    case 'raw-number':
    default:
      return v;
  }
}
function aggregate(values, aggregator='sum'){
  const arr = (Array.isArray(values) ? values : []).map(asNum).filter(isFiniteNum);
  if (!arr.length) return NaN;
  switch (aggregator) {
    case 'avg':  return Math.round(arr.reduce((a,b)=>a+b,0) / arr.length);
    case 'best': return Math.min(...arr);
    case 'count':return arr.length;
    case 'sum':
    default:     return arr.reduce((a,b)=>a+b,0);
  }
}

function bonusMapFromParams(params){
  const rows = Array.isArray(params?.bonus) ? params.bonus : [];
  const map = {};
  rows.forEach(r => { if (r && r.label != null) map[String(r.label)] = Number(r.score||0); });
  return map;
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

function foldAccum(obj, aggregator='sum'){
  const vals = Array.isArray(obj?.values) ? obj.values : [];
  return aggregate(vals, aggregator);
}

export default function PlayerEventConfirm() {
  const nav = useNavigate();
  const { eventId: urlEventId } = useParams();

  const { roomCount, roomNames } = useContext(PlayerContext) || {};
  const { eventId, loadEvent, eventData, overlayScoresToParticipants } = useContext(EventContext) || {};

  useEffect(() => {
    if (urlEventId && urlEventId !== eventId && typeof loadEvent === 'function') {
      loadEvent(urlEventId);
    }
  }, [urlEventId, eventId, loadEvent]);
  const participantsBase = useMemo(
    () => getEffectiveParticipants(eventData),
    [eventData?.mode, eventData?.participants, eventData?.participantsStroke, eventData?.participantsFourball]
  );
  const participants = useMemo(
    () => (typeof overlayScoresToParticipants === 'function' ? overlayScoresToParticipants(participantsBase) : participantsBase),
    [participantsBase, overlayScoresToParticipants]
  );
const events = useMemo(
    () => Array.isArray(eventData?.events) ? eventData.events.filter(e => e?.enabled !== false) : [],
    [eventData]
  );
  const inputsByEvent = eventData?.eventInputs || {};

  const getRoomLabel = (idx1) => {
    const i = Number(idx1) - 1;
    if (Array.isArray(roomNames) && roomNames[i] && String(roomNames[i]).trim()) {
      return String(roomNames[i]).trim();
    }
    return `${idx1}번방`;
  };

  function buildScores(ev){
    const { id: evId, target = 'person', template='raw-number', params={}, rankOrder='asc' } = ev || {};
    const agg = params?.aggregator || 'sum';



    // ── hole-rank-force(홀별 강제 순위 점수) ─────────────────────
    if (template === 'hole-rank-force') {
      const data = computeHoleRankForce(ev, participants, inputsByEvent, { roomNames, roomCount });
      if (target === 'room') {
        const rows = (data.roomRows || []).map((r, i) => ({
          key: r.key || String(i),
          rank: i + 1,
          label: r.name,
          value: r.value,
        }));
        return { kind: 'room', metricLabel: '합계', rows };
      }
      if (target === 'team') {
        const rows = (data.teamRows || []).map((r, i) => ({
          key: r.key || String(i),
          rank: i + 1,
          label: r.label,
          value: r.value,
        }));
        return { kind: 'team', metricLabel: '합계', rows };
      }
      const rows = (data.personRows || []).map((r, i) => ({
        key: r.key || String(i),
        rank: i + 1,
        label: r.name,
        room: r.roomLabel || (r.room ? `${r.room}번방` : ''),
        value: r.value,
      }));
      return { kind: 'person', metricLabel: '합계', rows };
    }

    // ── pick-lineup(개인/조 선택 대결) ──────────────────────────
    if (template === 'pick-lineup') {
      const data = computePickLineup(ev, participants, inputsByEvent?.[evId] || {}, { roomNames });
      const rows = (data?.rows || []).map((r, i) => ({
        key: r.key || String(i),
        rank: i + 1,
        label: r.name,
        room: r.roomLabel || (r.room ? `${r.room}번방` : ''),
        value: r.value,
      }));
      return { kind: 'person', metricLabel: '합계', rows };
    }

    // ── bingo(빙고) ───────────────────────────────────────────────
    if (template === 'bingo') {
      const data = computeBingo(ev, participants, inputsByEvent, { roomNames, roomCount });
      if (target === 'team') {
        const rows = (data.teamRows || []).map((r, i) => ({
          key: r.key || String(i),
          rank: i + 1,
          label: r.label,
          value: r.value,
        }));
        return { kind: 'team', metricLabel: '빙고', rows };
      }
      if (target === 'person') {
        const rows = (data.personRows || []).map((r, i) => ({
          key: r.key || String(i),
          rank: i + 1,
          label: r.name,
          room: r.roomLabel || (r.room ? `${r.room}번방` : ''),
          value: r.value,
        }));
        return { kind: 'person', metricLabel: '빙고', rows };
      }
      const roomRows = buildBingoRoomRowsFromPersonRows(data.personRows || [], roomCount, roomNames);
      const rows = roomRows.map((r, i) => ({
        key: r.key || String(i),
        rank: i + 1,
        label: r.name,
        value: r.value,
      }));
      return { kind: 'room', metricLabel: '빙고', rows };
    }

    // ── group-room-hole-battle(그룹/방 홀별 지목전) ───────────────
    if (template === 'group-room-hole-battle') {
      const data = computeGroupRoomHoleBattle(ev, participants, inputsByEvent?.[evId] || {}, { roomNames, roomCount });
      const metricLabel = data?.metric === 'match' ? '결과' : '합계';
      const rows = (data.rows || []).map((row, i) => ({
        key: row.key || String(i),
        rank: i + 1,
        label: row.name,
        value: row.value,
        displayText: row.displayTotal || '',
        displayColor: row.displayColor || '',
      }));
      return { kind: data?.kind === 'group' ? 'group' : data?.kind === 'person' ? 'person' : 'room', metricLabel, rows };
    }

    // ── group-battle(그룹/개인 대결) ───────────────────────────────
    // - 입력 이벤트가 아니므로 inputsByEvent를 사용하지 않음
    // - metric=result 인 경우: (점수 - (이벤트 전용 오버라이드 G핸디)) 합산
    if (template === 'group-battle') {
      const data = computeGroupBattle(ev, participants, { roomNames });
      const metricLabel = (data?.metric === 'score') ? '점수' : '결과';

      if (data?.kind === 'group') {
        const rows = (data.rows || []).map((g, i) => ({
          key: g.key || g.name || String(i),
          rank: i + 1,
          label: g.name,
          value: g.value,
        }));
        return { kind: 'group', metricLabel, rows };
      }

      // 일반모드(개인선택)도 Player STEP6에서는 개인 순위로 출력
      const rows = (data?.rows || []).map((r, i) => ({
        key: r.id || String(i),
        rank: i + 1,
        label: r.name,
        room: r.roomLabel || (r.room ? `${r.room}번방` : ''),
        value: r.value,
      }));
      return { kind: 'person', metricLabel, rows };
    }
    if (target === 'person') {
      const rows = participants.map(p => {
        const slot = inputsByEvent?.[evId]?.person?.[p.id];
        let val;
        if (typeof slot === 'object' && slot && Array.isArray(slot.values)) {
          let folded;
          if (template === 'range-convert-bonus') {
            const map = bonusMapFromParams(params);
            const vals = Array.isArray(slot.values) ? slot.values : [];
            const bons = Array.isArray(slot.bonus) ? slot.bonus : [];
            let total = 0;
            for (let i=0;i<vals.length;i++){
              const base = evaluateValue('range-convert', params, vals[i]);
              total += (Number.isFinite(base)? base : 0) + (map[String(bons[i]||'')] || 0);
            }
            folded = total;
          } else {
            folded = foldAccum(slot, agg);
          }
          val = evaluateValue(template === 'range-convert-bonus' ? 'raw-number' : template, params, folded);
        } else {
          if (template === 'range-convert-bonus' && typeof slot === 'object' && slot){
          const base = evaluateValue('range-convert', params, slot?.values ? slot.values[0] : slot);
          const map = bonusMapFromParams(params);
          const b = (Array.isArray(slot.bonus) ? slot.bonus[0] : slot.bonus);
          val = (Number.isFinite(base)? base:0) + (map[String(b||'')]||0);
        } else {
          val = evaluateValue(template, params, slot);
        }
        }
        return { key: String(p.id), label: String(p.nickname || ''), room: p.room ? getRoomLabel(p.room) : '-', value: asNum(val) };
      }).filter(r => isFiniteNum(r.value));

      rows.sort((a,b)=> rankOrder==='desc' ? b.value - a.value : a.value - b.value);
      rows.forEach((r,i)=> r.rank = i+1);
      return { kind:'person', rows };
    }

    if (target === 'room') {
      const roomTotal = Number(roomCount || 0);
      const byRoom = Array.from({ length: roomTotal }, (_,i)=>i+1).map(idx1 => {
        const inRoom = participants.filter(p => Number(p?.room) === idx1);
        const vals = inRoom.map(p => {
          const slot = inputsByEvent?.[evId]?.person?.[p.id];
          let per;
          if (typeof slot === 'object' && slot && Array.isArray(slot.values)){
            if (template === 'range-convert-bonus'){
              const map = bonusMapFromParams(params);
              let total=0; const vals=slot.values||[]; const bons=slot.bonus||[];
              for (let i=0;i<vals.length;i++){
                const base = evaluateValue('range-convert', params, vals[i]);
                total += (Number.isFinite(base)?base:0) + (map[String(bons[i]||'')]||0);
              }
              per = total;
            } else per = foldAccum(slot, agg);
          } else per = asNum(slot);
          return evaluateValue(template==='range-convert-bonus' ? 'raw-number' : template, params, per);
        }).filter(isFiniteNum);
        const value = aggregate(vals, agg);
        return { key: String(idx1), label: getRoomLabel(idx1), value: asNum(value) };
      }).filter(r => isFiniteNum(r.value));

      byRoom.sort((a,b)=> rankOrder==='desc' ? b.value - a.value : a.value - b.value);
      byRoom.forEach((r,i)=> r.rank = i+1);
      return { kind:'room', rows: byRoom };
    }

    if (target === 'team') {
      let teamsByRoom = [];
      try {
        const built = buildTeamsByRoom(participants, Number(roomCount || 0));
        teamsByRoom = Array.isArray(built?.teamsByRoom) ? built.teamsByRoom : [];
      } catch { teamsByRoom = []; }

      const rows = [];
      teamsByRoom.forEach(team => {
        const members = Array.isArray(team?.members) ? team.members : [];
        const vals = members
          .map(m => {
            const slot = inputsByEvent?.[evId]?.person?.[m?.id];
            let per;
            if (typeof slot === 'object' && slot && Array.isArray(slot.values)){
              if (template === 'range-convert-bonus'){
                const map = bonusMapFromParams(params);
                let total=0; const vals=slot.values||[]; const bons=slot.bonus||[];
                for (let i=0;i<vals.length;i++){
                  const base = evaluateValue('range-convert', params, vals[i]);
                  total += (Number.isFinite(base)?base:0) + (map[String(bons[i]||'')]||0);
                }
                per = total;
              } else per = foldAccum(slot, agg);
            } else per = asNum(slot);
            return evaluateValue(template==='range-convert-bonus' ? 'raw-number' : template, params, per);
          })
          .filter(isFiniteNum);

        const value = aggregate(vals, agg);
        const roomNo = Number(team?.roomIdx) + 1;
        const teamName = (team?.key && String(team.key).includes('-')) ? String(team.key).split('-')[1] : 'A';

        rows.push({ key: String(team?.key ?? `room${roomNo}-A`), label: `${getRoomLabel(roomNo)} ${teamName}팀`, value: asNum(value) });
      });

      const filtered = rows.filter(r => isFiniteNum(r.value));
      filtered.sort((a,b)=> rankOrder==='desc' ? b.value - a.value : a.value - b.value);
      filtered.forEach((r,i)=> r.rank = i+1);
      return { kind:'team', rows: filtered };
    }

    return { kind:'person', rows: [] };
  }

  const results = useMemo(() => {
    return events.map(ev => ({ ev, res: buildScores(ev) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(events), JSON.stringify(inputsByEvent), JSON.stringify(participants), roomCount, JSON.stringify(roomNames)]);

  return (
    <div className={styles.container} style={{ paddingBottom: 160 }}>
      {false && (
        <div className={styles.notice} style={{ marginTop: 12 }}>
          최종 확인을 마치셨다면 ‘홈’으로 이동해 주세요.
        </div>
      )}

      <div className={baseCss.page}>
        <div className={baseCss.content}>

          {results.map(({ ev, res }) => {
            const title = ev?.title || '이벤트';
            const unit  = res.kind === 'person' ? '개인' : (res.kind === 'team' ? '팀' : (res.kind === 'group' ? '그룹' : '방'));
            return (
              <div key={ev.id} className={`${baseCss.card} ${tCss.eventCard}`}>
                <div className={baseCss.cardHeader}>
                  <div className={`${baseCss.cardTitle} ${tCss.eventTitle}`}>
                    {title} <span style={{ color:'#9aa3ad', fontWeight:400, marginLeft:6 }}>· {unit} 순위</span>
                  </div>
                </div>

                <div className={`${baseCss.tableWrap} ${tCss.noOverflow}`}>
                  <table className={`${tCss.table} ${tCss['kind-' + res.kind]}`}>
                    <colgroup>
                      <col style={{ width: 56 }} />
                      {res.kind === 'person' && <col style={{ width: '50%' }} />}
                      <col />
                      <col style={{ width: 80 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className={tCss.cell}>순위</th>
                        {res.kind === 'person' && <th className={tCss.cell}>닉네임</th>}
                        <th className={tCss.cell}>{res.kind === 'room' ? '방' : res.kind === 'team' ? '팀' : (res.kind === 'group' ? '그룹' : '방')}</th>
                        <th className={tCss.cell}>{res.metricLabel || '점수'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {res.rows.length === 0 && (
                        <tr>
                          <td className={tCss.cell} colSpan={res.kind==='person' ? 4 : 3} style={{ color:'#999' }}>
                            입력된 데이터가 없습니다.
                          </td>
                        </tr>
                      )}
                      {res.rows.map(row => (
                        <tr key={row.key}>
                          <td className={tCss.cell}>{row.rank}</td>
                          {res.kind === 'person' && <td className={tCss.cell}>{row.label}</td>}
                          <td className={tCss.cell}>
                            {res.kind === 'person' ? (row.room || '-') : row.label}
                          </td>
                          <td className={tCss.cell} style={row.displayColor ? { color: row.displayColor, fontWeight: 800 } : undefined}>{row.displayText || fmtScore(row.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <div className={baseCss.footerNav}>
            <button
              className={`${baseCss.navBtn} ${baseCss.navPrev}`}
              onClick={() => nav(`/player/home/${eventId || urlEventId}/5`)}
            >
              ← 이전
            </button>
            <button
              className={`${baseCss.navBtn} ${baseCss.navNext}`}
              onClick={() => nav(`/player/home/${eventId || urlEventId}`)}
            >
              홈
            </button>
          </div>
        </div>
      </div>

      {false && (
        <StickyNavBar
          left={{ label: '← 이전', to: `/player/home/${eventId || urlEventId}/5`, variant: 'gray' }}
          right={{ label: '홈',     to: `/player/home/${eventId || urlEventId}`,     variant: 'blue' }}
        />
      )}
    </div>
  );
}
