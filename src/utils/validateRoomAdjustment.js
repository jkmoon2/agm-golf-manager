// /src/utils/validateRoomAdjustment.js
// STEP4 저장 전 방조정 3종과 기존 방 구성의 전체 배정 가능성 검사.
// 실제 배정/점수 계산은 변경하지 않고, 저장 가능 여부만 판정합니다.
import { getSkillRoomParticipantIdSet, getSkillRoomGroupForParticipant, getSkillReservedRoomSet } from './skillRoom';
import { getRoomConstraintIssues, normalizeRoomAvoidance, roomConstraintsActive } from './roomAvoidance';

export function validateRoomAdjustment(raw, participants, { mode = 'stroke', roomCount = 4, roomCapacities = [], roomNames = [], skillRoomConfig = null, maxNodes = 400000 } = {}) {
  const people = (participants || []).filter(p => p && p.id != null && String(p.nickname || '').trim());
  const cfg = normalizeRoomAvoidance(raw, people, skillRoomConfig);
  const issues = getRoomConstraintIssues(cfg, people, roomCount);
  if (issues.length) return { status: 'invalid', issues };
  if (!roomConstraintsActive(cfg)) return { status: 'ok', issues: [] };
  const name = id => { const p = people.find(x => String(x.id) === String(id)); return p ? `${p.group}조 ${p.nickname}` : String(id); };
  const roomName = r => String(roomNames[r - 1] || '').trim() || `${r}번 방`;
  const caps = Array.from({length: roomCount}, (_,i) => {
    const rawCap = Number(roomCapacities?.[i]);
    return Number.isFinite(rawCap) && rawCap >= 1 ? Math.min(4, Math.floor(rawCap)) : 4;
  });
  const specialIds = getSkillRoomParticipantIdSet(skillRoomConfig, {roomCount,participants:people});
  const reserved = getSkillReservedRoomSet(skillRoomConfig, {roomCount,participants:people});
  const ids = people.map(p=>String(p.id));
  const byId = new Map(people.map(p=>[String(p.id),p]));
  const parent = new Map(ids.map(id=>[id,id]));
  const root = id => { let x=id; while(parent.get(x)!==x) x=parent.get(x); return x; };
  const union = (a,b) => {parent.set(root(b),root(a));};
  if (cfg.sameRoomEnabled) (cfg.sameRoomPairs || []).forEach(([a,b])=>union(a,b));
  const sets=new Map();
  ids.forEach(id => { const k=root(id); if(!sets.has(k)) sets.set(k,[]); sets.get(k).push(byId.get(id)); });
  const groups=[...sets.values()];
  const fixedById = new Map((cfg.roomSelectionEnabled ? cfg.roomSelections : []).map(x=>[String(x.id),Number(x.room)]));
  const forbidden = new Set((cfg.enabled ? cfg.pairs : []).map(([a,b]) => [a,b].sort().join('|')));
  const deny=(a,b)=>forbidden.has([String(a),String(b)].sort().join('|'));
  const isFourball = mode === 'fourball';
  const capacityIssues=[];
  const parts=groups.map(members=>{
    const forced = new Set();
    for (const p of members) {
      const id=String(p.id);
      if (fixedById.has(id)) forced.add(fixedById.get(id));
      const s=getSkillRoomGroupForParticipant(skillRoomConfig,id,{roomCount,participants:people});
      if(s) forced.add(Number(s.roomNo));
      if(Number(p.group)===0 && !s) capacityIssues.push(`${name(id)}: 특별방(0조) 배정이 설정되지 않았습니다.`);
    }
    if(forced.size>1) capacityIssues.push(`${members.map(p=>name(p.id)).join(' ↔ ')}: 한방-페어인데 지정된 방이 서로 다릅니다.`);
    const hasSpecial=members.some(p=>specialIds.has(String(p.id)));
    if (members.some(p=>specialIds.has(String(p.id))) && members.some(p=>!specialIds.has(String(p.id)))) {
      capacityIssues.push(`${members.map(p=>name(p.id)).join(' ↔ ')}: 특별방과 일반방 참가자는 같은 방에 들어갈 수 없습니다.`);
    }
    for(let i=0;i<members.length;i++) for(let j=i+1;j<members.length;j++) {
      if(deny(members[i].id,members[j].id)) capacityIssues.push(`${name(members[i].id)} ↔ ${name(members[j].id)}: 금지-페어와 한방-페어가 연결되어 충돌합니다.`);
      if(!hasSpecial && !isFourball && Number(members[i].group)===Number(members[j].group)) capacityIssues.push(`${name(members[i].id)} ↔ ${name(members[j].id)}: 같은 조는 동일 방 불가`);
    }
    const choices = [...(forced.size ? forced : Array.from({length:roomCount},(_,i)=>i+1))].filter(r=>Number.isInteger(r) && r>=1 && r<=roomCount && (hasSpecial || !reserved.has(r)) && (!hasSpecial || members.every(p=>Number(getSkillRoomGroupForParticipant(skillRoomConfig,p.id,{roomCount,participants:people})?.roomNo)===r)) && members.length <= caps[r-1]);
    if(!choices.length) capacityIssues.push(`${members.map(p=>name(p.id)).join(' ↔ ')}: 들어갈 수 있는 방이 없습니다.`);
    return {members,choices, special:hasSpecial};
  });
  // 방 선택 자체의 직접 충돌은 전체 탐색 전 참가자 이름과 방 이름으로 안내합니다.
  const forcedRooms = new Map();
  for (const part of parts) {
    if (part.choices.length !== 1) continue;
    const r = part.choices[0];
    if (!forcedRooms.has(r)) forcedRooms.set(r, []);
    forcedRooms.get(r).push(...part.members);
  }
  for (const [r, members] of forcedRooms) {
    if (members.length > caps[r-1]) capacityIssues.push(`${roomName(r)}: 지정 참가자 ${members.length}명으로 정원 ${caps[r-1]}명을 초과했습니다. (${members.map(p=>name(p.id)).join(', ')})`);
    if (!isFourball && !members.every(p => specialIds.has(String(p.id)))) {
      const perGroup=new Map();
      members.filter(p=>!specialIds.has(String(p.id))).forEach(p=>{
        const g=Number(p.group);
        if(!perGroup.has(g))perGroup.set(g,[]);
        perGroup.get(g).push(p);
      });
      for (const [g, items] of perGroup) if(items.length>1)capacityIssues.push(`${roomName(r)}: ${g}조 참가자가 ${items.length}명 지정되었습니다. (${items.map(p=>name(p.id)).join(', ')})`);
    }
    if (isFourball && !members.every(p=>specialIds.has(String(p.id)))) {
      for (const parity of [0,1]) {
        const part=members.filter(p=>!specialIds.has(String(p.id)) && Number(p.group)%2===parity);
        if(part.length>Math.floor(caps[r-1]/2)) capacityIssues.push(`${roomName(r)}: 포볼 ${parity?'1조':'2조'} 측 참가자가 ${part.length}명으로 팀 구성 한도를 초과했습니다. (${part.map(p=>name(p.id)).join(', ')})`);
      }
    }
  }
  if(capacityIssues.length) return {status:'invalid',issues:capacityIssues.slice(0,8)};
  const counts=Array.from({length:roomCount},()=>({total:0,byGroup:new Map(),leaders:0,mates:0, members:[]}));
  let nodes=0,limitReached=false;
  const optionsFor=part=>part.choices.filter(r=>{
    const c=counts[r-1];
    if(c.total+part.members.length>caps[r-1])return false;
    if(part.members.some(p=>c.members.some(q=>deny(p.id,q.id)))) return false;
    if(part.special) return true;
    if(isFourball){
      const leaders=part.members.filter(p=>Number(p.group)%2===1).length;
      const mates=part.members.length-leaders;
      const maxPairs=Math.floor(caps[r-1]/2);
      return c.leaders+leaders<=maxPairs && c.mates+mates<=maxPairs;
    }
    return part.members.every(p=> (c.byGroup.get(Number(p.group))||0)+part.members.filter(x=>Number(x.group)===Number(p.group)).length<=1);
  });
  const visit=remaining=>{
    if(!remaining.length){
      if(isFourball && counts.some((c,i)=>!reserved.has(i+1) && c.leaders!==c.mates)) return false;
      return true;
    }
    if(++nodes>maxNodes){limitReached=true;return false;}
    let chosen=null,opts=null;
    for(const part of remaining){
      const o=optionsFor(part);
      if(!o.length)return false;
      if(!opts || o.length<opts.length){chosen=part;opts=o;if(o.length===1)break;}
    }
    for(const r of opts){
      const c=counts[r-1];
      const oldMembers=c.members,oldGroups=c.byGroup,oldTotal=c.total,oldL=c.leaders,oldM=c.mates;
      c.members=[...oldMembers,...chosen.members];c.total+=chosen.members.length;c.byGroup=new Map(oldGroups);
      chosen.members.forEach(p=>c.byGroup.set(Number(p.group),(c.byGroup.get(Number(p.group))||0)+1));
      if(!chosen.special){c.leaders+=chosen.members.filter(p=>Number(p.group)%2===1).length;c.mates+=chosen.members.filter(p=>Number(p.group)%2===0).length;}
      if(visit(remaining.filter(x=>x!==chosen)))return true;
      c.members=oldMembers;c.byGroup=oldGroups;c.total=oldTotal;c.leaders=oldL;c.mates=oldM;
      if(limitReached)return false;
    }
    return false;
  };
  const possible=visit(parts);
  if(possible) return {status:'ok',issues:[],nodes};
  if(limitReached) return {status:'limit',issues:[`전체 방배정 조합 탐색 한도(${maxNodes.toLocaleString()}회)에 도달했습니다. 저장하지 않았습니다. 설정을 줄이거나 다시 확인해주세요.`],nodes};
  const selected = (cfg.roomSelectionEnabled?cfg.roomSelections:[]).map(x=>`${name(x.id)} → ${roomName(x.room)}`);
  return {status:'invalid',issues:[`지정 방·금지-페어·한방-페어·${isFourball?'포볼 2인 팀 구성':'조별 1인 배정'}·방 정원(${caps.map((n,i)=>`${roomName(i+1)} ${n}명`).join(', ')})을 동시에 만족하는 전체 배정이 없습니다.`,...(selected.length?[`현재 지정 방: ${selected.slice(0,6).join(', ')}`]:[])],nodes};
}
