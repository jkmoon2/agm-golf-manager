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

  useEffect(() => {
    if (!eventId) navigate('/admin/home/0', { replace: true });
  }, [eventId, navigate]);

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

// 저장 헬퍼(기존 로직 유지) – 즉시 저장 가능하면 우선 사용
const save = async (updates) => {
  // --- Firestore 안전 정규화 유틸 ---
  const normalize = (v) => {
    if (v === undefined) return null;                // undefined → null
    if (typeof v === 'number' && Number.isNaN(v)) return null;
    return v;
  };

  const cleanObj = (obj) => {
    if (Array.isArray(obj)) {
      // 배열은 빈 슬롯/undefined를 제거하고, 각 원소도 정규화
      return obj
        .filter((x) => x != null)                    // null/undefined 원소 제거
        .map((x) => (typeof x === 'object' ? cleanObj(x) : normalize(x)));
    }
    if (obj && typeof obj === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'function') continue;       // 함수 제거
        if (v === undefined) continue;               // undefined 필드 자체를 제거
        if (v && typeof v === 'object') out[k] = cleanObj(v);
        else out[k] = normalize(v);
      }
      return out;
    }
    return normalize(obj);
  };

  // --- updates 전체 클린 ---
  const clean = cleanObj(updates);

  // participants가 배열이면 각 항목의 필수 키만 남기고 undefined 제거(안전망)
  if (Array.isArray(clean.participants)) {
    clean.participants = clean.participants.map((p) => ({
      id:        normalize(p.id),
      group:     normalize(p.group),
      nickname:  p.nickname ?? '',
      handicap:  normalize(p.handicap),
      score:     p.score == null ? null : normalize(Number(p.score)),
      room:      p.room == null ? null : normalize(p.room),
      partner:   p.partner == null ? null : normalize(p.partner),
      authCode:  p.authCode ?? '',
      selected:  !!p.selected,
    }));
  }

  // participants가 포함돼 있으면 ifChanged 검사 생략(강제 기록)
  const force = Object.prototype.hasOwnProperty.call(clean, 'participants');

  await (updateEventImmediate
    ? updateEventImmediate(clean, force ? false : true)
    : updateEvent(clean, { ifChanged: force ? false : true }));
};

  // ★ 변경: async로 바꾸고 저장을 await 한 뒤 라우팅
  const resetAll = async () => {
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
    await save(init);            // ★ 여기
    navigate('/admin/home/0', { replace: true });
  };

  const curr       = Number(step) || 1;
  const strokeFlow = [1,2,3,4,5,6];
  const agmFlow    = [1,2,3,4,7,8];
  const flow       = mode === 'stroke' ? strokeFlow : agmFlow;

  // ★ 변경: async + await save
  const goNext = async () => {
    await save({ mode, title, roomCount, roomNames, uploadMethod, participants, dateStart, dateEnd }); // ★
    const idx  = flow.indexOf(curr);
    const next = flow[(idx + 1) % flow.length];
    navigate(`/admin/home/${next}`);
  };

  // ★ 변경: async + await save
  const goPrev = async () => {
    await save({ mode, title, roomCount, roomNames, uploadMethod, participants, dateStart, dateEnd }); // ★
    const idx  = flow.indexOf(curr);
    const prev = flow[(idx - 1 + flow.length) % flow.length];
    navigate(prev === 0 ? '/admin/home/0' : `/admin/home/${prev}`);
  };

  const setStep = n => navigate(`/admin/home/${n}`);

  const changeMode  = newMode => {
    setMode(newMode);
    save({ mode: newMode });
  };

  const changeTitle = newTitle => {
    setTitle(newTitle);
    save({ title: newTitle });
  };

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
    await save({ participants: data }); // 안전
  };

  const initManual = async () => {
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
    await save({ participants: data }); // 안전
  };

  // 두 사람을 한 번에 같은 방/파트너로 확정
  const assignPairToRoom = (id1, id2, roomNo) => {
    updateParticipantsBulkNow([
      { id: id1, fields: { room: roomNo, partner: id2 } },
      { id: id2, fields: { room: roomNo, partner: id1 } },
    ]);
  };

  // Step7: AGM 수동 할당
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
      partner = pool2.length
        ? pool2[Math.floor(Math.random() * pool2.length)]
        : null;
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
    const cleanList = ps.map(p => ({ id: p.id, group: p.group, nickname: p.nickname, handicap: p.handicap, score: p.score, room: p.room, partner: p.partner, authCode: p.authCode, selected: p.selected }));
    await save({ participants: cleanList });
  };

  const handleAgmReset = async () => {
    const ps = participants.map(p => ({ ...p, room: null, partner: null }));
    setParticipants(ps);
    await save({ participants: ps });
  };

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
