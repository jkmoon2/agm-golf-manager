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
  const [allEvents, setAllEvents] = useState([]);
  const [eventId, setEventId]     = useState(localStorage.getItem('eventId') || null);
  const [eventData, setEventData] = useState(null);

  // 전체 이벤트
  useEffect(() => {
    const colRef = collection(db, 'events');
    const unsub  = onSnapshot(colRef, snap => {
      const evts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllEvents(evts);
    });
    return unsub;
  }, []);

  // 선택 이벤트
  useEffect(() => {
    if (!eventId) { setEventData(null); return; }
    const docRef = doc(db, 'events', eventId);
    const unsub  = onSnapshot(
      docRef,
      { includeMetadataChanges: true },
      snap => {
        if (snap.metadata.hasPendingWrites) return;
        setEventData(snap.data());
      }
    );
    return unsub;
  }, [eventId]);

  const loadEvent = async (id) => {
    setEventId(id);
    localStorage.setItem('eventId', id);
    return id;
  };

  // 생성 (기간 옵션 포함)
  const createEvent = async ({
    title, mode, id, dateStart = '', dateEnd = '', allowDuringPeriodOnly = false
  }) => {
    const colRef = collection(db, 'events');
    const docRef = id ? doc(db, 'events', id) : doc(colRef);
    await setDoc(docRef, {
      title,
      mode,
      roomCount: 4,
      roomNames: Array(4).fill(''),
      uploadMethod: '',
      participants: [],
      dateStart,
      dateEnd,
      allowDuringPeriodOnly,
    });
    return docRef.id;
  };

  const updateEvent = async (updates) => {
    if (!eventId) return;
    const docRef = doc(db, 'events', eventId);
    await updateDoc(docRef, updates);
  };

  // ✅ 카드 편집 모달에서 특정 이벤트를 바로 업데이트할 수 있게 헬퍼 추가
  const updateEventById = async (id, updates) => {
    await updateDoc(doc(db, 'events', id), updates);
  };

  const deleteEvent = async (id) => {
    await deleteDoc(doc(db, 'events', id));
    if (eventId === id) {
      setEventId(null);
      localStorage.removeItem('eventId');
    }
  };

  return (
    <EventContext.Provider value={{
      allEvents, eventId, eventData,
      loadEvent, createEvent, updateEvent, updateEventById, deleteEvent
    }}>
      {children}
    </EventContext.Provider>
  );
}
