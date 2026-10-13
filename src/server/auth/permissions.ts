/**
 * Role-based access control. Roles are stored per user (a user may hold several);
 * permissions are derived from roles here so the matrix is reviewable in one place
 * (also documented in docs/PERMISSIONS.md). Every privileged server action calls
 * `requirePermission` — hiding buttons in the UI is never the only protection.
 */
export const ROLES = ['owner', 'manager', 'kitchen', 'rider', 'customer'] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: Role[] = ['owner', 'manager', 'kitchen', 'rider'];

export const PERMISSIONS = [
  'dashboard.view',
  'orders.view', // see orders list/details (customer contact masked unless customers.view)
  'orders.manage', // notes, flag/clear attention, mark pickup collected
  'orders.cancel',
  'payments.view',
  'payments.refund',
  'payments.reconcile',
  'cash.collect',
  'menu.manage',
  'menu.availability', // mark items sold out / available
  'kitchen.operate',
  'kitchen.monitor',
  'dispatch.manage',
  'dispatch.assign', // pick an online rider for a delivery order (kitchen can do this from its screen)
  'rider.deliver',
  'customers.view',
  'customers.manage',
  'inventory.manage',
  'finance.view',
  'reports.view',
  'settings.manage',
  'settings.money', // payment switches, service charge, taxes, minimum order
  'finance.manage', // record expenses
  'staff.manage',
  'support.manage',
  'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];
const OWNER_ONLY: Permission[] = ['payments.refund', 'settings.money', 'finance.manage', 'audit.view'];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ALL,
  // Managers run the restaurant day to day. Money controls stay with the owner: refunds, payment/charge settings,
  // recording expenses and the audit log. `canGrantRole` also stops them granting/revoking the owner role.
  manager: ALL.filter((x) => !OWNER_ONLY.includes(x)),
  kitchen: ['kitchen.operate', 'menu.availability', 'dispatch.assign'],
  rider: ['rider.deliver'],
  customer: [],
};

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const s = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) s.add(p);
  return s;
}

export function can(roles: readonly Role[], perm: Permission): boolean {
  return permissionsFor(roles).has(perm);
}

/** Only owners can grant/revoke the owner role; managers can manage all other staff roles. */
export function canGrantRole(actorRoles: readonly Role[], role: Role): boolean {
  if (actorRoles.includes('owner')) return true;
  if (actorRoles.includes('manager')) return role !== 'owner';
  return false;
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  kitchen: 'Kitchen staff',
  rider: 'Rider',
  customer: 'Customer',
};
