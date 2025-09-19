// /src/serviceWorkerRegistration.js
// 서비스워커 파일이 있을 때만, 그리고 localhost에서만 등록(필요 시 정책 바꿔도 됨)

export function register() {
  if (!('serviceWorker' in navigator)) return;

  const isLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!isLocalhost) {
    console.info('[SW] skip (non-localhost)');
    return;
  }
  const url = '/service-worker.js';

  fetch(url, { method:'HEAD' })
    .then(res => {
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.includes('javascript')) {
        console.info('[SW] not a JS file. skip');
        return;
      }
      return navigator.serviceWorker.register(url);
    })
    .catch(() => console.info('[SW] missing, skip'));
}
