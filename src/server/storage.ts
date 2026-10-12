import 'server-only';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { invalid } from './errors';

/**
 * Image storage for menu photos. Default: local disk (UPLOAD_DIR, default ./storage/uploads),
 * served by /media/*. On hosts without a persistent disk (e.g. serverless), replace this module
 * with an object-storage adapter (Supabase Storage / S3 / R2) — see docs/DEPLOYMENT.md.
 */
const MAX_BYTES = 3 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function uploadDir() {
  return resolve(process.env.UPLOAD_DIR || join(process.cwd(), 'storage', 'uploads'));
}

function sniff(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export async function saveImage(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw invalid('Images must be 3 MB or smaller.');
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf); // trust the bytes, not the browser-supplied type
  if (!type) throw invalid('Upload a JPEG, PNG or WebP image.');
  const name = `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}.${TYPES[type]}`;
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), buf, { flag: 'wx' });
  return `/media/${name}`;
}

export async function readImage(name: string): Promise<{ body: Buffer; type: string } | null> {
  if (!/^[a-z0-9]+-[a-f0-9]{16}\.(jpg|png|webp)$/.test(name)) return null;
  const dir = uploadDir();
  const p = resolve(dir, name);
  if (!p.startsWith(dir + sep)) return null;
  try {
    await stat(p);
    const body = await readFile(p);
    const ext = name.split('.').pop()!;
    return { body, type: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` };
  } catch {
    return null;
  }
}
