/**
 * Create (or promote) the first owner account.
 * Usage: npm run db:create-owner -- --email you@example.com --name "Your Name" [--phone 024...]
 * You will be prompted for a password (min 10 characters). Not echoed to logs.
 */
import postgres from 'postgres';
import { scryptSync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { loadDotEnv } from './load-env';

loadDotEnv();
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

function hash(pw: string) {
  const logN = 17;
  const N = 2 ** logN;
  const salt = randomBytes(16);
  const key = scryptSync(pw.normalize('NFKC'), salt, 64, { N, r: 8, p: 1, maxmem: 256 * N * 8 });
  return `scrypt$${logN}$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

function ask(q: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => (rl.close(), res(a))));
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const name = arg('name')?.trim();
  const phoneRaw = arg('phone');
  if (!email || !name) {
    console.error('Usage: npm run db:create-owner -- --email you@example.com --name "Your Name" [--phone 0241234567]');
    process.exit(1);
  }
  const password = process.env.OWNER_PASSWORD || (await ask('Password (min 10 chars): '));
  if (password.length < 10) {
    console.error('Password must be at least 10 characters.');
    process.exit(1);
  }
  let phone: string | null = null;
  if (phoneRaw) {
    const d = phoneRaw.replace(/[^\d+]/g, '');
    phone = /^0\d{9}$/.test(d) ? `+233${d.slice(1)}` : d;
  }
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (t) => {
      const [existing] = await t<{ id: string }[]>`select id from users where lower(email) = ${email}`;
      let id = existing?.id;
      if (id) {
        await t`update users set password_hash = ${hash(password)}, full_name = ${name}, is_active = true where id = ${id}`;
      } else {
        const [u] = await t<{ id: string }[]>`insert into users (email, phone, full_name, password_hash) values (${email}, ${phone}, ${name}, ${hash(password)}) returning id`;
        id = u.id;
      }
      await t`insert into user_roles (user_id, role) values (${id}, 'owner') on conflict do nothing`;
      await t`insert into audit_events (actor_label, action, entity_type, entity_id) values ('cli', 'staff.owner_created', 'user', ${id})`;
    });
    console.log(`✓ Owner account ready: ${email}. Sign in at /admin/login`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
