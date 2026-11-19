import React, { useEffect, useRef, useState } from 'react';

export const PwaShellNotice: React.FC = () => {
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

    const hadController = Boolean(navigator.serviceWorker.controller);
    let registration: ServiceWorkerRegistration | null = null;
    let updateTimer: number | undefined;

    const handleControllerChange = () => {
      if (hadController) window.location.reload();
    };
    const watchInstallingWorker = () => {
      const installing = registration?.installing;
      if (!installing) return;
      const announceInstalled = () => {
        if (installing.state !== 'installed') return;
        if (navigator.serviceWorker.controller) setUpdateAvailable(true);
        else setOfflineReady(true);
      };
      installing.addEventListener('statechange', announceInstalled);
      announceInstalled();
    };
    const checkForUpdate = () => {
      if (registration && navigator.onLine) void registration.update().catch(() => undefined);
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    window.addEventListener('focus', checkForUpdate);

    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(value => {
      registration = value;
      registrationRef.current = value;
      registration.addEventListener('updatefound', watchInstallingWorker);
      watchInstallingWorker();
      if (registration.waiting && navigator.serviceWorker.controller) setUpdateAvailable(true);
      checkForUpdate();
      updateTimer = window.setInterval(checkForUpdate, 60 * 60 * 1000);
    }).catch(() => undefined);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      window.removeEventListener('focus', checkForUpdate);
      if (registration) registration.removeEventListener('updatefound', watchInstallingWorker);
      if (updateTimer !== undefined) window.clearInterval(updateTimer);
      registrationRef.current = null;
    };
  }, []);

  const applyUpdate = () => {
    registrationRef.current?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  };

  if (!offlineReady && !updateAvailable) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-lg" role="status" aria-live="polite">
      {updateAvailable ? (
        <>
          <p className="text-sm font-semibold text-slate-900">Uma atualização do Bokken está pronta.</p>
          <p className="mt-1 text-xs text-slate-600">Atualize quando terminar o que está fazendo.</p>
          <button onClick={applyUpdate} className="mt-3 rounded-lg bg-bokken-navy px-3 py-2 text-sm font-semibold text-white">Atualizar agora</button>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-slate-900">Aplicativo pronto para abrir offline.</p>
          <button onClick={() => setOfflineReady(false)} className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Entendi</button>
        </>
      )}
    </div>
  );
};
