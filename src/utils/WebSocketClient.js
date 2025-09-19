// /src/utils/WebSocketClient.js
// 운영에서는 env 없으면 자동 비활성. 개발에서는 localhost 기본값 사용.

const isProd = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

const envUrl =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_WS_URL) ||
  (typeof process !== 'undefined' && process.env.REACT_APP_WS_URL) || '';

const DEV_FALLBACK_URL = 'ws://localhost:3000/ws';

export function createWebSocketClient(options = {}) {
  if (isProd && !envUrl) {
    console.info('[WS] disabled in production (no env url)');
    return { connect(){}, close(){}, send(){}, enabled:false };
  }
  const url = envUrl || DEV_FALLBACK_URL;
  let ws = null, timer = null;
  const reconnect = () => {
    if (isProd) return; // 운영에선 재연결 금지(원한다면 제거)
    timer = setTimeout(connect, 3000);
  };
  const connect = () => {
    try {
      ws = new WebSocket(url);
      ws.onopen = () => options.onOpen?.();
      ws.onmessage = (e) => options.onMessage?.(e);
      ws.onclose = () => { options.onClose?.(); reconnect(); };
      ws.onerror = (e) => options.onError?.(e);
    } catch (e) {
      options.onError?.(e); reconnect();
    }
  };
  const close = () => { try{ ws?.close(); }catch{} if (timer) clearTimeout(timer); };
  const send  = (d) => { try{ ws && ws.readyState === 1 && ws.send(d); }catch{} };
  return { connect, close, send, enabled:true };
}
