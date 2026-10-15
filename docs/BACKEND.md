# Separate backend, WebSockets and Tailwind

The platform now has three moving parts:

| Part | Folder | Default port | Run with |
|------|--------|--------------|----------|
| Frontend (Next.js) | `src/app`, `src/components` | 3001 | `npm run dev` |
| Backend (Fastify REST API + Socket.IO) | `backend/` | 4000 | `npm run backend:dev` |
| Database (PostgreSQL) | `db/migrations` | 5432 | your Postgres |

## How the split works
- The backend does **not** duplicate the API. It mounts the same Web-standard route handlers that live in
  `src/app/api/**/route.ts` (list generated into `backend/src/routes.ts`). One implementation, two ways to serve it.
- Business logic stays in `src/server` (pricing, orders, payments, dispatch, permissions). It no longer depends on Next.js:
  the signed-in user and cookies come from a per-request context (`src/server/auth/context.ts`).
- **Switch on the backend:** set `BACKEND_URL=http://localhost:4000` for the frontend (in `.env.local`) and restart `npm run dev`.
  Next.js then proxies every `/api/*` call to the backend (`next.config.mjs`). Leave it unset to keep the API inside Next.js.
- Server-rendered pages and server actions (admin forms) still talk to the database directly. Moving them behind the API is the
  next phase (see "Not done yet").

## WebSockets (Socket.IO)
- The backend serves Socket.IO at `/socket.io`. Set `NEXT_PUBLIC_SOCKET_URL=http://localhost:4000` for the frontend to use it;
  otherwise the browser uses the old Server-Sent-Events stream.
- Flow: the page asks the site for a short-lived signed ticket (`POST /api/realtime/ticket`) listing the topics the user may join,
  then connects to the socket with that ticket. A fresh ticket is fetched on every reconnect, and sockets are recycled every 30 min
  so permission changes take effect.
- Events are tiny "something changed" signals with no personal data. Screens re-fetch through the normal API (same as before).
- Fan-out comes from Postgres `LISTEN/NOTIFY`, so it needs a direct (non-pooled) database connection.

## Environment variables
| Variable | Used by | Example |
|----------|---------|---------|
| `BACKEND_URL` | frontend | `http://localhost:4000` |
| `NEXT_PUBLIC_SOCKET_URL` | frontend (browser) | `http://localhost:4000` |
| `BACKEND_PORT` | backend | `4000` (default) |
| `CORS_ORIGINS` | backend (websocket) | `http://localhost:3001` (defaults to `APP_URL`) |
| `APP_URL` | both | `http://localhost:3001` — also used for the same-origin (CSRF) check |

## Tailwind CSS (v4)
- Installed next to the existing stylesheet: `src/app/tailwind.css`. Existing styles are untouched.
- Tailwind's global reset (preflight) is **not** loaded, so nothing changes visually until a component uses utility classes.
- The old stylesheet sits in a lower CSS layer, so a utility such as `p-4` beats the old class on the same element.
- Brand colours are available as `bg-espresso`, `text-sage`, `border-line`, `text-muted`, `bg-ivory`, etc.
- Convert pages one at a time and delete the old CSS rules for them as you go.

## Not done yet (planned phases)
1. Move server-rendered pages and server actions onto the API (so the frontend no longer imports `src/server` at all).
2. Convert the storefront, then checkout/tracking, kitchen, rider and admin to Tailwind, removing old CSS as each is done.
3. Deploy the backend as its own service (Dockerfile / process manager) and run `npm run backend:routes` after adding API routes.
