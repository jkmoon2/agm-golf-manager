//src/contexts/ParticipantContext.jsx

import React, { createContext, useState, useContext } from 'react';

const ParticipantContext = createContext();

export function ParticipantProvider({ children }) {
  const [player, setPlayer] = useState(null);
  const [eventData, setEventData] = useState(null);

  return (
    <ParticipantContext.Provider value={{
      player, setPlayer,
      eventData, setEventData
    }}>
      {children}
    </ParticipantContext.Provider>
  );
}

export const useParticipant = () => useContext(ParticipantContext);
