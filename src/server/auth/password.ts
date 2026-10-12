import 'server-only';
import { scrypt, randomBytes, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with Node's built-in scrypt (memory-hard KDF; no native add-ons needed).
 * Parameters follow OWASP guidance (N=2^17, r=8, p=1). Tests may lower the cost via SCRYPT_COST.
 * Stored format: scrypt$<logN>$<r>$<p>$<saltB64>$<hashB64>
 */
const KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

function defaultLogN(): number {
  const override = Number(process.env.SCRYPT_COST);
  if (Number.isInteger(override) && override >= 10 && override <= 20) return override;
  return 17;
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) throw new Error('Password too short');
  const logN = defaultLogN();
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const N = 2 ** logN;
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEYLEN, { N, r, p, maxmem: 256 * N * r });
  return `scrypt$${logN}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    // Spend comparable time so missing accounts are not distinguishable by timing.
    await hashPassword('timing-equaliser-password').catch(() => {});
    return false;
  }
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, logNs, rs, ps, saltB64, hashB64] = parts;
  const N = 2 ** Number(logNs);
  const r = Number(rs);
  const p = Number(ps);
  const expected = Buffer.from(hashB64, 'base64');
  const key = await scryptAsync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N,
    r,
    p,
    maxmem: 256 * N * r,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function passwordProblems(pw: string): string | null {
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 200) return 'Password is too long.';
  if (/^(.)\1+$/.test(pw)) return 'Password is too simple.';
  return null;
}
