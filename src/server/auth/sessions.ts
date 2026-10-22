import 'server-only';
import { sql, type Db } from '../db';
import { newToken, sha256 } from '../ids';
import { verifyPassword } from './password';
import { hitRateLimit, rateLimitCount, clearRateLimit } from './rate-limit';
import { DomainError, rateLimited } from '../errors';
import { log } from '../log';
import { permissionsFor, type Permission, type Role } from './permissions';

/**
 * One session cookie per portal, so being signed in to admin, kitchen and rider at the same time
 * (e.g. on a shared tablet or while testing) never overwrites another portal's session.
 * `bs_session` stays the customer cookie.
 */
export type Portal = 'admin' | 'kitchen' | 'rider' | 'customer';
export const SESSION_COOKIES: Record<Portal, string> = {
  admin: 'bs_admin',
  kitchen: 'bs_kitchen',
  rider: 'bs_rider',
  customer: 'bs_session',
};
export const SESSION_COOKIE = SESSION_COOKIES.customer;
export const SESSION_TTL_DAYS = 14;
/** Owners, managers, kitchen staff and riders sign in again after this long, even if the screen stays open. */
export const STAFF_SESSION_TTL_HOURS = 12;
/**
 * Sign-in throttling. Failures are counted per account AND address, so a stranger who types the owner's email wrong
 * eight times only blocks their own address, not the owner. A much higher ceiling per account (from anywhere) still
 * caps distributed password guessing.
 */
const MAX_FAILED_PER_ADDRESS = 8;
const FAIL_WINDOW_SECONDS = 15 * 60;
const MAX_FAILED_PER_ACCOUNT = 60;
const ACCOUNT_WINDOW_SECONDS = 60 * 60;

export interface SessionUser {
  id: string;
  sessionId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  roles: Role[];
  permissions: Set<Permission>;
}

export function normalizePhone(input: string): string {
  // Ghana numbers: accept 0XXXXXXXXX, +233XXXXXXXXX, 233XXXXXXXXX. Other formats kept digits-only with +.
  const digits = input.replace(/[^\d+]/g, '');
  if (/^0\d{9}$/.test(digits)) return `+233${digits.slice(1)}`;
  if (/^233\d{9}$/.test(digits)) return `+${digits}`;
  if (/^\+233\d{9}$/.test(digits)) return digits;
  return digits.startsWith('+') ? digits : digits;
}

export function isValidGhanaPhone(input: string): boolean {
  return /^\+233\d{9}$/.test(normalizePhone(input));
}

async function findUserByIdentifier(identifier: string, db: Db) {
  const id = identifier.trim();
  const isEmail = id.includes('@');
  const rows = isEmail
    ? await db<UserRow[]>`select id, full_name, email, phone, password_hash, is_active, failed_login_count, locked_until from users where lower(email) = lower(${id}) limit 1`
    : await db<UserRow[]>`select id, full_name, email, phone, password_hash, is_active, failed_login_count, locked_until from users where phone = ${normalizePhone(id)} order by created_at limit 1`;
  return rows[0] ?? null;
}

interface UserRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  passwordHash: string | null;
  isActive: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export async function rolesOf(userId: string, db: Db = sql): Promise<Role[]> {
  const rows = await db<{ role: Role }[]>`select role from user_roles where user_id = ${userId}`;
  return rows.map((r) => r.role);
}

/**
 * Verify credentials and create a session. Returns the raw token (to be set as an httpOnly cookie).
 * Rate limited per IP; repeated failures block that address for that account for a while (see above).
 */
