import 'server-only';
import { isDomainError } from './errors';
import { log } from './log';
import type { ActionResult } from '@/lib/action-result';

function isNextControlFlow(e: unknown) {
  const d = (e as { digest?: string })?.digest;
  return typeof d === 'string' && (d.startsWith('NEXT_REDIRECT') || d.startsWith('NEXT_NOT_FOUND') || d.startsWith('NEXT_HTTP_ERROR'));
}

/** Run a server action body and convert domain errors into a result the form can display. */
export async function runAction<T>(fn: () => Promise<T | void>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, message: successMessage, data: data ?? undefined };
  } catch (e) {
    if (isNextControlFlow(e)) throw e;
    if (isDomainError(e)) {
      const details = e.details as { fieldErrors?: Record<string, string[]> } | undefined;
      return { ok: false, error: e.message, fieldErrors: details?.fieldErrors };
    }
    log.error('server_action_failed', { error: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) });
    return { ok: false, error: 'Something went wrong. Nothing was changed — please try again.' };
  }
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
export const optStr = (fd: FormData, k: string) => str(fd, k) || null;
export const bool = (fd: FormData, k: string) => fd.get(k) === 'on' || fd.get(k) === 'true';
export const int = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};
