// /src/player/PlayerApp.jsx

import React, { useEffect, useContext } from 'react';
import { Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';

import PlayerHome        from './screens/PlayerHome';
import PlayerRoomSelect  from './screens/PlayerRoomSelect';
import PlayerRoomTable   from './screens/PlayerRoomTable';
import PlayerEventInput  from './screens/PlayerEventInput';
import PlayerScoreInput  from './screens/PlayerScoreInput';
import PlayerResults     from './screens/PlayerResults';
import PlayerEventConfirm from './screens/PlayerEventConfirm';

import { EventContext }   from '../contexts/EventContext';
import { PlayerContext }  from '../contexts/PlayerContext';
import { getAuth, signInAnonymously } from 'firebase/auth'; // ✅ 변경: 안전망
import { db } from '../firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';

export default function PlayerApp() {
  const { eventId } = useParams();
  const nav = useNavigate();
  const { loadEvent } = useContext(EventContext) || {};
  const { setEventId, setAuthCode, setParticipant } = useContext(PlayerContext) || {};

  useEffect(() => {
    if (!eventId) return;

    let cancelled = false;

    (async () => {
      // ✅ 안전망: 항상 인증 보장(없는 경우만 익명 로그인)
      try {
        const auth = getAuth();
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch {}

      // 컨텍스트 동기화
      try {
        setEventId?.(eventId);

        const applyAuthAndParticipant = (codeStr, participantObj) => {
          try {
            if (codeStr) {
              setAuthCode?.(codeStr);
              try { sessionStorage.setItem(`auth_${eventId}`, 'true'); } catch {}
              try { sessionStorage.setItem(`authcode_${eventId}`, codeStr); } catch {}
              try { localStorage.setItem(`authcode:${eventId}`, codeStr); } catch {}
            }
            if (participantObj) {
              setParticipant?.(participantObj);
              try { sessionStorage.setItem(`participant_${eventId}`, JSON.stringify(participantObj)); } catch {}
              try { localStorage.setItem(`participant:${eventId}`, JSON.stringify(participantObj)); } catch {}
            }
          } catch {}
        };

        // 1) sessionStorage 우선
        const codeSS = sessionStorage.getItem(`authcode_${eventId}`) || '';
        if (codeSS) setAuthCode?.(codeSS);

        const partSS = sessionStorage.getItem(`participant_${eventId}`);
        if (partSS) {
          try { applyAuthAndParticipant(codeSS, JSON.parse(partSS)); } catch {}
          return;
        }

        // 2) localStorage fallback (iOS/PWA에서 sessionStorage가 초기화되는 케이스 대응)
        const partLS = localStorage.getItem(`participant:${eventId}`);
        const codeLS = localStorage.getItem(`authcode:${eventId}`) || '';
        if (partLS) {
          try { applyAuthAndParticipant(codeLS, JSON.parse(partLS)); } catch {}
          return;
        }

        // 3) ticket:${eventId} (코드만 저장되어 있는 경우) → Firestore에서 참가자 재조회
        let ticketCode = '';
        try {
          const ticketRaw = localStorage.getItem(`ticket:${eventId}`);
          if (ticketRaw) {
            const t = JSON.parse(ticketRaw);
            ticketCode = String(t?.code || '').trim();
          }
        } catch {}

        if (ticketCode) {
          const norm = (v) => String(v || '').trim().toUpperCase();

          let found = null;
          try {
            const snap = await getDoc(doc(db, 'events', eventId));
            if (snap.exists()) {
              const data = snap.data() || {};
              const arr = data.participants;
              if (Array.isArray(arr)) {
                found = arr.find(p => norm(p?.authCode ?? p?.code ?? p?.auth_code ?? p?.authcode ?? '') === norm(ticketCode)) || null;
              }
            }
          } catch {}

          if (!found) {
            try {
              const qs = await getDocs(collection(db, 'events', eventId, 'participants'));
              qs.forEach(d => {
                const v = d.data() || {};
                const vv = norm(v?.authCode ?? v?.code ?? v?.auth_code ?? v?.authcode ?? '');
                if (!found && vv === norm(ticketCode)) found = { id: d.id, ...v };
              });
            } catch {}
          }

          if (found) {
            applyAuthAndParticipant(ticketCode, found);
            return;
          }
        }
      } catch {}

      // ✅ 여기까지 왔으면: 로그인/코드 재입력이 필요함 (iOS에서 앱 재실행/탭 리로드로 세션이 사라진 케이스)
      if (!cancelled) {
        try { nav('/player/login-or-code', { replace: true }); } catch {}
      }
    })();

    // 이벤트 데이터 로딩
    try { if (typeof loadEvent === 'function') loadEvent(eventId); } catch {}

    return () => { cancelled = true; };

  }, [eventId, loadEvent, setEventId, setAuthCode, setParticipant, nav]);

  return (
    <Routes>
      <Route index element={<PlayerHome />} />
      <Route path="1" element={<PlayerRoomSelect />} />
      <Route path="2" element={<PlayerRoomTable />} />
      <Route path="3" element={<PlayerEventInput />} />
      <Route path="4" element={<PlayerScoreInput />} />
      <Route path="5" element={<PlayerResults />} />
      <Route path="6" element={<PlayerEventConfirm />} />
      <Route path="*" element={<Navigate to="1" replace />} />
    </Routes>
  );
}
