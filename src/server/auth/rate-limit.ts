import 'server-only';
import { sql, type Db } from '../db';
import { rateLimited } from '../errors';

/**
 * Fixed-window rate limiter backed by Postgres, so limits hold across multiple server
 * instances. Atomic via INSERT … ON CONFLICT.
 */
export async function hitRateLimit(key: string, limit: number, windowSeconds: number, db: Db = sql): Promise<{ allowed: boolean; count: number }> {
  const rows = await db<{ count: number }[]>`
    insert into rate_limits (key, window_start, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
    returning count`;
  const count = rows[0].count;
  return { allowed: count <= limit, count };
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number, db: Db = sql): Promise<void> {
  const r = await hitRateLimit(key, limit, windowSeconds, db);
  if (!r.allowed) throw rateLimited();
}

export async function purgeRateLimits(db: Db = sql) {
  await db`delete from rate_limits where window_start < now() - interval '1 day'`;
}
