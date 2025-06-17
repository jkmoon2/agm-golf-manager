// src/flows/StepFlow.jsx

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

  // 1. 상태 선언
  const [mode, setMode]                 = useState('stroke');
  const [title, setTitle]               = useState('');
  const [roomCount, setRoomCount]       = useState(4);
  const [roomNames, setRoomNames]       = useState(Array(4).fill(''));
  const [uploadMethod, setUploadMethod] = useState('');
  const [participants, setParticipants] = useState([]);

  // Firestore 문서 맵
  const docsMap = {
    'stroke-1': doc(db, 'events', 'stroke-1'),
    'stroke-2': doc(db, 'events', 'stroke-2'),
    'agm-1':    doc(db, 'events', 'agm-1'),
    'agm-2':    doc(db, 'events', 'agm-2'),
  };

  // ── Firestore 구독(onSnapshot) 관련 코드를 완전히 삭제했습니다 ──

  // 2. 전체 초기화 (Firestore + 로컬 상태)
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

  // 3. 수동 초기화 (Step5)
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

  // 4. 단계 흐름 정의
  const strokeFlow = [1,2,3,4,5,6];
  const agmFlow    = [1,2,3,4,7,8];
  const flow       = mode === 'stroke' ? strokeFlow : agmFlow;

  // 5. 현재 단계 추출
  const parts = window.location.pathname.split('/');
  const curr  = parseInt(parts[parts.length - 1], 10) || 1;

  // 6. 네비게이션 헬퍼
  const goNext = () => {
    const idx  = flow.indexOf(curr);
    const next = flow[(idx + 1) % flow.length];
    navigate(`/step/${next}`);
  };
  const goPrev = () => {
    const idx  = flow.indexOf(curr);
    const prev = flow[(idx - 1 + flow.length) % flow.length];
    if (prev === 1) navigate('/');
    else           navigate(`/step/${prev}`);
  };
  const setStep = n => navigate(`/step/${n}`);

  // 7. 엑셀 업로드 핸들러
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

  // 8. Context 값 제공
  const ctxValue = {
    mode, setMode,
    title, setTitle,
    roomCount, setRoomCount,
    roomNames, setRoomNames,
    uploadMethod, setUploadMethod,
    participants, setParticipants,
    initManual, resetAll,
    goNext, goPrev, setStep,
    handleFile
  };

  // 9. 라우팅
  return (
    <StepContext.Provider value={ctxValue}>
      <Routes>
        <Route path="1" element={<StepPage step={1} setStep={setStep}><Step1 /></StepPage>} />
        <Route path="2" element={<StepPage step={2} setStep={setStep}><Step2 /></StepPage>} />
        <Route path="3" element={<StepPage step={3} setStep={setStep}><Step3 /></StepPage>} />
        <Route path="4" element={<StepPage step={4} setStep={setStep}><Step4 /></StepPage>} />

        {/* 5,6,7,8 단계 모두 선언만 해 두고,
            goNext/goPrev 에서 strokeFlow/agmFlow 로 스킵 처리 */}
        <Route path="5" element={<StepPage step={5} setStep={setStep}><Step5 /></StepPage>} />
        <Route path="6" element={<StepPage step={6} setStep={setStep}><Step6 /></StepPage>} />
        <Route path="7" element={<StepPage step={7} setStep={setStep}><Step7 /></StepPage>} />
        <Route path="8" element={<StepPage step={8} setStep={setStep}><Step8 /></StepPage>} />

        <Route path="*" element={<Navigate to="/step/1" replace />} />
      </Routes>
    </StepContext.Provider>
  );
}
