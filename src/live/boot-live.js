// /src/live/boot-live.js
// 앱 부팅 시 한 번만 불리면 좋은 초기화(선택 요소들을 여기서 묶음)

import { pendingQueue } from '../utils/pendingQueue';
import { register as registerSW } from '../serviceWorkerRegistration';
// WebSocket은 필요할 때 별도 import. 여기선 등록하지 않음.

// 쓰기 큐 변화 로깅(원하면 UI 배지로 보여줄 수 있음)
pendingQueue.onChange((items) => {
  const n = items.length;
  if (n) console.info(`[Queue] pending writes = ${n}`);
});

// 로컬 개발일 때만 SW 시도
registerSW();

// 다른 초기화가 필요하면 여기에 추가…
