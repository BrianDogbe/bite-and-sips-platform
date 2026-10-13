'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BrandMark } from '../BrandMark';
import { Icon, type IconName } from '../Icon';
import { LogoutButton } from '../LoginForm';

export interface NavItem {
  href: string;
  label: string;
  group?: string;
}

const ICONS: Record<string, IconName> = {
  '/admin': 'home',
  '/admin/orders': 'receipt',
  '/admin/kitchen': 'flame',
  '/admin/dispatch': 'bike',
  '/admin/support': 'chat',
  '/admin/menu': 'utensils',
  '/admin/promotions': 'tag',
  '/admin/inventory': 'box',
  '/admin/customers': 'users',
  '/admin/finance': 'wallet',
  '/admin/reports': 'chart',
  '/admin/staff': 'idcard',
  '/admin/settings': 'gear',
  '/admin/audit': 'shield',
};

export interface AlertItem {
  id: string;
  tone: 'danger' | 'warn' | 'info';
  title: string;
  desc: string;
  href: string;
}

export function AdminShell({ items, userName, roleLabel, alerts = [], children }: { items: NavItem[]; userName: string; roleLabel: string; alerts?: AlertItem[]; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  // Keep the notification bell current: refresh on live changes, on a timer, on tab focus and after navigating.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    let es: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      es = new EventSource('/api/realtime?topics=admin');
      es.addEventListener('change', refresh);
    }
    const poll = setInterval(refresh, 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      es?.close();
      clearInterval(poll);
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, [router]);
  useEffect(() => {
    const t = setTimeout(() => router.refresh(), 600);
    return () => clearTimeout(t);
  }, [path, router]);
  const [open, setOpen] = useState(false);
  let lastGroup: string | undefined;
  const [bell, setBell] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu && !bell) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
      if (!bellRef.current?.contains(e.target as Node)) setBell(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenu(false);
        setBell(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu, bell]);
  const initial = userName.trim().charAt(0).toUpperCase();
  return (
    <div className="admin-shell">
      <aside className="admin-side" data-open={open} aria-label="Admin navigation">
        <Link href="/admin" className="brand">
          <BrandMark /> Bite &amp; Sips
        </Link>
        <nav className="admin-nav">
          {items.map((it) => {
            const showGroup = it.group && it.group !== lastGroup;
            lastGroup = it.group;
            const active = it.href === '/admin' ? path === '/admin' : path === it.href || path.startsWith(it.href + '/');
            const icon = ICONS[it.href];
            return (
              <div key={it.href} style={{ display: 'contents' }}>
                {showGroup && <div className="group">{it.group}</div>}
                <Link href={it.href} aria-current={active ? 'page' : undefined} onClick={() => setOpen(false)}>
                  {icon && <Icon name={icon} size={19} />}
                  {it.label}
                </Link>
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="admin-main">
        <header className="admin-bar">
          <button className="btn sm menu-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <Icon name="menu" size={18} /> Menu
          </button>
          <form action="/admin/orders" method="get" role="search" className="bar-search">
            <Icon name="search" size={18} />
            <input name="q" type="search" placeholder="Search orders by number, name or phone" aria-label="Search orders" />
          </form>
          <div className="bar-right">
          <div className="bar-bell-wrap" ref={bellRef}>
            <button type="button" className="bar-bell" aria-haspopup="true" aria-expanded={bell} aria-label={alerts.length ? `Notifications, ${alerts.length} need attention` : 'Notifications'} onClick={() => { setBell((b) => !b); setMenu(false); }}>
              <Icon name="bell" size={20} />
              {alerts.length > 0 && <span className="bar-badge">{alerts.length > 9 ? '9+' : alerts.length}</span>}
            </button>
            {bell && (
              <div className="bar-dropdown bar-notes">
                <div className="bar-notes-head">Notifications</div>
                {alerts.length === 0 ? (
                  <p className="bar-notes-empty">You’re all caught up.</p>
                ) : (
                  <ul>
                    {alerts.map((a) => (
                      <li key={a.id}>
                        <Link href={a.href} onClick={() => setBell(false)}>
                          <span className={`dash-dot ${a.tone}`} aria-hidden="true" />
                          <span>
                            <strong>{a.title}</strong>
                            <span>{a.desc}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="bar-menu" ref={menuRef}>
            <button type="button" className="bar-user" aria-haspopup="menu" aria-expanded={menu} onClick={() => { setMenu((m) => !m); setBell(false); }}>
              <span className="side-avatar" aria-hidden="true">{initial}</span>
              <span className="bar-user-text">
                <strong>{userName}</strong>
                <span>{roleLabel}</span>
              </span>
              <svg className="bar-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {menu && (
              <div className="bar-dropdown" role="menu">
                <Link href="/admin/account" role="menuitem" onClick={() => setMenu(false)}>
                  <Icon name="user" size={18} /> Account
                </Link>
                <LogoutButton to="/admin/login" className="bar-dropdown-out" />
              </div>
            )}
          </div>
          </div>
        </header>
        {children}
      </div>
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 40 }} aria-hidden="true" />}
    </div>
  );
}
