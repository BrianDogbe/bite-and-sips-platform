import 'server-only';
import { EventEmitter } from 'node:events';
import { getSql } from './db';
import { log } from './log';

/**
 * Realtime fan-out. One Postgres LISTEN per server process (channel `bs_events`); events are
 * lightweight "something changed" signals ({topic, id?}) with no personal data. Screens react by
 * re-fetching their state through normal authorised endpoints, which also makes reconnection
 * recovery trivial (refetch on reconnect) and prevents duplicate tickets.
 *
 * NOTE: LISTEN needs a direct/session-mode Postgres connection (on Supabase use the session
 * pooler or direct connection string, not the transaction pooler).
 */
const g = globalThis as unknown as { __bsBus?: EventEmitter; __bsListening?: Promise<void> | null };

export function bus(): EventEmitter {
  if (!g.__bsBus) {
    g.__bsBus = new EventEmitter();
    g.__bsBus.setMaxListeners(1000);
  }
  return g.__bsBus;
}

export function ensureListening(): Promise<void> {
  if (!g.__bsListening) {
    g.__bsListening = getSql()
      .listen(
        'bs_events',
        (payload) => {
          try {
            const msg = JSON.parse(payload) as { topic: string; id?: string; kind?: string };
            bus().emit('event', msg);
          } catch {
            /* ignore malformed */
          }
        },
        () => log.info('realtime_listening'),
      )
      .then(() => undefined)
      .catch((e) => {
        log.error('realtime_listen_failed', { error: String(e) });
        g.__bsListening = null;
        throw e;
      });
  }
  return g.__bsListening;
}
