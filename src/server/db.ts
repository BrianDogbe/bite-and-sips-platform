import 'server-only';
import postgres from 'postgres';
import { env } from './env';

export type Sql = postgres.Sql<Record<string, unknown>>;
/** Either the pool or a transaction handle — services accept both. */
export type Db = postgres.Sql<Record<string, unknown>> | postgres.TransactionSql<Record<string, unknown>>;

const globalForDb = globalThis as unknown as { __bsSql?: Sql };

function create(): Sql {
  const e = env();
  return postgres(e.DATABASE_URL, {
    max: e.DATABASE_POOL_MAX,
    ssl: e.DATABASE_SSL === 'disable' ? false : e.DATABASE_SSL === 'require' ? 'require' : 'prefer',
    idle_timeout: 30,
    connect_timeout: 15,
    // snake_case columns <-> camelCase JS properties
    transform: postgres.camel,
    // Return NUMERIC as string (we convert explicitly) and BIGINT ids as string.
    onnotice: () => {},
    connection: { application_name: 'bite-and-sips', TimeZone: 'UTC' },
  }) as unknown as Sql;
}

/** Lazily created singleton connection pool (survives Next.js dev hot reloads). */
export function getSql(): Sql {
  if (!globalForDb.__bsSql) globalForDb.__bsSql = create();
  return globalForDb.__bsSql;
}

/** Proxy so modules can `import { sql }` without forcing a connection at import time. */
export const sql: Sql = new Proxy(function () {} as unknown as Sql, {
  apply(_t, _this, args) {
    return (getSql() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_t, prop) {
    const real = getSql() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

/** Run `fn` inside a transaction. If `db` is already a transaction, reuse it (savepoint-free nesting). */
export async function tx<T>(fn: (t: postgres.TransactionSql<Record<string, unknown>>) => Promise<T>, db?: Db): Promise<T> {
  if (db && isTransaction(db)) return fn(db as postgres.TransactionSql<Record<string, unknown>>);
  return (getSql().begin(fn as never) as unknown) as Promise<T>;
}

function isTransaction(db: Db): boolean {
  // TransactionSql has `savepoint`; the root Sql has `begin`.
  return typeof (db as { savepoint?: unknown }).savepoint === 'function';
}

/** Publish a lightweight realtime signal. Delivered to listeners on COMMIT. Carries no personal data. */
export async function notifyChange(db: Db, payload: { topic: string; id?: string; kind?: string }) {
  await db`select pg_notify('bs_events', ${JSON.stringify(payload)})`;
}

export async function closeSql() {
  if (globalForDb.__bsSql) {
    await globalForDb.__bsSql.end({ timeout: 5 });
    globalForDb.__bsSql = undefined;
  }
}
