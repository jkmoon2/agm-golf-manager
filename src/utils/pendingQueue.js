// /src/utils/pendingQueue.js
// 간단한 Firestore 쓰기 큐(로컬스토리지 보존, 온라인 복귀/주기적 재시도)

import { setDoc, updateDoc, addDoc, doc, collection } from 'firebase/firestore';
import { db } from '../firebase';

const LS_KEY = 'pendingWrites:v1';

function now() { return Date.now(); }

export class PendingQueue {
  constructor() {
    this.items = [];
    this.timer = null;
    this.listeners = new Set();
    this.load();
    this.bindOnline();
    this.kick();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify() { this.listeners.forEach(fn => { try { fn(this.items); } catch {} }); }

  load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) this.items = JSON.parse(raw) || [];
    } catch { this.items = []; }
  }
  save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.items)); } catch {}
  }

  bindOnline() {
    window.addEventListener('online', () => this.kick(200));
  }

  add(task) {
    // task: {type:'set'|'update'|'add', path?:string, col?:string, id?:string, data, merge}
    const item = { id: `${now()}-${Math.random().toString(36).slice(2,8)}`, try:0, last:0, ...task };
    this.items.push(item);
    this.save(); this.notify();
    this.kick(100);
    return item.id;
  }

  async runOne(item) {
    try {
      if (item.type === 'set') {
        await setDoc(doc(db, item.path), item.data, { merge: !!item.merge });
      } else if (item.type === 'update') {
        await updateDoc(doc(db, item.path), item.data);
      } else if (item.type === 'add') {
        await addDoc(collection(db, item.col), item.data);
      } else {
        throw new Error('Unknown type');
      }
      return true;
    } catch (e) {
      // Firestore가 오프라인이면 throw 나옴 → 나중에 재시도
      return false;
    }
  }

  schedule(delay = 1000) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), delay);
  }

  kick(delay = 500) {
    if (!navigator.onLine) return; // 오프라인이면 대기
    this.schedule(delay);
  }

  async flush() {
    if (!this.items.length) return;
    // 한 번에 여러 개 처리(최대 5개)
    const batch = this.items.slice(0, 5);
    let any = false;
    for (const it of batch) {
      const ok = await this.runOne(it);
      it.try += 1; it.last = now();
      if (ok) {
        // 성공 → 제거
        this.items = this.items.filter(x => x.id !== it.id);
        any = true;
      } else {
        // 실패 → 잠시 후 재시도
      }
    }
    this.save(); this.notify();
    if (this.items.length) this.schedule(any ? 200 : 3000);
  }
}

// 싱글턴으로 써도 되고, 필요시 새로 만들어도 됨
export const pendingQueue = new PendingQueue();
