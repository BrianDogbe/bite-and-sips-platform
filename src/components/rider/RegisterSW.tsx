'use client';
import { useEffect } from 'react';

/** Registers the rider service worker (installability + offline shell). Never caches API data. */
export function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/rider-sw.js', { scope: '/rider' }).catch(() => {});
    }
  }, []);
  return null;
}
