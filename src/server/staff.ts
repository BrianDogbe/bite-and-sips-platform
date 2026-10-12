import 'server-only';
import { sql, tx, type Db } from './db';
import { conflict, forbidden, invalid, notFound } from './errors';
import { audit } from './audit';
import { requirePerm, actorOf } from './auth/guard';
import type { SessionUser } from './auth/sessions';
import { normalizePhone, revokeAllSessionsForUser, createSession } from './auth/sessions';
import { hashPassword, passwordProblems } from './auth/password';
import { canGrantRole, STAFF_ROLES, type Role } from './auth/permissions';
import { enforceRateLimit } from './auth/rate-limit';

export async function listStaff(user: SessionUser | null, db: Db = sql) {
  requirePerm(user, 'staff.manage');
  return db<{ id: string; fullName: string; email: string | null; phone: string | null; isActive: boolean; lastLoginAt: Date | null; roles: Role[] }[]>`
    select u.id, u.full_name, u.email, u.phone, u.is_active, u.last_login_at, array_agg(r.role order by r.role) as roles
    from users u join user_roles r on r.user_id = u.id
    where r.role <> 'customer'
    group by u.id order by u.is_active desc, u.full_name`;
}

export async function createStaff(
  user: SessionUser | null,
  args: { fullName: string; email?: string | null; phone?: string | null; roles: Role[]; password: string },
  db: Db = sql,
) {
  requirePerm(user, 'staff.manage');
  if (!args.fullName?.trim()) throw invalid('Name is required.');
  if (!args.email?.trim() && !args.phone?.trim()) throw invalid('Provide an email or phone number to sign in with.');
  if (!args.roles.length || args.roles.some((r) => !STAFF_ROLES.includes(r))) throw invalid('Choose at least one staff role.');
  for (const r of args.roles) if (!canGrantRole(user!.roles, r)) throw forbidden(`You cannot grant the ${r} role.`);
  const pw = passwordProblems(args.password);
  if (pw) throw invalid(pw);
  const email = args.email?.trim().toLowerCase() || null;
  const phone = args.phone?.trim() ? normalizePhone(args.phone) : null;
  return tx(async (t) => {
    if (email) {
      const ex = await t`select 1 from users where lower(email) = ${email}`;
      if (ex.length) throw conflict('An account with that email already exists.');
    }
    if (phone) {
      const ex = await t`select 1 from users u join user_roles r on r.user_id = u.id where u.phone = ${phone} and r.role <> 'customer'`;
      if (ex.length) throw conflict('A staff account with that phone already exists.');
    }
    const [u] = await t<{ id: string }[]>`insert into users (email, phone, full_name, password_hash) values (${email}, ${phone}, ${args.fullName.trim()}, ${await hashPassword(args.password)}) returning id`;
    for (const r of args.roles) await t`insert into user_roles (user_id, role, granted_by) values (${u.id}, ${r}, ${user!.id})`;
    if (args.roles.includes('rider')) await t`insert into rider_profiles (user_id) values (${u.id}) on conflict do nothing`;
    await audit(t, actorOf(user), 'staff.created', 'user', u.id, { roles: args.roles, email, phone });
    return u.id;
  }, db);
}

export async function setStaffRoles(user: SessionUser | null, targetId: string, roles: Role[], db: Db = sql) {
  requirePerm(user, 'staff.manage');
  if (roles.some((r) => !STAFF_ROLES.includes(r))) throw invalid('Invalid role.');
  return tx(async (t) => {
    const current = (await t<{ role: Role }[]>`select role from user_roles where user_id = ${targetId}`).map((r) => r.role);
    if (!current.length) throw notFound('Staff member');
    const add = roles.filter((r) => !current.includes(r));
    const remove = current.filter((r) => r !== 'customer' && !roles.includes(r));
    for (const r of [...add, ...remove]) if (!canGrantRole(user!.roles, r)) throw forbidden(`You cannot change the ${r} role.`);
    if (remove.includes('owner')) {
      const [{ n }] = await t<{ n: number }[]>`select count(*)::int as n from user_roles r join users u on u.id = r.user_id where r.role = 'owner' and u.is_active`;
      if (n <= 1) throw conflict('There must always be at least one active owner.');
    }
    if (targetId === user!.id && remove.length) throw conflict('You cannot remove your own roles.');
    for (const r of add) await t`insert into user_roles (user_id, role, granted_by) values (${targetId}, ${r}, ${user!.id})`;
    if (remove.length) await t`delete from user_roles where user_id = ${targetId} and role = any(${remove}::text[])`;
    if (add.includes('rider')) await t`insert into rider_profiles (user_id) values (${targetId}) on conflict do nothing`;
    if (remove.length) await revokeAllSessionsForUser(targetId, t);
    await audit(t, actorOf(user), 'staff.roles_changed', 'user', targetId, { add, remove });
  }, db);
}

