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
import { getAuth } from 'firebase/auth'; // ✅ 변경: 안전망
import { db, waitForAuthRestored, ensureAnonAfterCode } from '../firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';


function getPlayerTabId(){
  try {
    if (!window.name || !window.name.startsWith('AGM_PLAYER_TAB_')) {
      window.name = `AGM_PLAYER_TAB_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    }
    return window.name;
  } catch {
    return 'AGM_PLAYER_TAB_FALLBACK';
  }
}
function playerStorageKey(eventId, key){
  return `agm:player:${getPlayerTabId()}:${eventId || 'noevent'}:${key}`;
}

export default function PlayerApp() {
  const { eventId } = useParams();
  const nav = useNavigate();
  const { loadEvent } = useContext(EventContext) || {};
  const { setEventId, setAuthCode, setParticipant } = useContext(PlayerContext) || {};

  useEffect(() => {
    if (!eventId) return;

    let cancelled = false;

    (async () => {
      // ✅ 안전망: 이메일 세션 복원을 먼저 기다린 뒤,
      // 인증코드 세션이 있는 경우에만 익명 로그인을 보장합니다.
      //
      // ✅ 추가 보완:
      // 브라우저 재시작/PWA 재실행 시 마지막 URL이 /player/home/... 으로 바로 열리면
      // Firebase 이메일 세션이 살아 있어도 Player HOME으로 즉시 진입하지 않고,
      // 먼저 로그인 화면을 보여준 뒤 사용자가 파란 로그인 버튼을 눌렀을 때만 진입시킵니다.
      // 기존 인증코드 세션은 sessionStorage(auth_*, pending_code)가 살아 있을 때만 기존처럼 유지됩니다.
      let hasSessionAuth = false;
      let emailSessionRestored = false;
      try {
        const auth = getAuth();
        const restored = auth.currentUser || await waitForAuthRestored(1500);
        emailSessionRestored = !!(restored && !restored.isAnonymous);
        hasSessionAuth =
          sessionStorage.getItem(`auth_${eventId}`) === 'true' ||
          !!sessionStorage.getItem(`participant_${eventId}`) ||
          !!sessionStorage.getItem('pending_code') ||
          sessionStorage.getItem('agm.emailLoginConfirmed') === 'true';

        if (!hasSessionAuth && emailSessionRestored) {
          try {
            const currentPath = `${window.location.pathname || ''}${window.location.search || ''}${window.location.hash || ''}`;
            sessionStorage.setItem('agm.postLoginRedirect', currentPath || `/player/home/${eventId}`);
          } catch {}
          if (!cancelled) nav('/player/login-or-code', { replace: true });
          return;
        }

        if (!auth.currentUser && !emailSessionRestored) {
          const hasCodeSession =
            sessionStorage.getItem(`auth_${eventId}`) === 'true' ||
            !!sessionStorage.getItem('pending_code');
          if (hasCodeSession) await ensureAnonAfterCode(eventId);
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
              try { localStorage.setItem(playerStorageKey(eventId, 'authcode'), codeStr); } catch {}
            }
            if (participantObj) {
              setParticipant?.(participantObj);
              try { sessionStorage.setItem(`participant_${eventId}`, JSON.stringify(participantObj)); } catch {}
              try { localStorage.setItem(playerStorageKey(eventId, 'participant'), JSON.stringify(participantObj)); } catch {}
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

        // 2) localStorage fallback
        // 브라우저 재시작 후 마지막 HOME URL이 바로 열리는 경우를 막기 위해,
        // 로그인 화면에서 이메일 세션 확인 버튼을 누른 이번 세션에서만 localStorage 복원을 허용합니다.
        const allowLocalRestore = sessionStorage.getItem('agm.emailLoginConfirmed') === 'true';
        if (allowLocalRestore) {
          const partLS = localStorage.getItem(playerStorageKey(eventId, 'participant'));
          const codeLS = localStorage.getItem(playerStorageKey(eventId, 'authcode')) || '';
          if (partLS) {
            try { applyAuthAndParticipant(codeLS, JSON.parse(partLS)); } catch {}
            return;
          }
        }

        // 3) 같은 브라우저 다중 참가자 탭 충돌 방지를 위해 전역 ticket/localStorage fallback은 사용하지 않습니다.
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
