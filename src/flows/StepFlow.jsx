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

  // ── 1. 상태 선언 ────────────────────────────────────────────
  const [mode, setMode]                 = useState('stroke');
  const [title, setTitle]               = useState('');
  const [roomCount, setRoomCount]       = useState(4);
  const [roomNames, setRoomNames]       = useState(Array(4).fill(''));
  const [uploadMethod, setUploadMethod] = useState('');
  const [participants, setParticipants] = useState([]);

  // ── Firestore 문서 맵 ───────────────────────────────────────
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

  // ── 3. 수동 초기화 (Step5) ───────────────────────────────────
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

  // ── 4. 점수 변경 핸들러 (스트로크/AGM 共通) ──────────────────
  const handleScoreChange = (id, value) => {
    setParticipants(ps =>
      ps.map(p =>
        p.id === id
          ? { ...p, score: value === '' ? null : Number(value) }
          : p
      )
    );
  };

  // ── 5. AGM 포볼 수동 배정 ────────────────────────────────────
  //     return { roomNo, nickname, partnerNickname }
  const handleAgmManualAssign = id => {
    const ps   = participants;
    const half = ps.length / 2;
    if (id >= half) return { roomNo: null, nickname: '', partnerNickname: null };

    const target = ps.find(p => p.id === id);
    if (!target) return { roomNo: null, nickname: '', partnerNickname: null };

    // 1) 빈 1조 슬롯 중 랜덤 선택 (최대 2명)
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

    // 2) 1조 방 설정
    let updated = ps.map(p =>
      p.id === id
        ? { ...p, room: roomNo }
        : p
    );

    // 3) 2조 파트너 후보 중 랜덤
    const pool2 = updated.filter(p => p.id >= half && p.room == null);
    const partner =
      pool2.length > 0
        ? pool2[Math.floor(Math.random() * pool2.length)]
        : null;

    // 4) 파트너 있으면 서로 partner 필드 세팅
    if (partner) {
      updated = updated.map(p => {
        if (p.id === id)           return { ...p, partner: partner.id };
        if (p.id === partner.id)   return { ...p, room: roomNo, partner: id };
        return p;
      });
    }

    setParticipants(updated);

    return {
      roomNo,
      nickname: target.nickname,
      partnerNickname: partner?.nickname ?? null
    };
  };

  // ── 6. AGM 포볼 파트너 취소 ────────────────────────────────────
  const handleAgmCancel = id => {
    setParticipants(ps => {
      const target = ps.find(p => p.id === id);
      if (!target || target.partner == null) return ps;
      const partnerId = target.partner;
      return ps.map(p =>
        p.id === id || p.id === partnerId
          ? { ...p, room: null, partner: null }
          : p
      );
    });
  };

  // ── 7. AGM 포볼 자동 배정 (alert 제거) ─────────────────────────
  const handleAgmAutoAssign = () => {
    setParticipants(ps => {
      const half     = ps.length / 2;
      const roomsArr = Array.from({ length: roomCount }, (_, i) => i + 1);
      let updated    = [...ps];

      // (1) 1조 미배정 풀 shuffle → 각 방 최대 2명
      let pool1 = shuffle(
        updated.filter(p => p.id < half && p.room == null).map(p => p.id)
      );
      roomsArr.forEach(roomNo => {
        const g1in = updated.filter(p => p.id < half && p.room === roomNo);
        for (let i = 0; i < 2 - g1in.length && pool1.length; i++) {
          const pid1 = pool1.shift();
          updated = updated.map(p =>
            p.id === pid1
              ? { ...p, room: roomNo, partner: null }
              : p
          );
        }
      });

      // (2) 2조 파트너 매칭
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

  // ── 8. AGM 포볼 초기화 ────────────────────────────────────────
  const handleAgmReset = () => {
    setParticipants(ps =>
      ps.map(p => ({ ...p, room: null, partner: null }))
    );
  };

  // ── 나머지: 네비게ーション, 파일 업로드, 라우팅 (원본 그대로) ─────
  const strokeFlow = [1,2,3,4,5,6];
  const agmFlow    = [1,2,3,4,7,8];
  const flow       = mode === 'stroke' ? strokeFlow : agmFlow;

  const parts = window.location.pathname.split('/');
  const curr  = parseInt(parts[parts.length - 1], 10) || 1;

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

  // ── Context 제공 ────────────────────────────────────────────
  const ctxValue = {
    mode, setMode,
    title, setTitle,
    roomCount, setRoomCount,
    roomNames, setRoomNames,
    uploadMethod, setUploadMethod,
    participants, setParticipants,
    initManual, resetAll, handleFile,
    onScoreChange:   handleScoreChange,        // ← 점수 입력 핸들러
    onManualAssign:  handleAgmManualAssign,    // ← 수동
    onCancel:        handleAgmCancel,          // ← 취소
    onAutoAssign:    handleAgmAutoAssign,      // ← 자동
    onReset:         handleAgmReset,           // ← 초기화
    goNext, goPrev, setStep
  };

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

// ── Helper: 배열 shuffle ───────────────────────────────────────
function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}
