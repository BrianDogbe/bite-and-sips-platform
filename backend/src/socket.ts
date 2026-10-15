import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { bus, ensureListening } from '@/server/realtime';
import { verifyTicket } from '@/server/realtime-auth';
import { log } from '@/server/log';

/** Sockets are dropped after this long so the browser reconnects with a fresh ticket (re-checks the user's permissions). */
const MAX_SOCKET_AGE_MS = 30 * 60 * 1000;

/**
 * WebSocket (Socket.IO) change signals. Same model as the old SSE stream: tiny "something changed" events with no personal
 * data; clients re-fetch through the authorised HTTP API. A client joins only the topics named in its signed ticket.
 */
export async function attachRealtime(server: HttpServer, allowedOrigins: string[]) {
  const io = new Server(server, {
    path: '/socket.io',
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
    serveClient: false,
    maxHttpBufferSize: 10_000,
  });

  io.use((socket, next) => {
    const auth = socket.handshake.auth as { ticket?: unknown } | undefined;
    const topics = verifyTicket(auth?.ticket);
    if (!topics) return next(new Error('unauthorized'));
    socket.data.topics = topics;
    next();
  });

  io.on('connection', (socket) => {
    const topics = socket.data.topics as string[];
    topics.forEach((t) => void socket.join(t));
    socket.emit('ready', { topics: topics.map((t) => t.split(':')[0]) });
    const timer = setTimeout(() => socket.disconnect(true), MAX_SOCKET_AGE_MS);
    socket.on('disconnect', () => clearTimeout(timer));
  });

  await ensureListening();
  bus().on('event', (msg: { topic: string; kind?: string }) => {
    io.to(msg.topic).emit('change', { topic: msg.topic.split(':')[0], kind: msg.kind ?? null });
  });
  log.info('socketio_ready', { origins: allowedOrigins });
  return io;
}
