/**
 * Applies SQL migrations in db/migrations in filename order. Each migration runs in its own
 * transaction and is recorded in schema_migrations (with a checksum to detect edited files).
 * Usage: npm run db:migrate   (reads DATABASE_URL from the environment / .env)
 * Never edit a migration that has been applied to production — add a new one.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import postgres from 'postgres';
import { loadDotEnv } from './load-env';

export async function migrate(databaseUrl: string, opts: { quiet?: boolean } = {}) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {}, ssl: process.env.DATABASE_SSL === 'require' ? 'require' : undefined });
  const say = (m: string) => !opts.quiet && console.log(m);
  try {
    await sql`select pg_advisory_lock(727274)`;
    await sql`create table if not exists schema_migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())`;
    const applied = new Map((await sql<{ name: string; checksum: string }[]>`select name, checksum from schema_migrations`).map((r) => [r.name, r.checksum]));
    const dir = join(process.cwd(), 'db', 'migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    let count = 0;
    for (const f of files) {
      const body = readFileSync(join(dir, f), 'utf8');
      const sum = createHash('sha256').update(body).digest('hex');
      if (applied.has(f)) {
        if (applied.get(f) !== sum) throw new Error(`Migration ${f} was modified after being applied. Create a new migration instead.`);
        continue;
      }
      say(`→ applying ${f}`);
      await sql.begin(async (t) => {
        await t.unsafe(body);
        await t`insert into schema_migrations (name, checksum) values (${f}, ${sum})`;
      });
      count++;
    }
    say(count ? `✓ ${count} migration(s) applied` : '✓ database is up to date');
  } finally {
    await sql`select pg_advisory_unlock(727274)`.catch(() => {});
    await sql.end({ timeout: 5 });
  }
}

const isMain = process.argv[1] && /migrate\.ts$/.test(process.argv[1]);
if (isMain) {
  loadDotEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set (copy .env.example to .env.local and fill it in).');
    process.exit(1);
  }
  migrate(url).catch((e) => {
    console.error('Migration failed:', e.message);
    process.exit(1);
  });
}
