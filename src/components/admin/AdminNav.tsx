'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { subscribeRealtime } from '@/lib/realtime-client';
import { BrandMark } from '../BrandMark';
import { Icon, type IconName } from '../Icon';
import { LogoutButton } from '../LoginForm';
import { C_BAR_CARET, C_BAR_DROPDOWN, C_BAR_DROPDOWN_OUT, C_BRAND, C_SIDE_AVATAR } from '@/components/ui';

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
    const unsubscribe = subscribeRealtime({ topics: ['admin'], onChange: refresh });
    const poll = setInterval(refresh, 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      unsubscribe();
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
    <div className="grid [min-height:100dvh] [grid-template-columns:272px_minmax(0,_1fr)] max-[960px]:[grid-template-columns:1fr]">
      <aside className="sticky [top:0] [height:100dvh] overflow-y-auto flex flex-col [background:#fff] [color:var(--ink)] [border-right:1px_solid_var(--line)] [padding:22px_16px_20px] max-[960px]:fixed max-[960px]:[inset:0_auto_0_0] max-[960px]:[z-index:50] max-[960px]:[transform:translateX(-100%)] max-[960px]:[transition:transform_0.2s] max-[960px]:[width:300px] max-[960px]:[max-width:86vw] max-[960px]:data-[open=true]:[transform:none] max-[960px]:data-[open=true]:[box-shadow:var(--shadow-2)] [&_>_div:last-child]:[margin-top:auto]! [&_>_div:last-child]:[padding:22px_12px_0]! [&_>_div:last-child]:[border-top:1px_solid_rgba(255,_255,_255,_0.12)] [&_>_div:last-child]:[line-height:1.6] [&_>_div:last-child_.row]:[margin-top:14px]! [&_>_div:last-child_.row]:[gap:10px] admin-side" data-open={open} aria-label="Admin navigation">
        <Link href="/admin" className={C_BRAND}>
          <BrandMark /> Bite &amp; Sips
        </Link>
        <nav className="grid [padding-top:6px] [gap:4px] [&_a]:flex [&_a]:items-center [&_a]:no-underline [&_a]:font-bold [&_a]:[color:#5a5148] [&_a]:[padding:11px_14px] [&_a]:[font-size:0.95rem] [&_a]:[border-radius:10px] [&_a]:[gap:12px] [&_.group]:font-bold [&_.group]:[font-size:0.72rem] [&_.group]:[letter-spacing:0.14em] [&_.group]:uppercase [&_.group]:[color:#9a9087] [&_.group]:[padding:20px_14px_6px] [&_a_svg]:flex-none [&_a_svg]:[opacity:0.85] [&_a:hover]:[background:var(--ivory)] [&_a:hover]:[color:var(--espresso)] [&_a[aria-current=page]]:[background:var(--espresso)] [&_a[aria-current=page]]:[color:#fff] [&_a[aria-current=page]]:[box-shadow:0_6px_14px_rgba(53,_37,_31,_0.22)] [&_a[aria-current=page]_svg]:[opacity:1] [&_>_div:first-child_.group]:[padding-top:10px]">
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
      <div className="[&_h2]:[font-size:1.2rem] [&_.panel_h2]:[margin-bottom:0.6em] [padding:0_clamp(16px,_2.6vw,_36px)_56px] [--bar-gutter:clamp(16px,_2.6vw,_36px)] [min-width:0] [max-width:100%] [&_.panel]:[border-color:var(--line)] [&_.panel]:[border-radius:16px] [&_.panel]:[box-shadow:0_1px_2px_rgba(53,_37,_31,_0.04)] [&_.table-wrap]:[border-color:var(--line)] [&_.table-wrap]:overflow-x-auto [&_.table-wrap]:[-webkit-overflow-scrolling:touch] [&_.table-wrap]:[max-width:100%] [&_table.data_a:not(.btn)]:no-underline [&_table.data_a:not(.btn):hover]:underline [&_>_*]:[min-width:0] admin-main">
        <header className="grid [grid-template-columns:1fr_minmax(0,_440px)_1fr] items-center [gap:16px] [margin:0_calc(-1_*_var(--bar-gutter))_28px] [padding:12px_var(--bar-gutter)] [background:#fff] [border-bottom:1px_solid_var(--line)] sticky [top:0] [z-index:20] max-[960px]:[grid-template-columns:auto_minmax(0,_1fr)_auto] max-[600px]:[flex-wrap:unset] admin-bar">
          <button className="btn sm hidden max-[960px]:inline-flex [.admin-bar_&]:[justify-self:start] [.admin-bar_&]:[grid-column:1] max-[960px]:[.admin-bar_&]:inline-flex" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <Icon name="menu" size={18} /> Menu
          </button>
          <form action="/admin/orders" method="get" role="search" className="flex-1 [max-width:520px] flex items-center [gap:10px] [padding:0_16px] [height:46px] [background:#fff] [border:1px_solid_var(--line)] rounded-full [color:var(--muted)] [&_input]:flex-1 [&_input]:[min-width:0] [&_input]:border-0 [&_input]:outline-0 [&_input]:bg-transparent [&_input]:[font:inherit] [&_input]:[color:var(--ink)] focus-within:[border-color:var(--espresso)] focus-within:[box-shadow:0_0_0_3px_rgba(53,_37,_31,_0.1)] max-[600px]:[flex-basis:100%] max-[600px]:[order:3] max-[600px]:[max-width:none] [.admin-bar_&]:[grid-column:2] [.admin-bar_&]:[max-width:none] [.admin-bar_&]:[height:42px] [.admin-bar_&]:[border-radius:10px] [.admin-bar_&]:[background:#f6f4f0] [.admin-bar_&]:[font-size:0.9rem] [.admin-bar_&]:border-0 max-[600px]:[.admin-bar_&]:[grid-column:1_/_-1] max-[600px]:[.admin-bar_&]:[order:3] [.admin-bar_&&]:[box-shadow:none] [.admin-bar_&_input]:border-0 [.admin-bar_&_input]:outline-0 [.admin-bar_&_input]:[box-shadow:none] [.admin-bar_&_input]:bg-transparent [.admin-bar_&_input]:p-0 [.admin-bar_&_input]:[height:auto] [.admin-bar_&_input]:[border-radius:0] [.admin-bar_&_input:focus]:border-0 [.admin-bar_&_input:focus]:outline-0 [.admin-bar_&_input:focus]:[box-shadow:none] [.admin-bar_&_input:focus]:bg-transparent [.admin-bar_&_input:focus]:p-0 [.admin-bar_&_input:focus]:[height:auto] [.admin-bar_&_input:focus]:[border-radius:0] [.admin-bar_&_input:focus-visible]:border-0 [.admin-bar_&_input:focus-visible]:outline-0 [.admin-bar_&_input:focus-visible]:[box-shadow:none] [.admin-bar_&_input:focus-visible]:bg-transparent [.admin-bar_&_input:focus-visible]:p-0 [.admin-bar_&_input:focus-visible]:[height:auto] [.admin-bar_&_input:focus-visible]:[border-radius:0] [.admin-bar_&:focus-within]:border-0 [.admin-bar_&:focus-within]:[background:var(--ivory-2)] [.admin-bar_&:focus-within]:[box-shadow:none]">
            <Icon name="search" size={18} />
            <input name="q" type="search" placeholder="Search orders by number, name or phone" aria-label="Search orders" />
          </form>
          <div className="[.admin-bar_&]:[grid-column:3] [.admin-bar_&]:[justify-self:end] [.admin-bar_&]:flex [.admin-bar_&]:items-center [.admin-bar_&]:[gap:18px] max-[600px]:[.admin-bar_&]:[grid-column:3] bar-right">
          <div className="relative [margin-left:auto] [.bar-right_&]:[margin-left:0] bar-bell-wrap" ref={bellRef}>
            <button type="button" className="relative grid place-items-center rounded-[50%] [color:var(--espresso)] cursor-pointer [width:40px] [height:40px] border-0 bg-transparent [box-shadow:none] hover:[border-color:var(--line-strong)] hover:[background:var(--ivory)] hover:[box-shadow:none] aria-expanded:[border-color:var(--line-strong)] aria-expanded:[background:var(--ivory)] aria-expanded:[box-shadow:none]" aria-haspopup="true" aria-expanded={bell} aria-label={alerts.length ? `Notifications, ${alerts.length} need attention` : 'Notifications'} onClick={() => { setBell((b) => !b); setMenu(false); }}>
              <Icon name="bell" size={20} />
              {alerts.length > 0 && <span className="absolute [padding:0_5px] rounded-full [background:var(--danger)] [color:#fff] font-extrabold grid place-items-center [border:2px_solid_#f6f2eb] [top:2px] [right:0] [min-width:18px] [height:18px] [font-size:0.66rem] [&]:[border-color:#fff]">{alerts.length > 9 ? '9+' : alerts.length}</span>}
            </button>
            {bell && (
              <div className={`${C_BAR_DROPDOWN} bar-dropdown [width:min(380px,_calc(100vw_-_32px))] [padding:8px] [&_ul]:list-none [&_ul]:m-0 [&_ul]:p-0 [&_ul]:grid [&_ul]:[gap:2px] [&_ul]:[max-height:60vh] [&_ul]:overflow-y-auto [&_li_a]:items-start [&_li_a]:[gap:12px] [&_li_a_span:last-child]:grid [&_li_a_span:last-child]:[gap:2px] [&_li_a_span_span]:font-medium [&_li_a_span_span]:[font-size:0.82rem] [&_li_a_span_span]:[color:var(--muted)]`}>
                <div className="[padding:10px_12px_12px] font-extrabold [border-bottom:1px_solid_var(--line)] [margin-bottom:6px]">Notifications</div>
                {alerts.length === 0 ? (
                  <p className="m-0 [padding:18px_12px] [color:var(--muted)]">You’re all caught up.</p>
                ) : (
                  <ul>
                    {alerts.map((a) => (
                      <li key={a.id}>
                        <Link href={a.href} onClick={() => setBell(false)}>
                          <span className={`flex-none [width:10px] [height:10px] rounded-[50%] [margin-top:6px] [background:var(--info)] [&.danger]:[background:var(--danger)] [&.warn]:[background:var(--caramel)] [&.ok]:[background:var(--ok)] ${a.tone}`} aria-hidden="true" />
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
          <div className="relative [margin-left:auto] [.bar-bell-wrap_+_&]:[margin-left:0] [.bar-right_&]:[margin-left:0] [.bar-right_&]:[padding-left:18px] [.bar-right_&]:[border-left:1px_solid_var(--line)] [.kds-top_&.kds-user]:block [.kds-top_&.kds-user]:[margin-left:6px] [.kds-top_&.kds-user]:[padding-left:18px] [.kds-top_&.kds-user]:[border-left:1px_solid_var(--line)] bar-menu" ref={menuRef}>
            <button type="button" className="flex items-center [gap:12px] no-underline [color:var(--ink)] [margin-left:auto] [.admin-bar_&_+_*]:[margin-left:0] [.bar-menu_&]:[margin-left:0] [.bar-menu_&]:bg-transparent [.bar-menu_&]:border-0 [.bar-menu_&]:[padding:4px_8px_4px_4px] [.bar-menu_&]:rounded-full [.bar-menu_&]:cursor-pointer [.bar-menu_&]:[font:inherit] [.bar-menu_&]:text-left [.bar-menu_&:hover]:[background:#fff] [.bar-menu_&[aria-expanded=true]]:[background:#fff] bar-user" aria-haspopup="menu" aria-expanded={menu} onClick={() => { setMenu((m) => !m); setBell(false); }}>
              <span className={C_SIDE_AVATAR} aria-hidden="true">{initial}</span>
              <span className="grid [line-height:1.25] [font-size:0.82rem] [color:var(--muted)] [&_strong]:[color:var(--espresso)] [&_strong]:[font-size:0.92rem] max-[960px]:hidden">
                <strong>{userName}</strong>
                <span>{roleLabel}</span>
              </span>
              <svg className={C_BAR_CARET} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {menu && (
              <div className={`${C_BAR_DROPDOWN} bar-dropdown`} role="menu">
                <Link href="/admin/account" role="menuitem" onClick={() => setMenu(false)}>
                  <Icon name="user" size={18} /> Account
                </Link>
                <LogoutButton to="/admin/login" className={C_BAR_DROPDOWN_OUT} />
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
