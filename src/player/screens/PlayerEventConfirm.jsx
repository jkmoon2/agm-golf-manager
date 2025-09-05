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
    case 'range-convert': {
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
function foldAccum(obj, aggregator='sum'){
  const vals = Array.isArray(obj?.values) ? obj.values : [];
  return aggregate(vals, aggregator);
}

export default function PlayerEventConfirm() {
  const nav = useNavigate();
  const { eventId: urlEventId } = useParams();

  const { roomCount, roomNames } = useContext(PlayerContext) || {};
  const { eventId, loadEvent, eventData } = useContext(EventContext) || {};

  useEffect(() => {
    if (urlEventId && urlEventId !== eventId && typeof loadEvent === 'function') {
      loadEvent(urlEventId);
    }
  }, [urlEventId, eventId, loadEvent]);

  const participants = useMemo(
    () => Array.isArray(eventData?.participants) ? eventData.participants : [],
    [eventData]
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

    if (target === 'person') {
      const rows = participants.map(p => {
        const slot = inputsByEvent?.[evId]?.person?.[p.id];
        let val;
        if (typeof slot === 'object' && slot && Array.isArray(slot.values)) {
          const folded = foldAccum(slot, agg);
          val = evaluateValue(template, params, folded);
        } else {
          val = evaluateValue(template, params, slot);
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
          const per = (typeof slot === 'object' && slot && Array.isArray(slot.values))
            ? foldAccum(slot, agg)
            : asNum(slot);
          return evaluateValue(template, params, per);
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
            const per = (typeof slot === 'object' && slot && Array.isArray(slot.values))
              ? foldAccum(slot, agg)
              : asNum(slot);
            return evaluateValue(template, params, per);
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
            const unit  = res.kind === 'person' ? '개인' : (res.kind === 'team' ? '팀' : '방');
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
                        <th className={tCss.cell}>{res.kind === 'room' ? '방' : res.kind === 'team' ? '팀' : '방'}</th>
                        <th className={tCss.cell}>점수</th>
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
                          <td className={tCss.cell}>{fmtScore(row.value)}</td>
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
