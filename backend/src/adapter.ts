import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requestContext, serializeSetCookie, type RequestContext } from '@/server/auth/context';
import { detectPortal } from '@/server/portal';

type Params = Record<string, string>;
type WebHandler = (req: Request, ctx: { params: Promise<Params> }) => Promise<Response> | Response;
export type RouteModule = Partial<Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', WebHandler>>;

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

const PORTAL_HOSTS = {
  admin: process.env.ADMIN_HOST,
  kitchen: process.env.KITCHEN_HOST,
  rider: process.env.RIDER_HOST,
};

function toWebRequest(req: FastifyRequest, reply: FastifyReply): { request: Request; ctx: RequestContext } {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0].trim() || req.protocol;
  const publicHost = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0].trim() || String(req.headers.host ?? 'localhost');
  const url = new URL(req.raw.url ?? '/', `${proto}://${publicHost}`);

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else headers.set(k, v);
  }
  // Always overwrite any client-supplied portal tag (same rule as the Next.js middleware).
  headers.set(
    'x-bs-portal',
    detectPortal({
      host: url.hostname.toLowerCase(),
      path: url.pathname,
      referer: typeof req.headers.referer === 'string' ? req.headers.referer : null,
      publicHost,
      hosts: PORTAL_HOSTS,
    }),
  );

  const ac = new AbortController();
  reply.raw.on('close', () => {
    if (!reply.raw.writableEnded) ac.abort();
  });

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && Buffer.isBuffer(req.body) && (req.body as Buffer).length > 0;
  const request = new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? new Uint8Array(req.body as Buffer) : undefined,
    signal: ac.signal,
  });
  return { request, ctx: { headers, setCookies: [] } };
}

async function sendWebResponse(reply: FastifyReply, res: Response, ctx: RequestContext) {
  reply.status(res.status);
  reply.header('x-served-by', 'bite-and-sips-backend');
  res.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
  });
  const cookies = [...res.headers.getSetCookie(), ...ctx.setCookies.map(serializeSetCookie)];
  if (cookies.length) reply.header('set-cookie', cookies);
  if (!res.body) return reply.send();
  const isStream = (res.headers.get('content-type') ?? '').includes('text/event-stream');
  if (isStream) return reply.send(Readable.fromWeb(res.body as never));
  return reply.send(Buffer.from(await res.arrayBuffer()));
}

/** Mounts a Web-standard route module (the same files Next.js serves) on a Fastify path. */
export function mountRoute(app: FastifyInstance, path: string, mod: RouteModule) {
  for (const method of METHODS) {
    const fn = mod[method];
    if (!fn) continue;
    app.route({
      method,
      url: path,
      handler: async (req, reply) => {
        const { request, ctx } = toWebRequest(req, reply);
        const res = await requestContext.run(ctx, async () => fn(request, { params: Promise.resolve((req.params ?? {}) as Params) }));
        return sendWebResponse(reply, res, ctx);
      },
    });
  }
}