export async function setStaffActive(user: SessionUser | null, targetId: string, active: boolean, db: Db = sql) {
  requirePerm(user, 'staff.manage');
  if (targetId === user!.id) throw conflict('You cannot deactivate your own account.');
  return tx(async (t) => {
    const roles = (await t<{ role: Role }[]>`select role from user_roles where user_id = ${targetId}`).map((r) => r.role);
    if (roles.includes('owner') && !user!.roles.includes('owner')) throw forbidden('Only an owner can change another owner.');
    await t`update users set is_active = ${active}, updated_at = now() where id = ${targetId}`;
    if (!active) {
      await revokeAllSessionsForUser(targetId, t);
      await t`update rider_profiles set is_on_duty = false where user_id = ${targetId}`;
    }
    await audit(t, actorOf(user), active ? 'staff.activated' : 'staff.deactivated', 'user', targetId);
  }, db);
}

export async function resetStaffPassword(user: SessionUser | null, targetId: string, newPassword: string, db: Db = sql) {
  requirePerm(user, 'staff.manage');
  const pw = passwordProblems(newPassword);
  if (pw) throw invalid(pw);
  return tx(async (t) => {
    const roles = (await t<{ role: Role }[]>`select role from user_roles where user_id = ${targetId}`).map((r) => r.role);
    if (roles.includes('owner') && !user!.roles.includes('owner')) throw forbidden('Only an owner can reset an owner password.');
    await t`update users set password_hash = ${await hashPassword(newPassword)}, failed_login_count = 0, locked_until = null where id = ${targetId}`;
    await revokeAllSessionsForUser(targetId, t);
    await audit(t, actorOf(user), 'staff.password_reset', 'user', targetId);
  }, db);
}

export async function changeOwnPassword(user: SessionUser | null, current: string, next: string, db: Db = sql) {
  if (!user) throw forbidden();
  const { verifyPassword } = await import('./auth/password');
  const [u] = await db<{ passwordHash: string | null }[]>`select password_hash from users where id = ${user.id}`;
  if (!(await verifyPassword(current, u?.passwordHash))) throw invalid('Current password is incorrect.');
  const pw = passwordProblems(next);
  if (pw) throw invalid(pw);
  await tx(async (t) => {
    await t`update users set password_hash = ${await hashPassword(next)} where id = ${user.id}`;
    await t`update sessions set revoked_at = now() where user_id = ${user.id} and id <> ${user.sessionId} and revoked_at is null`;
    await audit(t, actorOf(user), 'user.password_changed', 'user', user.id);
  }, db);
}

/** Customer self-registration (optional accounts). */
export async function registerCustomer(
  args: { fullName: string; email: string; phone: string; password: string },
  meta: { ip?: string | null; userAgent?: string | null },
  db: Db = sql,
) {
  await enforceRateLimit(`register:ip:${meta.ip ?? 'unknown'}`, 5, 60 * 60, db);
  if (!args.fullName?.trim() || args.fullName.length > 80) throw invalid('Enter your name.');
  const email = args.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw invalid('Enter a valid email.');
  const pw = passwordProblems(args.password);
  if (pw) throw invalid(pw);
  const phone = normalizePhone(args.phone ?? '');
  if (!/^\+233\d{9}$/.test(phone)) throw invalid('Enter a valid Ghana phone number.');
  return tx(async (t) => {
    const ex = await t`select 1 from users where lower(email) = ${email}`;
    if (ex.length) throw conflict('An account with that email already exists. Try signing in.');
    const [u] = await t<{ id: string }[]>`insert into users (email, phone, full_name, password_hash) values (${email}, ${phone}, ${args.fullName.trim()}, ${await hashPassword(args.password)}) returning id`;
    await t`insert into user_roles (user_id, role) values (${u.id}, 'customer')`;
    await t`insert into customer_profiles (user_id) values (${u.id})`;
    // Link earlier guest orders placed with the same phone AND email (both must match).
    await t`update orders set customer_user_id = ${u.id} where customer_user_id is null and customer_phone = ${phone} and lower(customer_email) = ${email}`;
    const s = await createSession(u.id, meta, t);
    return { userId: u.id, ...s };
  }, db);
}
