// /src/flows/StepFlow.jsx

import React, { useState, createContext, useEffect, useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';

import { EventContext } from '../contexts/EventContext';
import StepPage from '../components/StepPage';
import Step1    from '../screens/Step1';
import Step2    from '../screens/Step2';
import Step3    from '../screens/Step3';
import Step4    from '../screens/Step4';
import Step5    from '../screens/Step5';
import Step6    from '../screens/Step6';
import Step7    from '../screens/Step7';
import Step8    from '../screens/Step8';

export const StepContext = createContext();

export default function StepFlow() {
  const { eventId, eventData, updateEvent, updateEventImmediate } = useContext(EventContext);
  const { step }    = useParams();
  const navigate    = useNavigate();

  // 0) eventId 없으면 STEP0으로 강제 이동
  useEffect(() => {
    if (!eventId) navigate('/admin/home/0', { replace: true });
  }, [eventId, navigate]);

  // 1) 서버 데이터를 로컬 state에 항상 동기화
  const [mode, setMode]                 = useState('stroke');
  const [title, setTitle]               = useState('');
  const [roomCount, setRoomCount]       = useState(4);
  const [roomNames, setRoomNames]       = useState(Array(4).fill(''));
  const [uploadMethod, setUploadMethod] = useState('');
  const [participants, setParticipants] = useState([]);
  const [dateStart, setDateStart]       = useState('');
  const [dateEnd, setDateEnd]           = useState('');

  useEffect(() => {
    if (!eventData) return;
    setMode(eventData.mode);
    setTitle(eventData.title);
    setRoomCount(eventData.roomCount);
    setRoomNames(eventData.roomNames);
    setUploadMethod(eventData.uploadMethod);
    setParticipants(eventData.participants);
    setDateStart(eventData.dateStart || '');
    setDateEnd(eventData.dateEnd || '');
  }, [eventData]);

  // 저장 헬퍼 (기존 유지) — 서버에 즉시 머지 저장
  const save = async (updates) => {
    const clean = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'participants' && Array.isArray(value)) {
        clean[key] = value.map(item => {
          const obj = {};
          Object.entries(item).forEach(([k, v]) => {
            if (typeof v !== 'function') obj[k] = v;
          });
          return obj;
        });
      } else if (typeof value !== 'function') {
        clean[key] = value;
      }
    });
    await (updateEventImmediate ? updateEventImmediate(clean) : updateEvent(clean));
  };

  // 전체 초기화 (현재 mode 유지)
  const resetAll = () => {
    const init = {
      mode,
      title:        '',
      roomCount:    4,
      roomNames:    Array(4).fill(''),
      uploadMethod: '',
      participants: [],
      dateStart:    '',
      dateEnd:      ''
    };
    setMode(init.mode);
    setTitle(init.title);
    setRoomCount(init.roomCount);
    setRoomNames(init.roomNames);
    setUploadMethod(init.uploadMethod);
    setParticipants(init.participants);
    setDateStart(init.dateStart);
    setDateEnd(init.dateEnd);
    save(init);
    navigate('/admin/home/0', { replace: true });
  };

  const curr       = Number(step) || 1;
  const strokeFlow = [1,2,3,4,5,6];
  const agmFlow    = [1,2,3,4,7,8];
  const flow       = mode === 'stroke' ? strokeFlow : agmFlow;

  // [CRITICAL-FIX] participants를 여기서 저장하지 않음 (동시 편집 덮어쓰기 방지)
  const goNext = () => {
    save({ mode, title, roomCount, roomNames, uploadMethod, dateStart, dateEnd }); // [FIX]
    const idx  = flow.indexOf(curr);
    const next = flow[(idx + 1) % flow.length];
    navigate(`/admin/home/${next}`);
  };

  const goPrev = () => {
    save({ mode, title, roomCount, roomNames, uploadMethod, dateStart, dateEnd }); // [FIX]
    const idx  = flow.indexOf(curr);
    const prev = flow[(idx - 1 + flow.length) % flow.length];
    navigate(prev === 0 ? '/admin/home/0' : `/admin/home/${prev}`);
  };

  const setStep = n => navigate(`/admin/home/${n}`);

  const changeMode  = newMode => { setMode(newMode); save({ mode: newMode }); };
  const changeTitle = newTitle => { setTitle(newTitle); save({ title: newTitle }); };

  // 파일 업로드 처리 (Step4 등)
  const handleFile = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ab    = await file.arrayBuffer();
    const wb    = XLSX.read(ab, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(1);
    const data  = rows.map((row, idx) => ({
      id:       idx,
      group:    Number(row[0]) || 1,
      nickname: String(row[1] || '').trim(),
      handicap: Number(row[2]) || 0,
      authCode: String(row[3] || '').trim(),
      score:    null,
      room:     null,
      partner:  null,
      selected: false
    }));
    setParticipants(data);
    save({ participants: data });
  };

  const initManual = () => {
    const data = Array.from({ length: roomCount * 4 }, (_, idx) => ({
      id:       idx,
      group:    1,
      nickname: '',
      handicap: 0,
      score:    null,
      room:     null,
      partner:  null,
      authCode: '',
      selected: false
    }));
    setParticipants(data);
    save({ participants: data });
  };

  // AGM 포볼 관련 (기존 유지)
  const assignPairToRoom = (id1, id2, roomNo) => {
    updateParticipantsBulkNow([
      { id: id1, fields: { room: roomNo, partner: id2 } },
      { id: id2, fields: { room: roomNo, partner: id1 } },
    ]);
  };

  const handleAgmManualAssign = async (id) => {
    let ps = [...participants];
    const half = ps.length / 2;
    let roomNo, target, partner;
    if (id < half) {
      target = ps.find(p => p.id === id);
      roomNo = target.room;
      if (roomNo == null) {
        const countByRoom = ps
          .filter(p => p.id < half && p.room != null)
          .reduce((acc, p) => { acc[p.room] = (acc[p.room]||0) + 1; return acc; }, {});
        const candidates = Array.from({ length: roomCount }, (_, i) => i+1)
          .filter(r => (countByRoom[r] || 0) < 2);
        roomNo = candidates[Math.floor(Math.random() * candidates.length)];
      }
      ps = ps.map(p => p.id === id ? { ...p, room: roomNo } : p);
      const pool2 = ps.filter(p => p.id >= half && p.room == null);
      partner = pool2.length ? pool2[Math.floor(Math.random() * pool2.length)] : null;
      if (partner) {
        assignPairToRoom(id, partner.id, roomNo);
        return { roomNo, nickname: target?.nickname || '', partnerNickname: partner?.nickname || null };
      }
    }
    setParticipants(ps);
    await save({ participants: ps });
    return { roomNo, nickname: target?.nickname || '', partnerNickname: partner?.nickname || null };
  };

  const handleAgmCancel = async (id) => {
    let ps = [...participants];
    const target = ps.find(p => p.id === id);
    if (target?.partner != null) {
      const pid = target.partner;
      ps = ps.map(p => (p.id === id || p.id === pid)
        ? { ...p, room: null, partner: null }
        : p
      );
    }
    setParticipants(ps);
    await save({ participants: ps });
  };

  const handleAgmAutoAssign = async () => {
    let ps = [...participants];
    const half = ps.length / 2;
    const roomsArr = Array.from({ length: roomCount }, (_, i) => i+1);
    let pool1 = shuffle(ps.filter(p => p.id < half && p.room == null).map(p => p.id));
    roomsArr.forEach(roomNo => {
      const g1 = ps.filter(p => p.id < half && p.room === roomNo);
      for (let i = 0; i < 2 - g1.length && pool1.length; i++) {
        const pid1 = pool1.shift();
        ps = ps.map(p => p.id === pid1
          ? { ...p, room: roomNo, partner: null }
          : p
        );
      }
    });
    roomsArr.forEach(roomNo => {
      const freeG1 = ps.filter(p => p.id < half && p.room === roomNo && p.partner == null);
      freeG1.forEach(p1 => {
        const c2 = ps.filter(p => p.id >= half && p.room == null);
        if (!c2.length) return;
        const pick = c2[Math.floor(Math.random() * c2.length)];
        ps = ps.map(p => {
          if (p.id === p1.id)   return { ...p, partner: pick.id };
          if (p.id === pick.id) return { ...p, room: roomNo, partner: p1.id };
          return p;
        });
      });
    });
    setParticipants(ps);
    const cleanList = ps.map(p => ({
      id: p.id, group: p.group, nickname: p.nickname, handicap: p.handicap,
      score: p.score, room: p.room, partner: p.partner, authCode: p.authCode, selected: p.selected
    }));
    await save({ participants: cleanList });
  };

  const handleAgmReset = async () => {
    const ps = participants.map(p => ({ ...p, room: null, partner: null }));
    setParticipants(ps);
    await save({ participants: ps });
  };

  // STEP5 (스트로크/포볼 공통) 실시간 저장용 보완 함수 (기존 유지)
  const updateParticipantNow = async (id, fields) => {
    let next;
    setParticipants(prev => (next = prev.map(p => (p.id === id ? { ...p, ...fields } : p))));
    await save({ participants: next, dateStart, dateEnd });
  };
  const updateParticipantsBulkNow = async (changes) => {
    let next;
    const map = new Map(changes.map(c => [String(c.id), c.fields]));
    setParticipants(prev => (next = prev.map(p => (map.has(String(p.id)) ? { ...p, ...map.get(String(p.id)) } : p))));
    await save({ participants: next, dateStart, dateEnd });
  };

  const ctxValue = {
    onManualAssign: handleAgmManualAssign,
    onCancel:        handleAgmCancel,
    onAutoAssign:    handleAgmAutoAssign,
    onReset:         handleAgmReset,
    goNext, goPrev, setStep,
    setMode: changeMode,
    setTitle: changeTitle,
    mode, changeMode,
    title, changeTitle,
    roomCount, setRoomCount,
    roomNames, setRoomNames,
    uploadMethod, setUploadMethod,
    participants, setParticipants,
    resetAll, handleFile, initManual,
    updateParticipant:      updateParticipantNow,
    updateParticipantsBulk: updateParticipantsBulkNow,
    dateStart, setDateStart,
    dateEnd,   setDateEnd,
  };

  const pages = { 1:<Step1/>, 2:<Step2/>, 3:<Step3/>, 4:<Step4/>, 5:<Step5/>, 6:<Step6/>, 7:<Step7/>, 8:<Step8/> };
  const Current = pages[curr] || <Step1 />;

  return (
    <StepContext.Provider value={ctxValue}>
      <StepPage step={curr} setStep={setStep}>
        {Current}
      </StepPage>
    </StepContext.Provider>
  );
}

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
