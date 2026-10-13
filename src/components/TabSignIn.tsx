'use client';
import { useEffect, useState } from 'react';

/**
 * Staff portals ask for a sign-in every time a tab is opened freshly, but not on a refresh.
 * The login page marks the tab (sessionStorage survives a refresh and is gone once the tab is closed);
 * a tab without the mark is signed out and sent to the login page.
 */
export function TabSignIn({ portal, loginPath }: { portal: 'admin' | 'kitchen' | 'rider'; loginPath: string }) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let marked = false;
    try {
      marked = sessionStorage.getItem(`bs-tab-${portal}`) === '1';
    } catch {
      marked = true; // storage unavailable: don't lock the person out
    }
    if (marked) {
      setOk(true);
      return;
    }
    void fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ portal }) })
      .catch(() => {})
      .finally(() => window.location.replace(loginPath));
  }, [portal, loginPath]);
  if (ok) return null;
  return <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--ivory, #faf6ee)' }} />;
}
