// src/contexts/PlayerContext.jsx

import React, { createContext, useState } from 'react';

export const PlayerContext = createContext({
  eventId:       null,
  authCode:      '',
  participant:   null,
  setEventId:    () => {},
  setAuthCode:   () => {},
  setParticipant:() => {}
});

export function PlayerProvider({ children }) {
  const [eventId, setEventId]         = useState(null);
  const [authCode, setAuthCode]       = useState('');
  const [participant, setParticipant] = useState(null);

  return (
    <PlayerContext.Provider value={{
      eventId,
      authCode,
      participant,
      setEventId,
      setAuthCode,
      setParticipant
    }}>
      {children}
    </PlayerContext.Provider>
  );
}