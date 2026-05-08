// /src/player/PlayerApp.jsx

import React, { useEffect, useContext, useState } from 'react';
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

const EMAIL_LOGIN_CONFIRMED_KEY = 'agm.emailLoginConfirmed';
const EMAIL_LOGIN_CONFIRMED_AT_KEY = 'agm.emailLoginConfirmedAt';
const EMAIL_LOGIN_EMAIL_KEY = 'agm.emailLoginEmail';
const EMAIL_LOGIN_ACTIVE_KEY = 'agm.emailLoginActiveGate';

function clearPlayerEntryGateOnUnload() {
  try { localStorage.removeItem(EMAIL_LOGIN_ACTIVE_KEY); } catch {}
  try { sessionStorage.removeItem(EMAIL_LOGIN_CONFIRMED_KEY); } catch {}
  try { sessionStorage.removeItem(EMAIL_LOGIN_CONFIRMED_AT_KEY); } catch {}
  try { sessionStorage.removeItem(EMAIL_LOGIN_EMAIL_KEY); } catch {}
  try { sessionStorage.removeItem('agm.postLoginRedirect'); } catch {}
}

function hasCurrentPageEmailEntryGate() {
  try {
    return sessionStorage.getItem(EMAIL_LOGIN_CONFIRMED_KEY) === 'true'
      && localStorage.getItem(EMAIL_LOGIN_ACTIVE_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function PlayerApp() {
  const { eventId } = useParams();
  const nav = useNavigate();
  const { loadEvent } = useContext(EventContext) || {};
  const { setEventId, setAuthCode, setParticipant } = useContext(PlayerContext) || {};
  const [entryGateReady, setEntryGateReady] = useState(false);

  // ✅ 브라우저/탭을 닫거나 새로고침하면 "이번 화면에서 로그인 버튼을 눌렀다"는 게이트만 제거합니다.
  // Firebase 이메일 세션 자체는 유지되므로, 다음 접속 때 로그인 화면에서 버튼을 한 번 더 누르면 됩니다.
  useEffect(() => {
    const cleanup = () => clearPlayerEntryGateOnUnload();
    window.addEventListener('pagehide', cleanup);
    window.addEventListener('beforeunload', cleanup);
    return () => {
      window.removeEventListener('pagehide', cleanup);
      window.removeEventListener('beforeunload', cleanup);
    };
  }, []);

  useEffect(() => {
    if (!eventId) return;

    let cancelled = false;
    setEntryGateReady(false);

    (async () => {
      // ✅ 안전망: 이메일 세션 복원을 먼저 기다린 뒤,
      // 인증코드 세션이 있는 경우에만 익명 로그인을 보장합니다.
      //
      // ✅ 보완 핵심:
      // 일부 브라우저는 "닫은 탭 복원/마지막 세션 복원" 설정 때문에 sessionStorage가 살아남을 수 있습니다.
      // 따라서 이메일 로그인 후 Player HOME 진입 허용은 sessionStorage만 보지 않고,
      // localStorage의 임시 active gate까지 함께 확인합니다. 이 active gate는 pagehide/beforeunload 때 제거됩니다.
      let hasSessionAuth = false;
      let emailSessionRestored = false;
      try {
        const auth = getAuth();
        const restored = auth.currentUser || await waitForAuthRestored(1500);
        emailSessionRestored = !!(restored && !restored.isAnonymous);
        const hasEmailGate = hasCurrentPageEmailEntryGate();
        hasSessionAuth =
          sessionStorage.getItem(`auth_${eventId}`) === 'true' ||
          !!sessionStorage.getItem(`participant_${eventId}`) ||
          !!sessionStorage.getItem('pending_code') ||
          hasEmailGate;

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
          if (!cancelled) setEntryGateReady(true);
          return;
        }

        // 2) localStorage fallback
        // 브라우저 재시작 후 마지막 HOME URL이 바로 열리는 경우를 막기 위해,
        // 로그인 화면에서 이메일 세션 확인 버튼을 누른 이번 화면 세션에서만 localStorage 복원을 허용합니다.
        const allowLocalRestore = hasCurrentPageEmailEntryGate();
        if (allowLocalRestore) {
          const partLS = localStorage.getItem(playerStorageKey(eventId, 'participant'));
          const codeLS = localStorage.getItem(playerStorageKey(eventId, 'authcode')) || '';
          if (partLS) {
            try { applyAuthAndParticipant(codeLS, JSON.parse(partLS)); } catch {}
            if (!cancelled) setEntryGateReady(true);
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

  // ✅ 비동기 게이트 판단이 끝나기 전에는 Player HOME/STEP 화면을 먼저 렌더링하지 않습니다.
  // 이로써 브라우저가 마지막 /player/home URL을 복원해도 홈화면이 먼저 뜨는 현상을 차단합니다.
  if (!entryGateReady) {
    return null;
  }

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