export async function login(
  identifier: string,
  password: string,
  meta: { ip?: string | null; userAgent?: string | null; requireAnyRole?: Role[] },
  db: Db = sql,
): Promise<{ token: string; userId: string; roles: Role[]; expiresAt: Date }> {
  const ident = identifier.trim().toLowerCase().slice(0, 200);
  const ip = meta.ip ?? 'unknown';
  const ipKey = `login:ip:${ip}`;
  const failKey = `login:fail:${ident}:${ip}`;
  const acctKey = `login:acct:${ident}`;
  const ipHit = await hitRateLimit(ipKey, 30, 15 * 60, db);
  if (!ipHit.allowed) throw rateLimited();

  // Same answer for real and made-up accounts, so this does not reveal which accounts exist.
  const locked = new DomainError('locked', 'Too many failed sign-ins. Try again in a few minutes.', 423);
  if (
    (await rateLimitCount(failKey, FAIL_WINDOW_SECONDS, db)) >= MAX_FAILED_PER_ADDRESS ||
    (await rateLimitCount(acctKey, ACCOUNT_WINDOW_SECONDS, db)) >= MAX_FAILED_PER_ACCOUNT
  ) {
    throw locked;
  }

  const recordFailure = async () => {
    await hitRateLimit(failKey, MAX_FAILED_PER_ADDRESS, FAIL_WINDOW_SECONDS, db);
    const acct = await hitRateLimit(acctKey, MAX_FAILED_PER_ACCOUNT, ACCOUNT_WINDOW_SECONDS, db);
    if (acct.count === MAX_FAILED_PER_ACCOUNT) log.warn('login_account_throttled', { failures: acct.count, windowSeconds: ACCOUNT_WINDOW_SECONDS });
  };

  const generic = new DomainError('invalid_credentials', 'Incorrect email/phone or password.', 401);
  const user = await findUserByIdentifier(identifier, db);
  if (!user) {
    await verifyPassword(password, null);
    await recordFailure();
    throw generic;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok || !user.isActive) {
    if (!ok) {
      await db`update users set failed_login_count = failed_login_count + 1 where id = ${user.id}`;
    }
    await recordFailure();
    throw generic;
  }
  const roles = await rolesOf(user.id, db);
  if (meta.requireAnyRole && !meta.requireAnyRole.some((r) => roles.includes(r))) {
    throw new DomainError('wrong_portal', 'This account does not have access to this area.', 403);
  }
  await db`update users set failed_login_count = 0, locked_until = null, last_login_at = now() where id = ${user.id}`;
  await clearRateLimit(failKey, db);
  const isStaff = roles.some((r) => r !== 'customer');
  const { token, expiresAt } = await createSession(user.id, meta, db, isStaff ? STAFF_SESSION_TTL_HOURS * 3600_000 : undefined);
  return { token, userId: user.id, roles, expiresAt };
}

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }, db: Db = sql, ttlMs: number = SESSION_TTL_DAYS * 86400_000) {
  const token = newToken(32);
  const expiresAt = new Date(Date.now() + ttlMs);
  await db`
    insert into sessions (token_hash, user_id, expires_at, ip, user_agent)
    values (${sha256(token)}, ${userId}, ${expiresAt}, ${meta.ip ?? null}, ${(meta.userAgent ?? '').slice(0, 300)})`;
  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined | null, db: Db = sql): Promise<SessionUser | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const rows = await db<{ sessionId: string; lastSeenAt: Date; id: string; fullName: string; email: string | null; phone: string | null; isActive: boolean }[]>`
    select s.id as session_id, s.last_seen_at, u.id, u.full_name, u.email, u.phone, u.is_active
    from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${sha256(token)} and s.revoked_at is null and s.expires_at > now()
    limit 1`;
  const row = rows[0];
  if (!row || !row.isActive) return null;
  if (Date.now() - new Date(row.lastSeenAt).getTime() > 5 * 60_000) {
    await db`update sessions set last_seen_at = now() where id = ${row.sessionId}`;
  }
  const roles = await rolesOf(row.id, db);
  return {
    id: row.id,
    sessionId: row.sessionId,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    roles,
    permissions: permissionsFor(roles),
  };
}

export async function revokeSession(token: string, db: Db = sql) {
  await db`update sessions set revoked_at = now() where token_hash = ${sha256(token)} and revoked_at is null`;
}

export async function revokeAllSessionsForUser(userId: string, db: Db = sql) {
  await db`update sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`;
}

export async function purgeExpiredSessions(db: Db = sql) {
  await db`delete from sessions where expires_at < now() - interval '7 days' or revoked_at < now() - interval '7 days'`;
}
