import type { Metadata } from 'next';
import { requirePagePerm } from '@/server/auth/current';
import { AdminShell, type NavItem } from '@/components/admin/AdminNav';
import { ROLE_LABELS, type Permission } from '@/server/auth/permissions';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s | Admin' }, robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const NAV: (NavItem & { perm: Permission })[] = [
  { href: '/admin', label: 'Overview', perm: 'dashboard.view', group: 'Today' },
  { href: '/admin/orders', label: 'Orders', perm: 'orders.view', group: 'Today' },
  { href: '/admin/kitchen', label: 'Kitchen monitor', perm: 'kitchen.monitor', group: 'Today' },
  { href: '/admin/dispatch', label: 'Dispatch', perm: 'dispatch.manage', group: 'Today' },
  { href: '/admin/support', label: 'Support cases', perm: 'support.manage', group: 'Today' },
  { href: '/admin/menu', label: 'Menu', perm: 'menu.manage', group: 'Manage' },
  { href: '/admin/promotions', label: 'Promotions', perm: 'menu.manage', group: 'Manage' },
  { href: '/admin/inventory', label: 'Inventory', perm: 'inventory.manage', group: 'Manage' },
  { href: '/admin/customers', label: 'Customers', perm: 'customers.view', group: 'Manage' },
  { href: '/admin/finance', label: 'Finance', perm: 'finance.view', group: 'Business' },
  { href: '/admin/reports', label: 'Reports', perm: 'reports.view', group: 'Business' },
  { href: '/admin/staff', label: 'Staff', perm: 'staff.manage', group: 'Business' },
  { href: '/admin/settings', label: 'Settings', perm: 'settings.manage', group: 'Business' },
  { href: '/admin/audit', label: 'Audit log', perm: 'audit.view', group: 'Business' },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePagePerm(['dashboard.view', 'menu.manage', 'dispatch.manage', 'orders.view'], '/admin/login');
  const items = NAV.filter((n) => user.permissions.has(n.perm)).map(({ perm: _p, ...n }) => (void _p, n));
  const roleLabel = user.roles.filter((r) => r !== 'customer').map((r) => ROLE_LABELS[r]).join(', ');
  return (
    <div className="staff-body" style={{ minHeight: '100dvh' }}>
      <AdminShell items={items} userName={user.fullName} roleLabel={roleLabel}>
        {children}
      </AdminShell>
    </div>
  );
}
