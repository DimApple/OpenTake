import { useEffect, useState } from 'react';

declare global {
  interface Window {
    OpenTakeAndroid?: { saveFile(filename: string, base64: string): void };
  }
}

export function useOffline() {
  const [ready, setReady] = useState(() => Boolean(window.OpenTakeAndroid));
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState('');
  const [update, setUpdate] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const connectivity = () => setOnline(navigator.onLine);
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    let disposed = false;
    if (!window.OpenTakeAndroid && import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register(new URL('./sw.js', document.baseURI))
        .then(registration => {
          const inspect = () => {
            if (disposed) return;
            setUpdate(registration.active ? registration.waiting : null);
            if (registration.active?.state === 'activated') setReady(true);
          };
          inspect();
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            worker?.addEventListener('statechange', () => {
              inspect();
              if (worker.state === 'redundant' && !registration.active && !disposed) setError('Offline setup failed.');
            });
          });
          registration.installing?.addEventListener('statechange', inspect);
          void navigator.serviceWorker.ready.then(inspect);
        })
        .catch(() => { if (!disposed) setError('Offline setup failed.'); });
    }
    return () => {
      disposed = true;
      window.removeEventListener('online', connectivity);
      window.removeEventListener('offline', connectivity);
    };
  }, []);

  function reloadForUpdate() {
    if (!update) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
    update.postMessage('activate');
  }

  return { ready, online, error, update, reloadForUpdate };
}
