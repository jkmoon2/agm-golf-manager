// src/flows/StepFlow.jsx

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

// ---------- [추가] 얕은 비교 헬퍼 : 실제 변경이 있을 때만 setState ----------
const shallowEqualParticipants = (a = [], b = []) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i], y = b[i];
    if (!y) return false;
    if (
      x.id       !== y.id       ||
      x.group    !== y.group    ||
      x.nickname !== y.nickname ||
      x.handicap !== y.handicap ||
      x.score    !== y.score    ||
      x.room     !== y.room     ||
      x.partner  !== y.partner  ||
      x.selected !== y.selected
    ) return false;
  }
  return true;
};
// ---------------------------------------------------------------------------

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
  // ✅ 날짜 필드 동기화 추가(기존 유지)
  const [dateStart, setDateStart]       = useState('');
  const [dateEnd, setDateEnd]           = useState('');

  // ---------- [보완] eventData가 변경될 때 "실제로 달라졌을 때만" setState ----------
  useEffect(() => {
    if (!eventData) return;

    // mode
    if (mode !== eventData.mode) setMode(eventData.mode);

    // title
    if (title !== eventData.title) setTitle(eventData.title);

    // roomCount
    const nextRoomCount = eventData.roomCount ?? 4;
    if (roomCount !== nextRoomCount) setRoomCount(nextRoomCount);

    // roomNames
    const nextRoomNames = eventData.roomNames || Array(nextRoomCount).fill('');
    if ((roomNames || []).join('|') !== (nextRoomNames || []).join('|')) {
      setRoomNames(nextRoomNames);
    }

    // uploadMethod
    if (uploadMethod !== eventData.uploadMethod) setUploadMethod(eventData.uploadMethod);

    // participants (얕은 비교)
    const nextParticipants = eventData.participants || [];
    if (!shallowEqualParticipants(participants, nextParticipants)) {
      setParticipants(nextParticipants);
    }

    // dates
    const nextStart = eventData.dateStart || '';
    const nextEnd   = eventData.dateEnd   || '';
    if (dateStart !== nextStart) setDateStart(nextStart);
    if (dateEnd   !== nextEnd)   setDateEnd(nextEnd);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventData]); // 의존성은 기존과 동일하게 eventData 하나로 유지
  // ---------------------------------------------------------------------------

  // 저장 헬퍼: 함수 값을 제거하고 순수 JSON만 전달
  // ★ patch-start: make save async and await remote write to ensure persistence before route changes
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
  // ★ patch-end

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

  // STEP 네비게이션
  const curr       = Number(step) || 1;
  const strokeFlow = [1,2,3,4,5,6];
  const agmFlow    = [1,2,3,4,7,8];
  const flow       = mode === 'stroke' ? strokeFlow : agmFlow;

  const goNext = () => {
    // ✅ 날짜 포함 저장
    save({ mode, title, roomCount, roomNames, uploadMethod, participants, dateStart, dateEnd });
    const idx  = flow.indexOf(curr);
    const next = flow[(idx + 1) % flow.length];
    navigate(`/admin/home/${next}`);
  };

  const goPrev = () => {
    save({ mode, title, roomCount, roomNames, uploadMethod, participants, dateStart, dateEnd });
    const idx  = flow.indexOf(curr);
    const prev = flow[(idx - 1 + flow.length) % flow.length];
    navigate(prev === 0 ? '/admin/home/0' : `/admin/home/${prev}`);
  };

  const setStep = n => navigate(`/admin/home/${n}`);

  // 모드 변경 & 저장
  const changeMode  = newMode => {
    setMode(newMode);
    save({ mode: newMode });
  };

  // 대회명 변경 & 저장
  const changeTitle = newTitle => {
    setTitle(newTitle);
    save({ title: newTitle });
  };

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

  // Step5: 수동 초기화
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

  // 🔹 추가: 두 사람을 **한 번의 저장으로** 같은 방/상호 파트너로 확정하는 헬퍼
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
      // 우선 1조 본인 방만 확정(파트너는 아직)
      ps = ps.map(p => p.id === id ? { ...p, room: roomNo } : p);
      const pool2 = ps.filter(p => p.id >= half && p.room == null);
      partner = pool2.length
        ? pool2[Math.floor(Math.random() * pool2.length)]
        : null;
      // ✅ 변경점(최소): 파트너가 결정되면 "한 번의 저장"으로 두 사람을 동시에 확정
      if (partner) {
        assignPairToRoom(id, partner.id, roomNo);
        return { roomNo, nickname: target?.nickname || '', partnerNickname: partner?.nickname || null };
      }
    }
    // 파트너가 없었을 때만 기존 저장 유지
    setParticipants(ps);
    await save({ participants: ps });
    return { roomNo, nickname: target?.nickname || '', partnerNickname: partner?.nickname || null };
  };

  // Step7: AGM 수동 할당 취소
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

  // Step8: AGM 자동 할당
  const handleAgmAutoAssign = async () => {
    let ps = [...participants];
    const half = ps.length / 2;
    const roomsArr = Array.from({ length: roomCount }, (_, i) => i+1);

    // 1조(그룹1) 방 채우기
    let pool1 = ps.filter(p => p.id < half && p.room == null).map(p => p.id);
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

    // 파트너 매칭
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

  // Step8: AGM 리셋
  const handleAgmReset = async () => {
    const ps = participants.map(p => ({ ...p, room: null, partner: null }));
    setParticipants(ps);
    await save({ participants: ps });
  };

  // STEP5 실시간 저장용(기존 유지)
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
    // 날짜 state도 노출
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
