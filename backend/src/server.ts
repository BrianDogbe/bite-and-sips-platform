import Fastify from 'fastify';
import { env } from '@/server/env';
import { sql } from '@/server/db';
import { log } from '@/server/log';
import { mountRoute } from './adapter';
import { ROUTES } from './routes';
import { attachRealtime } from './socket';

/**
 * Bite & Sips backend: REST API + WebSocket realtime, as its own process.
 * It serves the exact same route handlers the Next.js app contains (src/app/api), so there is one implementation.
 * The Next.js site proxies /api/* here when BACKEND_URL is set (see next.config.mjs).
 */
async function main() {
  const e = env();
  const port = Number(process.env.BACKEND_PORT ?? 4000);
  const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024, trustProxy: false });

  // Hand the raw body to the Web `Request` untouched (JSON, multipart uploads, webhooks that verify signatures).
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  app.get('/health', async () => {
    await sql`select 1`;
    return { ok: true };
  });

  for (const [path, mod] of ROUTES) mountRoute(app, path, mod);

  app.setErrorHandler((err, _req, reply) => {
    log.error('backend_error', { error: String(err) });
    reply.status(500).send({ error: { code: 'server_error', message: 'Something went wrong on our side. Please try again.' } });
  });

  const origins = (process.env.CORS_ORIGINS ?? e.APP_URL).split(',').map((s) => s.trim()).filter(Boolean);
  await app.ready();
  await attachRealtime(app.server, origins);
  await app.listen({ port, host: '0.0.0.0' });
  log.info('backend_listening', { port });

  const stop = async () => {
    await app.close();
    await sql.end({ timeout: 5 });
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
