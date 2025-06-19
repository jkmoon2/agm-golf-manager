import React, { useState, createContext } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import * as XLSX from 'xlsx';

import StepPage from '../components/StepPage';
import Step1     from '../screens/Step1';
import Step2     from '../screens/Step2';
import Step3     from '../screens/Step3';
import Step4     from '../screens/Step4';
import Step5     from '../screens/Step5';
import Step6     from '../screens/Step6';
import Step7     from '../screens/Step7';
import Step8     from '../screens/Step8';

export const StepContext = createContext();

export default function StepFlow() {
  const navigate = useNavigate();

  // ── 1. 상태 선언 ───────────────────────────────────────────
  const [mode, setMode]                 = useState('stroke');
  const [title, setTitle]               = useState('');
  const [roomCount, setRoomCount]       = useState(4);
  const [roomNames, setRoomNames]       = useState(Array(4).fill(''));
  const [uploadMethod, setUploadMethod] = useState('');
  const [participants, setParticipants] = useState([]);

  // ── 문서 맵 ─────────────────────────────────────────────────
  const docsMap = {
    'stroke-1': doc(db, 'events', 'stroke-1'),
    'stroke-2': doc(db, 'events', 'stroke-2'),
    'agm-1':    doc(db, 'events', 'agm-1'),
    'agm-2':    doc(db, 'events', 'agm-2'),
  };

  // ── 2. 전체 초기화 ───────────────────────────────────────────
  const resetAll = async () => {
    const key = mode === 'stroke' ? 'stroke-1' : 'agm-1';
    await setDoc(docsMap[key], {
      mode,
      title: '',
      roomCount: 4,
      roomNames: Array(4).fill(''),
    });
    setTitle('');
    setRoomCount(4);
    setRoomNames(Array(4).fill(''));
    setUploadMethod('');
    setParticipants([]);
  };

  // ── 3. 수동 초기화 (Step5) ─────────────────────────────────
  const initManual = () => {
    setParticipants(
      Array.from({ length: roomCount * 4 }, (_, idx) => ({
        id:       idx,
        group:    1,
        nickname: '',
        handicap: 0,
        score:    null,
        room:     null,
        partner:  null,
        selected: false,
      }))
    );
  };

  // ── 4. AGM 포볼 수동 배정 (한 번만 alert) ───────────────────
  const handleAgmManualAssign = id => {
    setParticipants(ps => {
      const half   = ps.length / 2;
      const target = ps.find(p => p.id === id);
      if (!target || target.id >= half) return ps;

      // (1) 이미 방 있으면 reuse, 없으면 랜덤 선택
      let roomNo = target.room;
      if (roomNo == null) {
        const countByRoom = ps
          .filter(p => p.id < half && p.room != null)
          .reduce((acc, p) => {
            acc[p.room] = (acc[p.room] || 0) + 1;
            return acc;
          }, {});
        const candidates = Array.from({ length: roomCount }, (_, i) => i + 1)
          .filter(r => (countByRoom[r] || 0) < 2);
        roomNo = candidates[Math.floor(Math.random() * candidates.length)];
      }

      // (2) 방 세팅
      let updated = ps.map(p =>
        p.id === id ? { ...p, room: roomNo } : p
      );

      // (3) 파트너 찾기
      const partner = updated.find(
        p => p.id >= half && p.room === roomNo && p.partner == null
      );

      // (4) partner 필드 동기화
      if (partner) {
        updated = updated.map(p => {
          if (p.id === id)         return { ...p, partner: partner.id };
          if (p.id === partner.id) return { ...p, partner: id };
          return p;
        });
      }

      // ── 5. 한 번만 alert 띄우기 ───────────────────────────────
      const label = roomNames[roomNo - 1]?.trim() || `${roomNo}번 방`;
      const msg = partner
        ? `${target.nickname}님은 ${label}에 배정되었습니다.\n팀원으로 ${partner.nickname}님을 선택했습니다.`
        : `${target.nickname}님은 ${label}에 배정되었습니다.\n팀원을 선택하려면 확인을 눌러주세요.`;
      alert(msg);

      return updated;
    });
  };

  // ── 5. AGM 포볼 파트너 취소 ─────────────────────────────────
  const handleAgmCancel = id => {
    setParticipants(ps => {
      const target = ps.find(p => p.id === id);
      if (!target || target.partner == null) return ps;
      const partnerId = target.partner;
      alert(`${target.nickname}님과 팀이 해제되었습니다.`);
      return ps.map(p =>
        (p.id === id || p.id === partnerId)
          ? { ...p, room: null, partner: null }
          : p
      );
    });
  };

  // ── 6. AGM 포볼 자동 배정 (alert 제거) ───────────────────────
  const handleAgmAutoAssign = () => {
    setParticipants(ps => {
      const half     = ps.length / 2;
      const roomsArr = Array.from({ length: roomCount }, (_, i) => i + 1);
      let updated    = [...ps];

      // (a) 수동 유지 후 1조 랜덤
      const pool1 = shuffle(
        updated.filter(p => p.id < half && p.room == null).map(p => p.id)
      );
      roomsArr.forEach(roomNo => {
        const g1 = updated.filter(p => p.id < half && p.room === roomNo);
        while (g1.length < 2 && pool1.length) {
          const pid1 = pool1.shift();
          updated = updated.map(p =>
            p.id === pid1 ? { ...p, room: roomNo, partner: null } : p
          );
          g1.push({ id: pid1 });
        }
      });

      // (b) 2조 파트너 매칭
      roomsArr.forEach(roomNo => {
        const freeG1 = updated.filter(
          p => p.id < half && p.room === roomNo && p.partner == null
        );
        freeG1.forEach(p1 => {
          const c2 = updated.filter(p => p.id >= half && p.room == null);
          if (!c2.length) return;
          const pick = c2[Math.floor(Math.random() * c2.length)];
          updated = updated.map(p => {
            if (p.id === p1.id)    return { ...p, partner: pick.id };
            if (p.id === pick.id)  return { ...p, room: roomNo, partner: p1.id };
            return p;
          });
        });
      });

      return updated;
    });
  };

  // ── 7. AGM 포볼 초기화 ─────────────────────────────────────
  const handleAgmReset = () => {
    setParticipants(ps =>
      ps.map(p => ({ ...p, room: null, partner: null }))
    );
  };

  // ── 8. 나머지 흐름·네비·파일업로드 등은 “원본 그대로” ─────────
  const strokeFlow = [1,2,3,4,5,6];
  const agmFlow    = [1,2,3,4,7,8];
  const flow       = mode === 'stroke' ? strokeFlow : agmFlow;
  const parts      = window.location.pathname.split('/');
  const curr       = parseInt(parts[parts.length - 1], 10) || 1;

  const goNext = () => {
    const idx  = flow.indexOf(curr);
    const next = flow[(idx + 1) % flow.length];
    navigate(`/step/${next}`);
  };
  const goPrev = () => {
    const idx  = flow.indexOf(curr);
    const prev = flow[(idx - 1 + flow.length) % flow.length];
    if (prev === 1) navigate('/'); else navigate(`/step/${prev}`);
  };
  const setStep = n => navigate(`/step/${n}`);

  const handleFile = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ab    = await file.arrayBuffer();
    const wb    = XLSX.read(ab, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(1);
    const data  = rows.map((row, idx) => ({
      id:        idx,
      group:     Number(row[0]) || 1,
      nickname:  String(row[1] || '').trim(),
      handicap:  Number(row[2]) || 0,
      score:     null,
      room:      null,
      partner:   null,
      selected:  false,
    }));
    setParticipants(data);
  };

  // ── 9. Context 제공 ─────────────────────────────────────────
  const ctxValue = {
    mode, setMode,
    title, setTitle,
    roomCount, setRoomCount,
    roomNames, setRoomNames,
    uploadMethod, setUploadMethod,
    participants, setParticipants,
    initManual, resetAll, handleFile,
    goNext, goPrev, setStep,
    handleAgmManualAssign, handleAgmCancel,
    handleAgmAutoAssign, handleAgmReset
  };

  // ── 10. 라우팅 ────────────────────────────────────────────
  return (
    <StepContext.Provider value={ctxValue}>
      <Routes>
        <Route path="1" element={<StepPage step={1} setStep={setStep}><Step1 /></StepPage>} />
        <Route path="2" element={<StepPage step={2} setStep={setStep}><Step2 /></StepPage>} />
        <Route path="3" element={<StepPage step={3} setStep={setStep}><Step3 /></StepPage>} />
        <Route path="4" element={<StepPage step={4} setStep={setStep}><Step4 /></StepPage>} />
        <Route path="5" element={<StepPage step={5} setStep={setStep}><Step5 /></StepPage>} />
        <Route path="6" element={<StepPage step={6} setStep={setStep}><Step6 /></StepPage>} />
        <Route path="7" element={<StepPage step={7} setStep={setStep}><Step7 /></StepPage>} />
        <Route path="8" element={<StepPage step={8} setStep={setStep}><Step8 /></StepPage>} />
        <Route path="*" element={<Navigate to="/step/1" replace />} />
      </Routes>
    </StepContext.Provider>
  );
}

// shuffle helper
function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}
