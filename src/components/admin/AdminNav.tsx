'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { BrandMark } from '../BrandMark';
import { Icon } from '../Icon';
import { LogoutButton } from '../LoginForm';

export interface NavItem {
  href: string;
  label: string;
  group?: string;
}

export function AdminShell({ items, userName, roleLabel, children }: { items: NavItem[]; userName: string; roleLabel: string; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  let lastGroup: string | undefined;
  return (
    <div className="admin-shell">
      <aside className="admin-side" data-open={open} aria-label="Admin navigation">
        <Link href="/admin" className="brand">
          <BrandMark light /> Bite &amp; Sips
        </Link>
        <nav className="admin-nav">
          {items.map((it) => {
            const showGroup = it.group && it.group !== lastGroup;
            lastGroup = it.group;
            const active = it.href === '/admin' ? path === '/admin' : path === it.href || path.startsWith(it.href + '/');
            return (
              <div key={it.href} style={{ display: 'contents' }}>
                {showGroup && <div className="group">{it.group}</div>}
                <Link href={it.href} aria-current={active ? 'page' : undefined} onClick={() => setOpen(false)}>
                  {it.label}
                </Link>
              </div>
            );
          })}
        </nav>
        <div style={{ marginTop: 24, padding: '0 8px', fontSize: '0.88rem' }}>
          <div style={{ color: '#fff', fontWeight: 700 }}>{userName}</div>
          <div>{roleLabel}</div>
          <div className="row" style={{ marginTop: 10 }}>
            <Link href="/admin/account" className="btn sm">
              Account
            </Link>
            <LogoutButton to="/admin/login" />
          </div>
        </div>
      </aside>
      <div className="admin-main">
        <button className="btn sm menu-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ marginBottom: 10 }}>
          <Icon name="menu" size={18} /> Menu
        </button>
        {children}
      </div>
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 40 }} aria-hidden="true" />}
    </div>
  );
}
