// /src/serviceWorkerRegistration.js
// 서비스워커 파일이 있을 때만, 그리고 localhost에서만 등록(필요 시 정책 바꿔도 됨)

export function register() {
  if (!('serviceWorker' in navigator)) return;

  const isLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!isLocalhost) {
    // hotfix: stop old SW update attempts on production (e.g., Netlify)
    try { unregister(); } catch (e) {}
    console.info('[SW] skip (non-localhost)');
    return;
  }
  const url = '/service-worker.js';

  fetch(url, { method:'HEAD' })
    .then(res => {
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.includes('javascript')) {
        console.info('[SW] not a JS file. skip');
        try { unregister(); } catch (e) {}
        return;
      }
      return navigator.serviceWorker.register(url);
    })
    .catch(() => console.info('[SW] missing, skip'));
}

export function unregister() {
  if (!('serviceWorker' in navigator)) return;

  // Remove any previously registered SW so the browser stops trying to update it
  const sw = navigator.serviceWorker;
  if (typeof sw.getRegistrations === 'function') {
    sw.getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
    return;
  }

  sw.ready
    .then((reg) => reg.unregister())
    .catch(() => {});
}
