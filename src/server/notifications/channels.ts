import 'server-only';
import { env } from '../env';
import { log } from '../log';

export interface SendResult {
  status: 'sent' | 'skipped';
  providerRef?: string;
  detail?: string;
}

/**
 * SMS channel adapter.
 *  - log:    development — writes the message to the server log, nothing is sent.
 *  - hubtel: Hubtel Quick Send SMS API. IMPLEMENTED FROM PUBLIC DOCS BUT NOT VERIFIED
 *            (no credentials were available). Verify against Hubtel's current docs before launch.
 *  - none:   disabled.
 */
export async function sendSms(to: string, message: string): Promise<SendResult> {
  const e = env();
  switch (e.NOTIFY_SMS_PROVIDER) {
    case 'none':
      return { status: 'skipped', detail: 'sms disabled' };
    case 'log':
      log.info('sms_dev_log', { to: maskPhone(to), message });
      return { status: 'skipped', detail: 'dev log driver (not sent)' };
    case 'hubtel': {
      if (!e.HUBTEL_SMS_CLIENT_ID || !e.HUBTEL_SMS_CLIENT_SECRET || !e.HUBTEL_SMS_SENDER) {
        throw new Error('Hubtel SMS credentials are not configured');
      }
      const url = new URL('https://smsc.hubtel.com/v1/messages/send');
      url.searchParams.set('clientid', e.HUBTEL_SMS_CLIENT_ID);
      url.searchParams.set('clientsecret', e.HUBTEL_SMS_CLIENT_SECRET);
      url.searchParams.set('from', e.HUBTEL_SMS_SENDER);
      url.searchParams.set('to', to.replace(/^\+/, ''));
      url.searchParams.set('content', message);
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      if (!res.ok) throw new Error(`Hubtel SMS failed: HTTP ${res.status} ${text.slice(0, 200)}`);
      let ref: string | undefined;
      try {
        ref = JSON.parse(text)?.messageId;
      } catch {
        /* ignore */
      }
      return { status: 'sent', providerRef: ref };
    }
  }
}

/**
 * Email channel adapter.
 *  - log:    development — logged only.
 *  - resend: Resend HTTP API (https://resend.com/docs). Not verified without credentials.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  const e = env();
  switch (e.NOTIFY_EMAIL_PROVIDER) {
    case 'none':
      return { status: 'skipped', detail: 'email disabled' };
    case 'log':
      log.info('email_dev_log', { to: maskEmail(to), subject });
      return { status: 'skipped', detail: 'dev log driver (not sent)' };
    case 'resend': {
      if (!e.RESEND_API_KEY || !e.EMAIL_FROM) throw new Error('Resend credentials are not configured');
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: e.EMAIL_FROM, to: [to], subject, text }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Resend failed: HTTP ${res.status}`);
      return { status: 'sent', providerRef: (body as { id?: string }).id };
    }
  }
}

export function maskPhone(p: string) {
  return p.length > 6 ? `${p.slice(0, 4)}•••${p.slice(-3)}` : '•••';
}
export function maskEmail(e: string) {
  const [u, d] = e.split('@');
  return d ? `${u.slice(0, 2)}•••@${d}` : '•••';
}
