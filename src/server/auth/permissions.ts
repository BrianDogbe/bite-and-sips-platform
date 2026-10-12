/**
 * Role-based access control. Roles are stored per user (a user may hold several);
 * permissions are derived from roles here so the matrix is reviewable in one place
 * (also documented in docs/PERMISSIONS.md). Every privileged server action calls
 * `requirePermission` — hiding buttons in the UI is never the only protection.
 */
export const ROLES = ['owner', 'manager', 'kitchen', 'dispatcher', 'rider', 'support', 'customer'] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: Role[] = ['owner', 'manager', 'kitchen', 'dispatcher', 'rider', 'support'];

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
  'rider.deliver',
  'customers.view',
  'customers.manage',
  'inventory.manage',
  'finance.view',
  'reports.view',
  'settings.manage',
  'staff.manage',
  'support.manage',
  'audit.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ALL,
  // Managers hold every permission, but `canGrantRole` stops them granting/revoking the owner role.
  manager: ALL,
  kitchen: ['kitchen.operate', 'menu.availability'],
  dispatcher: ['dashboard.view', 'orders.view', 'dispatch.manage', 'kitchen.monitor'],
  rider: ['rider.deliver'],
  support: ['dashboard.view', 'orders.view', 'orders.manage', 'customers.view', 'support.manage', 'cash.collect', 'kitchen.monitor'],
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
  dispatcher: 'Dispatcher',
  rider: 'Rider',
  support: 'Support / cashier',
  customer: 'Customer',
};
