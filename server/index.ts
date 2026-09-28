import express from 'express';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Server } from 'socket.io';
import * as db from './db';
import { Arena, CONFIG } from './arena';
import { validateProfile } from './validate';
import type { Ack, AdminAction, SubmitPayload } from '../shared/protocol';

const PORT = Number(process.env.PORT || 3000);
const EVENT_NAME = process.env.EVENT_NAME || "Freshers' Orientation";
const PUBLIC_URL = process.env.PUBLIC_URL || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || randomBytes(9).toString('base64url');
if (!process.env.ADMIN_TOKEN) console.warn(`ADMIN_TOKEN not set. Generated one for this run: ${ADMIN_TOKEN}`);

const isAdmin = (token: unknown) => {
  if (typeof token !== 'string') return false;
  const a = Buffer.from(token);
  const b = Buffer.from(ADMIN_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
};

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 512 * 1024, serveClient: false });
const arena = new Arena(io, EVENT_NAME, PUBLIC_URL);

// ---------- REST ----------

const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();

app.get('/api/health', (req, res) => {
  const body: Record<string, unknown> = { ok: true, phase: arena.phase, mode: arena.mode, online: io.engine.clientsCount };
  if (req.query.metrics !== undefined) {
    body.eventLoopMs = { p50: loopDelay.percentile(50) / 1e6, p99: loopDelay.percentile(99) / 1e6, max: loopDelay.max / 1e6 };
    body.rssMb = Math.round(process.memoryUsage().rss / 1e6);
    if (req.query.reset !== undefined) loopDelay.reset();
  }
  res.json(body);
});

app.post('/api/register', (req, res) => {
  const v = validateProfile(req.body ?? {});
  if (!v.ok) return res.status(400).json({ error: v.error });
  const { roll, name, username } = v.value;
  const result = db.registerUser(roll, name, username);
  if (!result.ok) return res.status(409).json({ error: result.error });
  arena.onRegistered();
  res.json({ me: result.me, token: result.token });
});

app.get('/api/me', (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
  const me = token && db.userByToken(token);
  if (!me) return res.status(401).json({ error: 'Not registered' });
  res.json({ me: { id: me.id, roll: me.roll, name: me.name, username: me.username } });
});

const csv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
};

app.get('/api/admin/export/:kind', (req, res) => {
  if (!isAdmin(req.headers['x-admin-token'])) return res.status(401).json({ error: 'Bad admin token' });
  const iso = (r: any) => ({ ...r, created_at: new Date(r.created_at).toISOString() });
  const rows =
    req.params.kind === 'final'
      ? db.finalRows().map(({ user_id: _id, ...r }, i) => ({ rank: i + 1, ...iso(r) }))
      : req.params.kind === 'final-archive'
        ? db.finalArchivedRows().map(iso)
        : db.bestPerUser();
  res.type('text/csv').send(csv(rows));
});

// ---------- static client ----------

const clientDir = join(import.meta.dirname, 'client');
if (existsSync(clientDir)) {
  app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => res.sendFile(join(clientDir, 'index.html')));
}

// ---------- realtime ----------

io.use((socket, next) => {
  const auth = socket.handshake.auth ?? {};
  if (auth.admin !== undefined) {
    if (!isAdmin(auth.admin)) return next(new Error('bad admin token'));
    socket.data.admin = true;
  } else if (auth.screen) {
    socket.data.screen = true;
  } else if (typeof auth.token === 'string' && auth.token) {
    const user = db.userByToken(auth.token);
    if (!user) return next(new Error('not registered'));
    socket.data.user = user;
  }
  next();
});

io.on('connection', (socket) => {
  const user = socket.data.user as ReturnType<typeof db.userByToken>;
  if (user) socket.join(`user:${user.id}`);
  // The projector and organizers see the final's standings before the podium reveal; players don't.
  const audience = socket.data.admin || socket.data.screen ? 'full' : 'public';
  socket.join(audience);
  socket.emit('state', arena.state(audience));
  if (user) {
    // A reloaded page learns about an attempt already in progress, or gets its result back.
    if (arena.hasOpenAttempt(user.id)) socket.emit('attempt_locked', { roundId: arena.round!.id });
    const mine = arena.myResult(user.id);
    if (mine) socket.emit('my_result', mine);
  }

  socket.on('start', (payload, ack: (r: Ack<null>) => void) => {
    if (typeof ack !== 'function') return;
    if (!user) return ack({ ok: false, error: 'Not registered' });
    ack(arena.onStart(user, payload));
  });

  socket.on('time', (ack: unknown) => typeof ack === 'function' && ack(Date.now()));

  let lastProgress = 0;
  socket.on('progress', (payload) => {
    const now = Date.now();
    if (!user || now - lastProgress < 400) return;
    lastProgress = now;
    arena.onProgress(user, payload);
  });

  socket.on('submit', (payload: SubmitPayload, ack: (r: Ack<unknown>) => void) => {
    if (typeof ack !== 'function') return;
    if (!user) return ack({ ok: false, error: 'Not registered' });
    try {
      const result = arena.onSubmit(user, payload);
      if (process.env.LOG_SUBMISSIONS) console.log(`[submit] ${user.username} keys=${payload?.keys?.length} ->`, JSON.stringify(result));
      ack(result);
      if (result.ok) arena.maybeCloseEarly();
    } catch (err) {
      console.error('submit failed', err);
      ack({ ok: false, error: 'Server error while scoring.' });
    }
  });

  socket.on('admin', (action: AdminAction, ack: (r: Ack<unknown>) => void) => {
    if (typeof ack !== 'function') return;
    if (!socket.data.admin) return ack({ ok: false, error: 'Not an admin' });
    console.log(`[admin] ${action?.type}`);
    ack(arena.admin(action));
  });
});

server.listen(PORT, () => {
  console.log(`TypeFlow listening on :${PORT} (round ${CONFIG.durationMs / 1000}s)`);
  arena.startRolling();
});

const shutdown = () => {
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
