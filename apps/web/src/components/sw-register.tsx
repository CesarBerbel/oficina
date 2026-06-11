'use client';

import { useEffect } from 'react';

/** Registra o service worker (PWA instalável + push). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* ignora falha de registro (ex.: ambiente sem HTTPS) */
      });
    }
  }, []);
  return null;
}
