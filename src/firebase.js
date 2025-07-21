// src/firebase.js

// Firebase SDK v9 모듈식 초기화로 전환
// 기존 compat import 대신 @firebase/app 및 @firebase/firestore, auth 모듈 사용
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyD_9AmDInzzn45aAzfNcjXIHRx27aDO0QY",
  authDomain: "agm-golf-manager.firebaseapp.com",
  projectId: "agm-golf-manager",
  storageBucket: "agm-golf-manager.firebasestorage.app",
  messagingSenderId: "521632418622",
  appId: "1:521632418622:web:50aca7cb09b99c290efa6f",
  measurementId: "G-XHPZ2W4RPQ"
};

// 앱 초기화
const app = initializeApp(firebaseConfig);

// Firestore 인스턴스
export const db = getFirestore(app);

// Auth 인스턴스
export const auth = getAuth(app);