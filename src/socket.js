// /src/socket.js
// 개발 중에만 자동 연결. 운영은 env 있을 때만 수동 연결.

import { createWebSocketClient } from './utils/WebSocketClient';

const client = createWebSocketClient({
  onOpen: () => console.log('[WS] open'),
  onClose: () => console.log('[WS] close'),
  onError: (e) => console.warn('[WS] error', e?.message || e),
  onMessage: (e) => console.log('[WS] msg', e.data),
});

if (client.enabled && process.env.NODE_ENV !== 'production') {
  client.connect();
}

export default client;
