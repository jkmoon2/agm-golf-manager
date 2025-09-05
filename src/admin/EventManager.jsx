// /src/admin/EventManager.jsx

import React, { useMemo, useState, useContext } from 'react';
import { EventContext } from '../contexts/EventContext';
import { EVENT_TEMPLATES } from '../events/registry';

const uid = () => Math.random().toString(36).slice(2,10);

export default function EventManager() {
  const { eventData, addEventDef, updateEventDef, removeEventDef } = useContext(EventContext) || {};
  const events = Array.isArray(eventData?.events) ? eventData.events : [];

  const [form, setForm] = useState({
    title: '',
    template: 'raw-number',
    target: 'person',     // 'person'|'room'|'team'
    rankOrder: 'asc',     // 'asc'|'desc'
    paramsJson: JSON.stringify({ aggregator:'sum' }, null, 2)
  });

  const templates = EVENT_TEMPLATES;
  const onTemplateChange = (t) => {
    const def = templates.find(x => x.type === t);
    setForm(s => ({ ...s, template: t, paramsJson: JSON.stringify(def?.defaultParams||{}, null, 2) }));
  };

  const create = async () => {
    try {
      const params = JSON.parse(form.paramsJson || '{}');
      await addEventDef({
        id: uid(),
        title: form.title.trim() || '이벤트',
        template: form.template,
        params,
        target: form.target,
        rankOrder: form.rankOrder,
        enabled: true
      });
      alert('이벤트가 생성되었습니다.');
      setForm({ title:'', template:'raw-number', target:'person', rankOrder:'asc', paramsJson: JSON.stringify({aggregator:'sum'}, null, 2) });
    } catch (e) {
      alert('params JSON이 올바르지 않습니다.');
    }
  };

  const toggleEnable = async (id, enabled) => {
    await updateEventDef(id, { enabled: !enabled });
  };

  return (
    <div style={{ padding: 16 }}>
      <h3>#EVENT · 이벤트 생성/관리</h3>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12 }}>
        <div style={{ border:'1px solid #eee', borderRadius:8, padding:12 }}>
          <h4>새 이벤트 만들기</h4>
          <div style={{ display:'grid', gap:8 }}>
            <label>제목 <input value={form.title} onChange={e=>setForm(s=>({...s,title:e.target.value}))}/></label>
            <label>템플릿
              <select value={form.template} onChange={e=>onTemplateChange(e.target.value)}>
                {templates.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
              </select>
            </label>
            <label>타겟
              <select value={form.target} onChange={e=>setForm(s=>({...s,target:e.target.value}))}>
                <option value="person">개인</option>
                <option value="room">방</option>
                <option value="team">팀(포볼)</option>
              </select>
            </label>
            <label>정렬
              <select value={form.rankOrder} onChange={e=>setForm(s=>({...s,rankOrder:e.target.value}))}>
                <option value="asc">오름차순</option>
                <option value="desc">내림차순</option>
              </select>
            </label>
            <label>파라미터(JSON)
              <textarea rows={8} value={form.paramsJson} onChange={e=>setForm(s=>({...s,paramsJson:e.target.value}))}/>
            </label>
            <button onClick={create}>이벤트 생성</button>
          </div>
        </div>

        <div style={{ border:'1px solid #eee', borderRadius:8, padding:12 }}>
          <h4>이벤트 목록</h4>
          {events.length === 0 && <div style={{ color:'#999' }}>등록된 이벤트가 없습니다.</div>}
          {events.map(ev => (
            <div key={ev.id} style={{ border:'1px solid #f0f0f0', borderRadius:6, padding:8, marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <b>{ev.title}</b> · <small>{ev.template}</small> · <small>{ev.target}</small> · <small>{ev.rankOrder}</small>
                  {ev.enabled ? <span style={{ marginLeft:8, color:'green' }}>사용</span> : <span style={{ marginLeft:8, color:'#999' }}>숨김</span>}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={()=>toggleEnable(ev.id, ev.enabled)}>{ev.enabled?'숨기기':'사용'}</button>
                  <button onClick={()=>removeEventDef(ev.id)} style={{ color:'#c00' }}>삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p style={{ marginTop:12, color:'#888' }}>
        * “숫자 × 계수(환산)”은 <code>{`{"factor": 1,"aggregator":"sum"}`}</code> 형식으로 계수를 지정합니다.<br/>
        * “범위→점수”는 <code>table</code> 배열에 <code>{`{min,max,score}`}</code> 항목을 넣어 구간별 스코어를 지정합니다.
      </p>
    </div>
  );
}
