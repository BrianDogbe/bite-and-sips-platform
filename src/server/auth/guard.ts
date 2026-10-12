import 'server-only';
import { forbidden, unauthenticated } from '../errors';
import type { Permission } from './permissions';
import type { SessionUser } from './sessions';
import type { Actor } from '../audit';

/** Server-side authorization check used by every privileged service function. */
export function requirePerm(user: SessionUser | null | undefined, perm: Permission): SessionUser {
  if (!user) throw unauthenticated();
  if (!user.permissions.has(perm)) throw forbidden();
  return user;
}

export function requireAnyPerm(user: SessionUser | null | undefined, perms: Permission[]): SessionUser {
  if (!user) throw unauthenticated();
  if (!perms.some((p) => user.permissions.has(p))) throw forbidden();
  return user;
}

export function hasPerm(user: SessionUser | null | undefined, perm: Permission): boolean {
  return !!user && user.permissions.has(perm);
}

export function actorOf(user: SessionUser | null | undefined, ip?: string | null): Actor {
  if (!user) return { userId: null, label: 'customer', ip };
  const primary = (['owner', 'manager', 'dispatcher', 'support', 'kitchen', 'rider', 'customer'] as const).find((r) => user.roles.includes(r));
  return { userId: user.id, label: primary ?? 'user', ip };
}
