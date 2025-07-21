// src/contexts/EventContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';

export const EventContext = createContext();

export function EventProvider({ children }) {
  const [allEvents, setAllEvents]   = useState([]);
  const [eventId, setEventId]       = useState(localStorage.getItem('eventId') || null);
  const [eventData, setEventData]   = useState(null);

  // 1) 전체 이벤트 목록 구독
  useEffect(() => {
    const colRef = collection(db, 'events');
    const unsub  = onSnapshot(colRef, snap => {
      const evts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllEvents(evts);
    });
    return unsub;
  }, []);

  // 2) 선택된 이벤트(eventId) 구독 (pendingWrites 무시)
  useEffect(() => {
    if (!eventId) {
      setEventData(null);
      return;
    }
    const docRef = doc(db, 'events', eventId);
    const unsub  = onSnapshot(
      docRef,
      { includeMetadataChanges: true },
      snap => {
        // 클라이언트에서 아직 서버에 반영되지 않은 쓰기는 무시
        if (snap.metadata.hasPendingWrites) return;
        setEventData(snap.data());
      }
    );
    return unsub;
  }, [eventId]);

  // 3) 이벤트 불러오기
  const loadEvent = async id => {
    setEventId(id);
    localStorage.setItem('eventId', id);
    return id;
  };

  // 4) 새 이벤트 생성
  const createEvent = async ({ title, mode, id }) => {
    const colRef = collection(db, 'events');
    const docRef = id
      ? doc(db, 'events', id)
      : doc(colRef);
    await setDoc(docRef, {
      title,
      mode,
      roomCount:    4,
      roomNames:    Array(4).fill(''),
      uploadMethod: '',
      participants: []
    });
    return docRef.id;
  };

  // 5) 이벤트 업데이트
  const updateEvent = async updates => {
    if (!eventId) return;
    const docRef = doc(db, 'events', eventId);
    await updateDoc(docRef, updates);
  };

  // 6) 이벤트 삭제
  const deleteEvent = async id => {
    await deleteDoc(doc(db, 'events', id));
    if (eventId === id) {
      setEventId(null);
      localStorage.removeItem('eventId');
    }
  };

  return (
    <EventContext.Provider value={{
      allEvents,
      eventId,
      eventData,
      loadEvent,
      createEvent,
      updateEvent,
      deleteEvent
    }}>
      {children}
    </EventContext.Provider>
  );
}
